#!/usr/bin/env node
/**
 * Make this usable from Claude Code, from any directory.
 *
 * Two things have to land, and they land in different places:
 *   1. the MCP server, registered at USER scope so it is there whatever
 *      folder Claude Code is started in;
 *   2. the /figjam-pro slash command, copied into ~/.claude/commands/ for
 *      the same reason.
 *
 *   npm run build && node scripts/install-figjam.mjs
 *
 * Registers with `node <abs path>` rather than scripts/reqwise-mcp.sh: that
 * launcher uses pgrep/lsof/getconf and does not run on Windows. Its job was
 * cleaning up orphan leaders, which the server's own election already
 * handles — a launcher that only starts on two of three platforms is the
 * worse trade.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "dist", "server", "index.js");
// The MCP SERVER keeps the name the nine diagram skills already call
// (`mcp__reqwise-figma__*`). The slash command is named separately —
// registering the server as "figjam-pro" would leave every skill calling a
// tool that does not exist, which fails as "unknown tool" and looks like the
// skill's bug.
const NAME = "reqwise-figma";

const log = (m) => process.stdout.write(`${m}\n`);

if (!existsSync(SERVER)) {
  process.stderr.write(`install-figjam: ${SERVER} is missing. Run \`npm run build\` first.\n`);
  process.exit(1);
}

// Re-registering is how you pick up a moved checkout, so remove first and
// ignore the failure when there was nothing to remove.
// Plain "claude" with no shell. It resolves to claude.exe on Windows and to
// the binary on the PATH elsewhere; shell:true would work too but node now
// warns about it, because the args go through unescaped.
const CLI = "claude";

spawnSync(CLI, ["mcp", "remove", NAME, "-s", "user"], { stdio: "ignore" });
// A previous version of this installer registered the server under the
// command's name; remove that too, or two servers answer and every tool
// shows up twice.
spawnSync(CLI, ["mcp", "remove", "figjam-pro", "-s", "user"], { stdio: "ignore" });
const add = spawnSync(
  CLI,
  // SERVER as-is: node on Windows accepts either slash, and normalising it
  // here is one more thing to get wrong for no gain.
  ["mcp", "add", NAME, "-s", "user", "--", "node", SERVER],
  { stdio: "inherit" },
);
if (add.status !== 0) {
  process.stderr.write("install-figjam: `claude mcp add` failed — is the Claude Code CLI on PATH?\n");
  process.exit(1);
}

const commands = join(homedir(), ".claude", "commands");
mkdirSync(commands, { recursive: true });
copyFileSync(join(ROOT, ".claude", "commands", "figjam-pro.md"), join(commands, "figjam-pro.md"));
log(`installed /figjam-pro → ${join(commands, "figjam-pro.md")}`);

log("");
log("Done. Restart Claude Code, then:");
log('  /figjam-pro vẽ userflow đăng nhập theo template trên board');
