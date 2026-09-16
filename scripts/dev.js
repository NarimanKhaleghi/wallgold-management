// WallGold Manager — اسکریپت توسعه محلی (ESM)
// دو پروسه را هم‌زمان اجرا می‌کند:
//   ۱) wrangler dev (بک‌اند Worker + D1 محلی) روی پورت 8787
//   ۲) vite (فرانت‌اند با HMR) روی پورت 5173 — درخواست‌های /api پروکسی می‌شوند
//
// مرورگر را روی http://localhost:5173 باز کنید.
// برای تست نسخه پروداکشن: `npm run preview` (پورت 8787)

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// wrangler برای بخش assets نیاز به وجود پوشه dist دارد
const dist = path.resolve(__dirname, "..", "dist");
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "index.html"), "<!-- dev placeholder -->");
}

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

const children = [
  spawn(npx, ["wrangler", "dev", "--port", "8787"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: ["ignore", "inherit", "inherit"],
    shell: isWin,
  }),
  spawn(npx, ["vite"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: ["ignore", "inherit", "inherit"],
    shell: isWin,
  }),
];

console.log("\n  بک‌اند:    http://127.0.0.1:8787  (wrangler dev — API + D1 محلی)");
console.log("  فرانت‌اند: http://localhost:5173  (vite — با HMR)\n");

const killAll = () => {
  for (const child of children) {
    try {
      child.kill("SIGINT");
    } catch {
      /* نادیده بگیر */
    }
  }
  process.exit(0);
};

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);

for (const child of children) {
  child.on("exit", killAll);
}
