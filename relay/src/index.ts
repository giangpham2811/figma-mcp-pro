/**
 * The relay Worker: a remote MCP server Claude Cowork can reach.
 *
 * Why this exists at all: Cowork runs in Anthropic's cloud. It cannot spawn
 * a stdio process on the user's machine and cannot see their localhost, so
 * the local bridge — the whole architecture this repo is built on — is
 * unreachable from it. A custom connector over Streamable HTTP is the one
 * door Cowork leaves open, and this is what stands behind it.
 *
 * What runs here and what does not, and the line is not arbitrary:
 *
 *   Runs: every diagram kind. The nine runners in src/server/<kind>.ts
 *   depend on src/shared + zod and nothing else — no fs, no vm, no
 *   worker_threads — so they lift onto Workers unchanged. That is not luck;
 *   it is the shared/server split the repo already had.
 *
 *   Does not: figma_write. It executes caller-supplied JavaScript in a Node
 *   `vm` inside a worker_thread, and Workers has neither. Shimming it would
 *   mean running untrusted code in the same isolate as the relay, which is
 *   a far worse idea than not offering it. Non-technical users on Cowork
 *   want diagrams, not a JS sandbox — and anyone who wants the sandbox can
 *   use Claude Code, where it already works.
 *
 * Addressing: one room per Figma window. The user pastes
 * https://<host>/mcp/<roomId> into Cowork, and that id is the only secret
 * on the Cowork side — Cowork calls server-to-server, with no browser and
 * nobody to log in, so that path cannot be put behind a login.
 *
 * Which is exactly why the id is not handed out casually. A room is created
 * by PAIRING: the plugin asks for a short code, a human opens /login behind
 * Cloudflare Access, Access verifies their identity against a company email
 * domain, and only then does the plugin receive the room id. So the chain
 * is: verified human → room id → Cowork. See pairing.ts.
 *
 * WORKSPACE_KEY remains as the alternative for teams with no Access
 * tenant: one shared secret, no identity, no audit trail. Weaker, and
 * honest about being weaker.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { runUserflow } from "../../src/server/userflow.js";
import { runActivity } from "../../src/server/activity.js";
import { runErd } from "../../src/server/erd.js";
import { runSequence } from "../../src/server/sequence.js";
import { runState } from "../../src/server/state.js";
import { runSitemap } from "../../src/server/sitemap.js";
import { runPersona } from "../../src/server/persona.js";
import { runJourney } from "../../src/server/journey.js";
import { runUseCase } from "../../src/server/usecase.js";
import { validateOperation } from "../../src/server/validate.js";
import { getDoc, DOC_SECTION_NAMES } from "../../src/server/docs-content/index.js";
import { READ_OPERATIONS, type AnyOperation } from "../../src/shared/protocol.js";

import {
  humanCode,
  secret,
  requireAccess,
  presentedKey,
  keyMatches,
  pairedPage,
  PAIR_TTL_MS,
  CODE_TTL_MS,
  type Pair,
} from "./pairing.js";

export { FigmaRoom } from "./room.js";

export interface Env {
  FIGMA_ROOM: DurableObjectNamespace;
  /** Pairing attempts, keyed by code. Short TTL — see PAIR_TTL_MS. */
  PAIRS: KVNamespace;
  /**
   * Comma-separated email domains allowed to pair, e.g.
   * "ikameglobal.com,partner.com". Empty means any address Access let
   * through, which is only safe if the Access policy is already narrow.
   */
  ALLOWED_EMAIL_DOMAINS?: string;
  /**
   * Shared secret that closes /mcp to everyone who has not been given it.
   *
   * Set it with `wrangler secret put WORKSPACE_KEY` — never in
   * wrangler.jsonc, which is committed.
   *
   * Unset means an open relay, which is a defensible choice for a private
   * deployment nobody has the hostname for, and an indefensible one for a
   * host published in a public README. See the gate on /mcp below.
   */
  WORKSPACE_KEY?: string;
}

const ROOM_ID = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * The room object that is not a room: one fixed-name instance used only to
 * count pairing-code guesses. Fixed name means one instance worldwide,
 * which is the whole point — see FigmaRoom's /guess handler.
 *
 * Not a room id a caller could ever reach: /pair/start mints 48-character
 * hex, and ROOM_ID would accept this string, but nothing routes a URL here.
 */
const PAIR_GUARD = "pair-guard";

