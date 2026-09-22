/**
 * One room = one Figma window.
 *
 * This is the piece that makes Cowork possible. Cowork runs in Anthropic's
 * cloud: it cannot spawn a process on the user's machine and cannot see
 * their localhost, so the local bridge is unreachable. But the Figma plugin
 * is a WebSocket CLIENT — it dials out — so if both sides dial the same
 * public address they meet in the middle. This Durable Object is that
 * middle.
 *
 *   Cowork  ──Streamable HTTP──►  Worker  ──►  Room (this)  ◄──WS──  Plugin
 *
 * A Durable Object rather than a plain Worker because a Worker keeps no
 * state between requests, and a room is exactly state: one live socket, and
 * whatever request is waiting on it.
 *
 * WebSocket Hibernation is used deliberately. A design session is mostly
 * silence — the plugin sits connected for an hour and draws six times — and
 * a hibernating object is not billed for duration. Without it this would
 * run up duration charges for doing nothing, which is the failure mode that
 * turns a free-tier tool into a surprise invoice.
 */
import { DEFAULT_OP_TIMEOUT_MS, OP_TIMEOUTS } from "../../src/shared/protocol.js";
import type { BridgeRequest, BridgeResponse, Operation } from "../../src/shared/protocol.js";

interface Pending {
  resolve: (r: BridgeResponse) => void;
  reject: (e: Error) => void;
  timer: number;
}

export interface PluginInfo {
  fileName: string;
  pageName: string;
  editorType: string;
  pluginVersion: string;
  connectedAt: number;
}

export class FigmaRoom {
  private state: DurableObjectState;
  /** In-flight requests, by id. Lost on eviction — the timeout covers it. */
  private pending = new Map<string, Pending>();
  private seq = 0;
  /**
   * Failed pairing guesses, by caller, for the one instance of this class
   * that is addressed as "pair-guard" rather than as a room. See /guess.
   */
  private guesses = new Map<string, { n: number; until: number }>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    /**
     * Count a pairing-code guess. Answers whether the caller may make it.
     *
     * This lives in the room class, addressed under the fixed name
     * "pair-guard", because a Durable Object with a fixed name is the only
     * thing in this relay that counts reliably. The obvious alternative,
     * the Workers rate-limiting binding, was tried first and measured: it
     * does block, but only within a single request — fourteen calls in one
     * invocation get cut off at the twelfth, while fourteen separate HTTP
     * requests all sail through, because that binding counts locally per
     * edge machine. A guard that a real attacker's traffic pattern walks
     * straight past is worse than none, since it reads as protection.
     *
     * Kept in memory, not storage. An evicted object forgets, and that is
     * acceptable: eviction follows inactivity, and an attacker who has
     * stopped for long enough to trigger it has stopped attacking. Storage
     * writes on every guess would be the expensive way to buy nothing.
     */
    if (url.pathname.endsWith("/guess")) {
      const who = url.searchParams.get("k") ?? "unknown";
      const limit = Number(url.searchParams.get("limit") ?? "10");
      const windowMs = Number(url.searchParams.get("window") ?? "60000");
      const now = Date.now();
      const seen = this.guesses.get(who);
      const slot = !seen || seen.until <= now ? { n: 0, until: now + windowMs } : seen;
      slot.n += 1;
      this.guesses.set(who, slot);
      // Bound the map so a spray of forged IPs cannot grow it without end.
      if (this.guesses.size > 5000) {
        for (const [k, v] of this.guesses) if (v.until <= now) this.guesses.delete(k);
      }
      return Response.json({ allowed: slot.n <= limit, retryInSec: Math.ceil((slot.until - now) / 1000) });
    }

