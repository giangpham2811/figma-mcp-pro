/**
 * Pairing: proving who you are before a room exists.
 *
 * The problem this solves is specific. Cowork reaches the relay
 * server-to-server — there is no browser, no session, nobody to log in — so
 * the `/mcp` endpoint cannot be put behind a login. Its only secret is the
 * room id. That is fine *provided the room id is only ever handed to
 * somebody who proved who they are*, and this file is that proof step.
 *
 *   plugin ── /pair/start ──►  relay        (room id + short code, unverified)
 *   human  ── /login?code ──►  Cloudflare Access ──► relay  (email verified)
 *   plugin ── /pair/status ─►  relay        (now returns the room token)
 *
 * The verification itself is NOT written here, deliberately. Cloudflare
 * Access sits in front of `/login`, handles Google / Microsoft / email OTP,
 * enforces "email ends with @yourcompany.com" as a policy you edit in a UI,
 * and passes the result down as a signed header. Hand-rolling an OAuth
 * dance would be several hundred lines of security-critical code to
 * reimplement something free and audited.
 *
 * `/login` is the ONLY path behind Access. Putting `/mcp` behind it would
 * lock Cowork out, and putting `/ws` behind it would lock out the plugin,
 * which is an iframe with no browser session of its own.
 */

/** A pairing attempt, before and after the human proves who they are. */
export interface Pair {
  roomId: string;
  /** Short, human-readable, said out loud in a meeting. Not a secret. */
  code: string;
  createdAt: number;
  /** Set once Access has vouched for a human. */
  email?: string;
  /** Handed to the plugin only after `email` is set. */
  token?: string;
}

/** Codes expire fast: an unclaimed one is either abandoned or being guessed. */
export const PAIR_TTL_MS = 10 * 60 * 1000;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * A code a person can read off a screen and type without asking twice.
 *
 * No O/0, no I/1/L — those are the characters people get wrong over a call,
 * and a pairing code that has to be repeated is a pairing code that gets
 * screenshotted into a chat instead.
 */
export function humanCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Room ids and tokens are machine-only, so they are long and unfriendly. */
export function secret(bytes = 24): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The email Cloudflare Access vouched for, or null.
 *
 * `Cf-Access-Authenticated-User-Email` is set by Access AFTER it has
 * validated its own JWT, and Cloudflare strips any copy a client tried to
 * send. It is only trustworthy on a path Access actually protects — which
 * is why `requireAccess` below fails closed when the header is missing
 * rather than treating absence as "no policy configured".
 */
export function accessEmail(request: Request): string | null {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return email && email.includes("@") ? email.toLowerCase() : null;
}

export interface DomainCheck {
  ok: boolean;
  email: string | null;
  reason?: string;
}

/**
 * Verify the caller, and that their domain is allowed.
 *
 * Access already enforces the policy; this checks it a second time because
 * a mis-scoped Access application (protecting `/login/*` but not `/login`,
 * say) is a one-character mistake that silently opens the door, and the
 * domain list lives here where it is reviewed in code.
 */
export function requireAccess(request: Request, allowedDomains: string): DomainCheck {
  const email = accessEmail(request);
  if (!email) {
    return {
      ok: false,
      email: null,
      reason:
        "This path is not protected by Cloudflare Access, so nobody's identity was verified. Add an Access application for /login before using pairing.",
    };
  }
  const domains = allowedDomains
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (domains.length === 0) return { ok: true, email };

  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  // Exact match only. A suffix test would let `evil-yourcompany.com`
  // through, which is the classic way this check is written wrong.
  if (!domains.includes(domain)) {
    return { ok: false, email, reason: `${email} is not on an allowed domain (${domains.join(", ")}).` };
  }
  return { ok: true, email };
}

/** The page the human lands on after Access lets them through. */
export function pairedPage(opts: { email: string; mcpUrl: string; code: string }): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đã kết nối</title>
<style>
 :root { color-scheme: light dark; --ink:#101827; --muted:#5b6675; --line:#dfe4ea; --bg:#fff; --card:#f6f8fa; }
 @media (prefers-color-scheme: dark) { :root { --ink:#f3f4f6; --muted:#9aa4b2; --line:#2b3440; --bg:#0f1318; --card:#171c23; } }
 body { font: 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink);
        background:var(--bg); margin:0; padding:40px 20px; display:flex; justify-content:center; }
 main { max-width: 560px; width: 100%; }
 h1 { font-size: 22px; margin: 0 0 4px; }
 p { color: var(--muted); margin: 0 0 24px; }
 .url { display:flex; gap:8px; }
 input { flex:1; font: 13px ui-monospace,SFMono-Regular,Menlo,monospace; padding:12px 14px; min-height:44px;
         border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
 button { min-height:44px; min-width:88px; padding:0 16px; border:0; border-radius:8px; cursor:pointer;
          background:#2563eb; color:#fff; font-size:14px; font-weight:500; }
 ol { padding-left: 20px; margin: 24px 0 0; } li { margin-bottom: 10px; }
 code { background:var(--card); padding:2px 6px; border-radius:4px; font-size:13px; }
</style></head>
<body><main>
 <h1>Đã xác minh ${esc(opts.email)}</h1>
 <p>Mã ghép cặp <code>${esc(opts.code)}</code> đã được kích hoạt. Quay lại cửa sổ plugin trong Figma — nó sẽ tự kết nối trong vài giây.</p>
 <div class="url">
   <input id="u" readonly value="${esc(opts.mcpUrl)}">
   <button onclick="navigator.clipboard.writeText(document.getElementById('u').value).then(()=>{this.textContent='Đã chép'})">Chép</button>
 </div>
 <ol>
   <li>Mở <strong>Claude Cowork</strong> → Settings → Connectors → <strong>Add custom connector</strong>.</li>
   <li>Dán đường dẫn ở trên vào ô URL. Đặt tên gì cũng được, ví dụ <em>Figma</em>.</li>
   <li>Giữ cửa sổ plugin trong Figma mở — đó là cây cầu.</li>
 </ol>
 <p style="margin-top:24px">Đường dẫn này là bí mật: ai có nó thì vẽ được lên file Figma bạn đang mở.</p>
</main></body></html>`;
}
