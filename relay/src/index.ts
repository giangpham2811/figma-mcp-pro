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

import { humanCode, secret, requireAccess, pairedPage, PAIR_TTL_MS, type Pair } from "./pairing.js";

export { FigmaRoom } from "./room.js";

export interface Env {
  FIGMA_ROOM: DurableObjectNamespace;
  /** Pairing attempts, keyed by code. Short TTL — see PAIR_TTL_MS. */
  PAIRS: KVNamespace;
  /**
   * Comma-separated email domains allowed to pair, e.g.
   * "yourcompany.com,partner.com". Empty means any address Access let
   * through, which is only safe if the Access policy is already narrow.
   */
  ALLOWED_EMAIL_DOMAINS?: string;
  /**
   * Fallback secret for teams without Cloudflare Access. When set, the
   * plugin may open a room with `?key=` and skip pairing entirely.
   */
  WORKSPACE_KEY?: string;
}

const ROOM_ID = /^[A-Za-z0-9_-]{6,64}$/;

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

function buildServer(env: Env, roomId: string): McpServer {
  const server = new McpServer(
    { name: "figjam-pro", version: "0.3.0" },
    {
      instructions:
        "Draws BA diagrams onto a Figma or FigJam canvas through a plugin the user is running. Always call figma_status first: if no plugin is connected, tell the user to open the file in Figma Desktop and run the plugin — do not guess and do not retry. Every draw reports findings about the MODEL (a use case nobody can start, a journey stage nothing serves); those findings are the point, so read them out rather than only saying the drawing is done.",
    },
  );

  server.tool(
    "figma_status",
    "Is a Figma plugin connected to this room, and which file is it in? Call this first. Returns hints — a list of next steps — rather than a bare boolean.",
    {},
    async () => {
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
    },
    async ({ op, params }) => {
      const out = await callRoom(env, roomId, op as AnyOperation, params ?? {});
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
    },
    async (args) => {
      const { type, ...spec } = args;
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

    // --- the plugin asks for a room ---
    //
    // Answers immediately with a usable room. When ALLOWED_EMAIL_DOMAINS is
    // set the answer ALSO carries a pairing code, and the plugin then waits
    // for a human to clear Access before using the room — but the default
    // deployment skips that entirely, because two fields in a dialog is the
    // whole budget most users have.
    if (parts[0] === "pair" && parts[1] === "start" && request.method === "POST") {
      const roomId = secret();
      const gated = !!env.ALLOWED_EMAIL_DOMAINS;
      if (!gated) {
        return Response.json({ verified: false, roomId, mcpUrl: `${url.origin}/mcp/${roomId}` });
      }
      const code = humanCode();
      const pair: Pair = { roomId, code, createdAt: Date.now() };
      await env.PAIRS.put(code, JSON.stringify(pair), { expirationTtl: PAIR_TTL_MS / 1000 });
      return Response.json({
        verified: true,
        code,
        loginUrl: `${url.origin}/login?code=${code}`,
        expiresInSec: PAIR_TTL_MS / 1000,
      });
    }

    // --- pairing: the plugin polls until a human has vouched ---
    if (parts[0] === "pair" && parts[1] === "status") {
      const code = url.searchParams.get("code") ?? "";
      const raw = await env.PAIRS.get(code);
      if (!raw) return Response.json({ state: "expired" });
      const pair = JSON.parse(raw) as Pair;
      if (!pair.token) return Response.json({ state: "waiting" });
      // One-shot: the token is handed over once and the code dies with it,
      // so a code left on a screen behind somebody is not a second door.
      await env.PAIRS.delete(code);
      return Response.json({
        state: "paired",
        roomId: pair.roomId,
        email: pair.email,
        mcpUrl: `${url.origin}/mcp/${pair.roomId}`,
      });
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
      // WORKSPACE_KEY stays as opt-in for teams who want the relay itself
      // closed to outsiders.
      if (env.WORKSPACE_KEY && url.searchParams.get("key") !== env.WORKSPACE_KEY) {
        return new Response("workspace key missing or wrong", { status: 403 });
      }
      return room(env, roomId).fetch(new Request("https://room/ws", request));
    }

    // --- Cowork / any MCP client: /mcp/<roomId> ---
    if (parts[0] === "mcp") {
      const roomId = parts[1] ?? "";
      if (!ROOM_ID.test(roomId)) {
        return Response.json(
          { error: "Add the room id to the URL: https://<host>/mcp/<roomId>. The plugin shows it." },
          { status: 400 },
        );
      }
      // Stateless: a fresh server and transport per request. Cowork may hit
      // any colo, and a session pinned to one isolate would break the
      // moment it did — the room holds the only state that matters.
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildServer(env, roomId);
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
      });
    }

    return new Response(
      "figjam-pro relay. Plugin connects to /ws/<roomId>; MCP clients use /mcp/<roomId>.",
      { status: 404 },
    );
  },
};