    // --- the plugin dialling in ---
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      // One window per room. A second plugin claiming the same room means
      // the first one reloaded, or another Figma window restored the same
      // saved room; either way the newest connection wins and the old one
      // is closed rather than left to answer requests nobody is reading.
      //
      // The reason string is exactly "replaced" because that is what the
      // local bridge sends (src/server/bridge.ts) and what the plugin
      // matches on. This used to read "replaced by a newer connection",
      // which is better English and completely invisible to `reason ===
      // "replaced"` — so the evicted window mistook eviction for a dropped
      // network and reconnected at once, evicting the other one, forever.
      // Two open windows pinned the relay at one reconnect per second.
      for (const old of this.state.getWebSockets()) {
        try {
          old.close(1000, "replaced");
        } catch {
          /* already gone */
        }
      }

      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // --- the MCP side asking for an op ---
    if (url.pathname.endsWith("/op")) {
      const body = (await request.json()) as { op: string; params: Record<string, unknown> };
      try {
        const result = await this.dispatch(body.op as Operation, body.params ?? {});
        return Response.json({ ok: true, result });
      } catch (e) {
        return Response.json(
          { ok: false, error: { message: e instanceof Error ? e.message : String(e) } },
          { status: 200 },
        );
      }
    }

    if (url.pathname.endsWith("/status")) {
      return Response.json(this.status());
    }

    return new Response("not found", { status: 404 });
  }

  /** What the plugin told us about itself, from its `hello`. */
  private info(): PluginInfo | null {
    const [ws] = this.state.getWebSockets();
    if (!ws) return null;
    const raw = ws.deserializeAttachment() as PluginInfo | null;
    return raw ?? null;
  }

  status(): { connected: boolean; plugin: PluginInfo | null; pending: number } {
    return {
      connected: this.state.getWebSockets().length > 0,
      plugin: this.info(),
      pending: this.pending.size,
    };
  }

  /**
   * Send one op to the plugin and wait for its answer.
   *
   * Serialised the same way the local bridge serialises: the Figma Plugin
   * API races and times out when two mutations overlap, and that is a
   * property of Figma, not of the transport — so moving the bridge into a
   * Durable Object does not make it safe to parallelise.
   */
  private async dispatch(op: Operation, params: Record<string, unknown>): Promise<unknown> {
    const [ws] = this.state.getWebSockets();
    if (!ws) {
      throw new Error(
        "No Figma plugin is connected to this room. Open the file in Figma Desktop, run the plugin, and keep its window open.",
      );
    }

    const id = `r${++this.seq}`;
    const budget = OP_TIMEOUTS[op] ?? DEFAULT_OP_TIMEOUT_MS;
    const req: BridgeRequest = { id, op, params };

    const answer = new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `The plugin did not answer "${op}" within ${Math.round(budget / 1000)}s. It may still have finished the work — read the page before retrying, or you will draw it twice.`,
          ),
        );
      }, budget) as unknown as number;
      this.pending.set(id, { resolve, reject, timer });
    });

    ws.send(JSON.stringify({ type: "request", payload: req }));
    const res = await answer;
    if (!res.ok) {
      const err = res.error;
      throw new Error(err ? `${err.code}: ${err.message}${err.hint ? ` — ${err.hint}` : ""}` : "plugin error");
    }
    return res.warnings?.length ? { result: res.result, warnings: res.warnings } : res.result;
  }

  // --- hibernation callbacks ---

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "hello") {
      // Stored on the socket rather than in memory: the object hibernates
      // between draws, and the attachment is what survives that.
      ws.serializeAttachment({
        fileName: String(msg.fileName ?? ""),
        pageName: String(msg.pageName ?? ""),
        editorType: String(msg.editorType ?? ""),
        pluginVersion: String(msg.pluginVersion ?? ""),
        connectedAt: Date.now(),
      } satisfies PluginInfo);
      ws.send(JSON.stringify({ type: "assigned", channel: this.state.id.toString(), resumeToken: "" }));
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }

    if (msg.type === "response") {
      const payload = msg.payload as BridgeResponse;
      const waiting = this.pending.get(payload.id);
      if (!waiting) return;
      // A progress ping resets the budget without settling the promise —
      // a sixty-component generate would otherwise die halfway.
      if (payload.progress && payload.ok === undefined) return;
      clearTimeout(waiting.timer);
      this.pending.delete(payload.id);
      waiting.resolve(payload);
    }
  }

  async webSocketClose(): Promise<void> {
    // Fail everything in flight now rather than letting each one wait out
    // its own timeout: the caller finds out in a second instead of thirty,
    // and the message says the real cause.
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("The Figma plugin disconnected while this was in flight."));
    }
    this.pending.clear();
  }

  async webSocketError(): Promise<void> {
    await this.webSocketClose();
  }
}
