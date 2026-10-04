import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/env.js";

const root = repoRoot();
const pythonFiles = fs
  .readdirSync(root)
  .filter((name) => name.endsWith(".py"))
  .map((name) => path.join(root, name));

const bannedPatterns = [
  { pattern: /bpm-api-microservice/, label: "legacy project id" },
  { pattern: /^\s*except:\s*$/, label: "bare except" },
];

for (const filePath of pythonFiles) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    for (const { pattern, label } of bannedPatterns) {
      if (pattern.test(line)) {
        console.error(`check:strict failed — ${path.basename(filePath)}: ${label} → ${line.trim()}`);
        process.exit(1);
      }
    }
  }
}

console.log("check:strict passed");