/**
 * `*` rather than an allowlist because the caller is a sandboxed iframe
 * whose Origin is the literal string "null" — there is no origin to name.
 * Safe here for the same reason it would be unsafe on /mcp: these two
 * endpoints hand out a brand-new empty room, which is worth nothing until
 * a plugin attaches to it from the machine that asked.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function room(env: Env, id: string): DurableObjectStub {
  return env.FIGMA_ROOM.get(env.FIGMA_ROOM.idFromName(id));
}

/** Call one plugin op through the room. */
async function callRoom(
  env: Env,
  roomId: string,
  op: AnyOperation,
  params: Record<string, unknown>,
): Promise<unknown> {
  // Validate here, exactly as the stdio server does. This is the one choke
  // point on this path, and skipping it would be the same bypass bug
  // ARCHITECTURE.md records fixing on the follower path.
  const checked = validateOperation(op, params);
  const res = await room(env, roomId).fetch("https://room/op", {
    method: "POST",
    body: JSON.stringify({ op: checked.op, params: checked.params }),
  });
  const body = (await res.json()) as { ok: boolean; result?: unknown; error?: { message: string } };
  if (!body.ok) throw new Error(body.error?.message ?? "room error");
  return body.result;
}

const DIAGRAM_KINDS = [
  "activity",
  "erd",
  "journey",
  "persona",
  "sequence",
  "sitemap",
  "state",
  "usecase",
  "userflow",
] as const;

/**
 * Resolve which Figma window a call means.
 *
 * `pinned` is a room baked into the URL. Otherwise the model passes the
 * room it got back from figma_pair — which means the conversation carries
 * the binding, not the server. No session store, no expiry to get wrong,
 * and it survives the relay being stateless across colos, which a
 * server-side session would not.
 *
 * The cost is that the model has to keep passing it. The tool descriptions
 * say so, and the error below is written to be actionable rather than
 * merely correct: it tells the agent exactly what to ask the human for.
 */
function resolveRoom(pinned: string, passed?: string): string {
  const room = pinned || (passed ?? "").trim();
  if (!room) {
    throw new Error(
      "Chưa biết vẽ vào cửa sổ Figma nào. Hỏi người dùng mã 6 ký tự đang hiện trong plugin (ví dụ K7P2WQ), gọi figma_pair với mã đó, rồi truyền `room` nhận được vào mọi lời gọi sau.",
    );
  }
  return room;
}

