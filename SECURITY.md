# Security

## Reporting a vulnerability

Email **giangpm@ikameglobal.com** with `[security]` in the subject. Please
do not open a public issue for anything exploitable.

Include what you can: what you did, what happened, and how bad you think
it is. A rough report today beats a polished one next month.

What to expect:

| | |
|---|---|
| Acknowledgement | within 3 working days |
| First assessment | within 10 working days |
| Fix for a confirmed high-severity issue | as fast as we can; the relay deploys in seconds |

We will tell you when it is fixed, and credit you in the release notes
unless you would rather we did not.

## What this software is

Two halves that only work together:

- **A Figma plugin.** Draws on the file you have open, as you, with your
  permissions. It has no Figma credentials of its own and cannot reach a
  file you have not opened.
- **A relay.** A Cloudflare Worker that lets an MCP client reach the
  plugin, because the client runs in somebody else's cloud and cannot see
  your machine. Both sides dial out and meet there.

## What crosses the wire, and what is kept

**Kept:** pairing codes. A record of `{roomId, code, createdAt}` in
Cloudflare KV, expiring in 12 hours (10 minutes when email verification is
on). That is the only thing the relay writes to storage anywhere - two
`put` calls in `relay/src/index.ts`, and you can grep for them.

**Not kept:** everything else. Diagram content - screen names, step
labels, the model an assistant derived - passes **through** the relay on
its way to the plugin and is never written down. Room state lives in a
Durable Object's memory and dies with it.

**Never present at all:** Figma credentials. No API token, no `figd_`
value, no call to `api.figma.com`. The relay cannot read your Figma files;
only the plugin running on your machine can, and only the file you opened.

Self-hosting the relay removes even the pass-through. It is one command
and it is documented in `docs/COWORK.md`.

## Access control

The relay ships with three layers, two of them optional:

1. **Room id** - 192 bits of randomness in the URL. The same model as a
   Figma or Google Docs share link: holding the link is the permission.
2. **`WORKSPACE_KEY`** (optional) - a shared secret required on `/mcp`,
   accepted as a `Bearer` header, an `X-Workspace-Key` header, or a `?key=`
   query parameter. Stored as a Cloudflare secret, never in the repository;
   a test fails the build if it appears in the docs.
3. **Cloudflare Access** (optional) - verifies a company email domain
   before a room id is handed out.

Independently of all three, **Figma decides what is reachable**: the plugin
only runs on files you can edit, so a room can never touch a canvas its
owner has not opened.

Pairing-code guesses are rate limited to 10 per minute per IP, counted in a
Durable Object so the count is real rather than per-edge-machine.

## Dependencies

The relay bundles the MCP SDK and zod. The plugin bundles nothing - it is
one file of plain JavaScript and one HTML file.
