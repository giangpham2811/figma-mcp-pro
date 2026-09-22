/**
 * Build the ZIP you hand to somebody who will never run npm.
 *
 * `npm run package` ships SOURCE, for a developer who will build it. That is
 * the wrong artefact for the person this tool is actually for: a designer or
 * a BA who needs the plugin in Figma and has no reason to own a toolchain.
 * Handing them a source tree means handing them Node, a build step and a
 * failure mode per person.
 *
 * So this ships the three files Figma itself needs — manifest, code, UI —
 * and nothing else. Unzip, Import plugin from manifest, done.
 *
 * The sourcemap is deliberately excluded and its reference stripped. It is
 * 1.8 MB against a 380 KB plugin, it is the whole TypeScript source in a
 * file nobody will read, and a dangling sourceMappingURL prints a 404 in
 * anybody's devtools who opens them.
 *
 * This is still the stopgap, not the answer. Every recipient has to import
 * it by hand, and a dev-mode plugin does not update itself — a fix means
 * sending a new ZIP to everyone. Publishing to Figma is what removes that,
 * and docs/HUONG-DAN.md says how.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: on Windows that yields "/C:/..." and
// resolve() then glues the cwd drive in front of it ("C:\C:\Users\...").
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const name = `reqwise-figma-plugin-${pkg.version}`;

const NEEDED = ["manifest.json", "code.js", "ui.html"];
const missing = NEEDED.filter((f) => !existsSync(join(root, "plugin", f)));
if (missing.length) {
  console.error(`plugin/${missing.join(", plugin/")} missing — run \`npm run build\` first.`);
  process.exit(1);
}

const stage = mkdtempSync(join(tmpdir(), "reqwise-plugin-"));
const dest = join(stage, name);
mkdirSync(dest, { recursive: true });

for (const f of NEEDED) {
  if (f === "code.js") {
    // Strip the trailing sourcemap reference along with the map itself.
    const code = readFileSync(join(root, "plugin", f), "utf8").replace(/\n?\/\/# sourceMappingURL=.*\s*$/, "\n");
    writeFileSync(join(dest, f), code);
  } else {
    copyFileSync(join(root, "plugin", f), join(dest, f));
  }
}

writeFileSync(
  join(dest, "CAI-DAT.txt"),
  [
    "Cài plugin Reqwise Figma MCP",
    "",
    "1. Giải nén thư mục này ra chỗ nào bạn KHÔNG xoá nhầm.",
    "   Figma đọc thẳng từ đây mỗi lần chạy — xoá là plugin biến mất.",
    "",
    "2. Mở Figma BẢN CÀI TRÊN MÁY (không phải Figma trong trình duyệt).",
    "   Tải ở https://www.figma.com/downloads/",
    "",
    "3. Menu Plugins -> Development -> Import plugin from manifest...",
    "",
    "4. Chọn file manifest.json trong thư mục này.",
    "",
    "5. Mở file bạn CÓ QUYỀN SỬA, rồi Plugins -> Reqwise Figma MCP.",
    "   File chỉ được xem thì plugin không chạy được - hãy Duplicate",
    "   sang drafts của bạn trước.",
    "",
    "6. ĐỂ Ô PLUGIN MỞ. Đóng nó là mất kết nối.",
    "",
    "Bước 2 tới 6 làm lại mỗi lần mở Figma. Bước 1 và 3-4 chỉ một lần.",
    "",
    "Cách nối với Claude: xem README của dự án.",
    "",
  ].join("\n"),
);

const out = join(root, `${name}.zip`);
rmSync(out, { force: true });
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path "${dest}" -DestinationPath "${out}"`,
]);
rmSync(stage, { recursive: true, force: true });
console.log(`${name}.zip  (${(statSync(out).size / 1024).toFixed(0)} KB)`);