function buildServer(env: Env, pinnedRoom: string, clientIp: string): McpServer {
  const server = new McpServer(
    { name: "figjam-pro", version: "0.3.0" },
    {
      instructions: [
        "Vẽ sơ đồ nghiệp vụ lên canvas Figma hoặc FigJam, thông qua plugin mà người dùng đang chạy.",
        "BẮT ĐẦU: nếu chưa có `room`, hỏi người dùng mã 6 ký tự đang hiện trong plugin rồi gọi figma_pair. Truyền `room` nhận được vào mọi lời gọi sau trong cuộc trò chuyện này.",
        "Sau đó gọi figma_status. Nếu chưa có plugin nào kết nối, bảo người dùng mở file trong Figma bản cài máy và chạy plugin — đừng đoán, đừng thử lại.",
        "Mỗi lần vẽ đều trả về phát hiện về MODEL (một use case không ai khởi động được, một giai đoạn không ai phục vụ). Những phát hiện đó mới là thứ đáng giá — hãy đọc chúng ra cho người dùng, đừng chỉ báo là đã vẽ xong.",
      ].join(" "),
    },
  );

  server.tool(
    "figma_pair",
    "Nối phiên này với cửa sổ Figma đang mở. Người dùng đọc mã 6 ký tự hiện trong plugin; gọi tool này với mã đó, rồi truyền `room` trả về vào MỌI lời gọi sau. Chỉ cần làm một lần cho mỗi cuộc trò chuyện.",
    { code: z.string().min(4).max(12) },
    async ({ code }) => {
      // Guess-rate, not request-rate. The code is six characters from a
      // 31-letter alphabet — about 887 million combinations — which sounds
      // like plenty until you notice that nothing else here charges for a
      // wrong guess. Grinding live codes is the only route to somebody
      // else's canvas that does not also need the workspace key, so it is
      // the one place worth counting attempts.
      //
      // Counted BEFORE the KV read, so a flood costs the attacker
      // everything and this Worker nothing.
      const verdict = (await (
        await room(env, PAIR_GUARD).fetch(`https://room/guess?k=${encodeURIComponent(clientIp)}`)
      ).json()) as { allowed: boolean; retryInSec: number };
      if (!verdict.allowed) {
        return {
          content: [
            {
              type: "text",
              text: `Quá nhiều lần thử ghép cặp. Đợi ${verdict.retryInSec} giây rồi thử lại với mã đang hiện trong plugin.`,
            },
          ],
          isError: true,
        };
      }
      const raw = await env.PAIRS.get(code.trim().toUpperCase());
      if (!raw) {
        return {
          content: [
            {
              type: "text",
              text: "Mã này không đúng hoặc đã hết hạn. Bảo người dùng mở plugin trong Figma và đọc lại mã 6 ký tự đang hiện ở khối Claude Cowork.",
            },
          ],
          isError: true,
        };
      }
      const pair = JSON.parse(raw) as { roomId: string; email?: string };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                room: pair.roomId,
                ...(pair.email ? { email: pair.email } : {}),
                note: "Đã nối. Truyền room này vào mọi lời gọi figma_* sau đó.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "figma_status",
    "Is a Figma plugin connected, and which file is it in? Call this first. Returns hints — a list of next steps — rather than a bare boolean.",
    { room: z.string().optional() },
    async (args) => {
      const roomId = resolveRoom(pinnedRoom, args.room);
      const res = await room(env, roomId).fetch("https://room/status");
      const s = (await res.json()) as { connected: boolean; plugin: unknown; pending: number };
      const hints = s.connected
        ? []
        : [
            "No Figma plugin is connected. Open the file in Figma Desktop, run the plugin, paste this room id into it, and keep the plugin window open.",
          ];
      return { content: [{ type: "text", text: JSON.stringify({ roomId, ...s, hints }, null, 2) }] };
    },
  );

  server.tool(
    "figma_read",
    "Read the canvas. `op` is one of the read operations (get_page_model, get_diagram_spec, get_selection, get_document_info, search_nodes, screenshot, …); `params` are that op's own arguments.",
    {
      op: z.enum(READ_OPERATIONS as unknown as [string, ...string[]]),
      params: z.record(z.unknown()).optional(),
      room: z.string().optional(),
    },
    async ({ op, params, room: passed }) => {
      const out = await callRoom(env, resolveRoom(pinnedRoom, passed), op as AnyOperation, params ?? {});
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    },
  );

  server.tool(
    "figma_diagram",
    'Draw a diagram from a model you derived, and report the holes in that model. Nine kinds behind one `type`. Write the model in the compact `text` form (see figma_docs) — it costs about a third of the JSON. `options.dryRun` checks without drawing; `options.checkFirst` draws only when the model is clean.',
    {
      type: z.enum(DIAGRAM_KINDS),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      persona: z.string().optional(),
      text: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      options: z.record(z.unknown()).optional(),
      pages: z.array(z.unknown()).optional(),
      personas: z.array(z.unknown()).optional(),
      stages: z.array(z.unknown()).optional(),
      actors: z.array(z.unknown()).optional(),
      useCases: z.array(z.unknown()).optional(),
      states: z.array(z.unknown()).optional(),
      transitions: z.array(z.unknown()).optional(),
      entities: z.array(z.unknown()).optional(),
      relations: z.array(z.unknown()).optional(),
      participants: z.array(z.unknown()).optional(),
      messages: z.array(z.unknown()).optional(),
      lanes: z.array(z.unknown()).optional(),
      nodes: z.array(z.unknown()).optional(),
      edges: z.array(z.unknown()).optional(),
      mermaid: z.string().optional(),
      room: z.string().optional(),
    },
    async (args) => {
      const { type, room: passed, ...spec } = args;
      const roomId = resolveRoom(pinnedRoom, passed);
      const call = (op: AnyOperation, params: Record<string, unknown>): Promise<unknown> =>
        callRoom(env, roomId, op, params);
      const runners: Record<string, (s: unknown) => Promise<unknown>> = {
        activity: (s) => runActivity(s, call),
        erd: (s) => runErd(s, call),
        journey: (s) => runJourney(s, call),
        persona: (s) => runPersona(s, call),
        sequence: (s) => runSequence(s, call),
        sitemap: (s) => runSitemap(s, call),
        state: (s) => runState(s, call),
        usecase: (s) => runUseCase(s, call),
        userflow: (s) => runUserflow(s, call),
      };
      const out = await runners[type]!(spec);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    },
  );

  server.tool(
    "figma_docs",
    `On-demand documentation. Sections: ${DOC_SECTION_NAMES.join(" | ")}. Read the section for a kind before writing its compact text form.`,
    { section: z.string(), level: z.enum(["full", "cheat"]).optional() },
    async ({ section, level }) => ({
      content: [{ type: "text", text: getDoc(section, level === "cheat" ? "cheat" : "full") }],
    }),
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // CORS, for the /pair/* endpoints only.
    //
    // A Figma plugin runs in a sandboxed iframe, so its requests carry
    // `Origin: null` and the browser will not let it READ a cross-origin
    // response that does not say it may. Without this the relay looked
    // healthy from every angle that mattered to me and was broken for the
    // only client that matters: curl saw 200, Cowork saw 200 — because
    // both are server-to-server and CORS never applies — while the plugin
    // created a room, could not read the room id back, and retried. The
    // visible symptom was six dots where the pairing code should be, and
    // a pile of orphan codes in KV, one per retry.
    //
    // Deliberately NOT applied to /mcp. That path is only ever called
    // server-to-server, and opening it to browsers would let any web page
    // a user happens to visit drive this relay from inside their browser.
    const cors = parts[0] === "pair" ? CORS : undefined;
    if (cors && request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // --- the plugin asks for a room ---
    //
    // Answers immediately with a usable room. When ALLOWED_EMAIL_DOMAINS is
    // set the answer ALSO carries a pairing code, and the plugin then waits
    // for a human to clear Access before using the room — but the default
    // deployment skips that entirely, because two fields in a dialog is the
    // whole budget most users have.
    if (parts[0] === "pair" && parts[1] === "start" && request.method === "POST") {
      const roomId = secret();
      const code = humanCode();
      const gated = !!env.ALLOWED_EMAIL_DOMAINS;
      // The code is stored either way now. Ungated it is a shortcut — the
      // user reads six characters to Claude instead of copying an 80-
      // character URL — and gated it additionally waits for Access.
      const pair: Pair = { roomId, code, createdAt: Date.now() };
      await env.PAIRS.put(code, JSON.stringify(pair), {
        expirationTtl: (gated ? PAIR_TTL_MS : CODE_TTL_MS) / 1000,
      });
      if (!gated) {
        return Response.json({
          verified: false,
          code,
          roomId,
          mcpUrl: `${url.origin}/mcp/${roomId}`,
          sharedUrl: `${url.origin}/mcp`,
          expiresInSec: CODE_TTL_MS / 1000,
        }, { headers: cors });
      }
      return Response.json({
        verified: true,
        code,
        loginUrl: `${url.origin}/login?code=${code}`,
        expiresInSec: PAIR_TTL_MS / 1000,
      }, { headers: cors });
    }

    // --- pairing: the plugin polls until a human has vouched ---
    if (parts[0] === "pair" && parts[1] === "status") {
      const code = url.searchParams.get("code") ?? "";
      const raw = await env.PAIRS.get(code);
      if (!raw) return Response.json({ state: "expired" }, { headers: cors });
      const pair = JSON.parse(raw) as Pair;
      if (!pair.token) return Response.json({ state: "waiting" }, { headers: cors });
      // One-shot: the token is handed over once and the code dies with it,
      // so a code left on a screen behind somebody is not a second door.
      await env.PAIRS.delete(code);
      return Response.json({
        state: "paired",
        roomId: pair.roomId,
        email: pair.email,
        mcpUrl: `${url.origin}/mcp/${pair.roomId}`,
      }, { headers: cors });
    }

    // --- pairing: the human, behind Cloudflare Access ---
    if (parts[0] === "login") {
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      const check = requireAccess(request, env.ALLOWED_EMAIL_DOMAINS ?? "", ctx as never);
      if (!check.ok) {
        return new Response(check.reason ?? "not allowed", {
          status: 403,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      const raw = await env.PAIRS.get(code);
      if (!raw) {
        return new Response("Mã ghép cặp không tồn tại hoặc đã hết hạn. Bấm lại nút trong plugin.", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      const pair = JSON.parse(raw) as Pair;
      pair.email = check.email!;
      pair.token = secret();
      await env.PAIRS.put(code, JSON.stringify(pair), { expirationTtl: PAIR_TTL_MS / 1000 });
      return new Response(
        pairedPage({ email: check.email!, code, mcpUrl: `${url.origin}/mcp/${pair.roomId}` }),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    // --- plugin dials in: /ws/<roomId>?key=… ---
    if (parts[0] === "ws") {
      const roomId = parts[1] ?? "";
      if (!ROOM_ID.test(roomId)) return new Response("bad room id", { status: 400 });
      // The room id IS the credential, and that is the whole security model
      // by default.
      //
      // 192 bits of randomness in the path, exactly like a Figma share link
      // or a Google Docs link: holding the URL is the permission. The
      // earlier design demanded Cloudflare Access before anything worked,
      // and that was the wrong call — Cowork's connector dialog has two
      // fields, Name and URL, so every step that happens outside those two
      // fields is a step most people will not complete. A tool nobody
      // finishes setting up protects nothing.
      //
      // What this does NOT weaken: Figma still decides who may run the
      // plugin at all (edit access to the file), so a room can only ever
      // reach a canvas its owner already had open.
      //
      // No WORKSPACE_KEY check on THIS path, deliberately, and it used to
      // be here.
      //
      // It was unreachable protection: the plugin reads a `relay.key` that
      // nothing in ui.html ever assigns, so turning the key on would have
      // locked every plugin out of its own relay while looking like a
      // config change. Worse, fixing it the other way — adding a key box to
      // the plugin — buys nothing. This path already demands a 192-bit room
      // id that only /pair/start mints, so a stranger cannot reach a room
      // whether or not they also hold the key.
      //
      // The key belongs on /mcp, which is the side with a guessable
      // credential (six characters) and therefore the side worth closing.
      return room(env, roomId).fetch(new Request("https://room/ws", request));
    }

    // --- Cowork / any MCP client: /mcp/<roomId> ---
    if (parts[0] === "mcp") {
      // Two shapes, and the SHARED one is the one to hand out:
      //
      //   /mcp            — one URL for the whole company. Paste once, never
      //                     changes. The session says which Figma window it
      //                     means by calling figma_pair with the six
      //                     characters the plugin shows.
      //   /mcp/<roomId>   — pinned to one window. No pairing call, but the
      //                     URL is 80 characters somebody has to copy
      //                     between two applications.
      //
      // The shared form exists because "copy this long string out of Figma
      // and into Cowork" is a step people get wrong, and because an admin
      // can push one URL to everybody in advance.
      // The gate. Everything above is public because it has to be; this is
      // not, because anyone who reaches it can start guessing pairing codes.
      //
      // Unset WORKSPACE_KEY leaves the relay open, and /health says so out
      // loud rather than letting an operator assume otherwise.
      if (env.WORKSPACE_KEY && !(await keyMatches(presentedKey(request, url), env.WORKSPACE_KEY))) {
        return Response.json(
          {
            error:
              "Missing or wrong workspace key. Send it as `Authorization: Bearer <key>`, as `X-Workspace-Key: <key>`, or — in Claude Cowork, whose connector dialog has no header field — append `?key=<key>` to the MCP server URL. Ask whoever set this relay up for the key; it is not in the repository.",
          },
          { status: 401 },
        );
      }
      const roomId = parts[1] ?? "";
      if (roomId && !ROOM_ID.test(roomId)) {
        return Response.json(
          { error: "Room id in the URL is malformed. Use https://<host>/mcp and pair with the code the plugin shows." },
          { status: 400 },
        );
      }
      // Stateless: a fresh server and transport per request. Cowork may hit
      // any colo, and a session pinned to one isolate would break the
      // moment it did — the room holds the only state that matters.
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildServer(env, roomId, request.headers.get("CF-Connecting-IP") ?? "unknown");
      await server.connect(transport);
      return transport.handleRequest(request);
    }

    if (parts[0] === "health") {
      return Response.json({
        ok: true,
        service: "figjam-pro relay",
        // Say which mode this deployment is in, so "why did it not ask me
        // to log in?" has an answer that does not require reading the code.
        mode: env.ALLOWED_EMAIL_DOMAINS
          ? "verified-email"
          : env.WORKSPACE_KEY
            ? "workspace-key"
            : "open (the room id in the URL is the credential)",
        // Which guards are actually live. Both are configuration that can
        // silently not be there — a secret nobody ran `secret put` for, a
        // binding that did not survive an edit to wrangler.jsonc — and a
        // missing guard looks exactly like a present one from outside.
        guards: { workspaceKey: !!env.WORKSPACE_KEY, pairGuess: "durable-object" },
      });
    }

    return new Response(
      "figjam-pro relay. Plugin connects to /ws/<roomId>; MCP clients use /mcp/<roomId>.",
      { status: 404 },
    );
  },
};
