import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/env.js";

const root = repoRoot();
const serviceFiles = ["main.py", "worker.py", "fallback_service.py", "shared_processing.py"];

for (const file of serviceFiles) {
  const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  let inMainGuard = false;
  for (const line of lines) {
    if (/if __name__ == ["']__main__["']/.test(line)) {
      inMainGuard = true;
    }
    if (inMainGuard) continue;
    if (/^\s*print\s*\(/.test(line)) {
      console.error(`check:runtime-console failed — bare print() in ${file}: ${line.trim()}`);
      process.exit(1);
    }
  }

  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes("json.dumps") && !content.includes("log_event")) {
    console.error(`check:runtime-console failed — ${file} must emit structured JSON logs`);
    process.exit(1);
  }
}

console.log("check:runtime-console passed");
