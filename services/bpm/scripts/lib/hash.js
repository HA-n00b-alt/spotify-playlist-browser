import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot } from "./env.js";

const SERVICE_FILES = {
  worker: ["worker.py", "shared_processing.py", "requirements.txt", "Dockerfile.worker"],
  fallback: ["fallback_service.py", "requirements_fallback.txt", "Dockerfile.fallback"],
  main: ["main.py", "shared_processing.py", "requirements.txt", "Dockerfile"],
};

function hashFiles(relativePaths) {
  const hash = crypto.createHash("sha256");
  const root = repoRoot();
  for (const relativePath of [...relativePaths].sort()) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing file for hash: ${relativePath}`);
    }
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeServiceHashes() {
  return {
    worker: hashFiles(SERVICE_FILES.worker),
    fallback: hashFiles(SERVICE_FILES.fallback),
    main: hashFiles(SERVICE_FILES.main),
    combined: hashFiles([
      ...SERVICE_FILES.worker,
      ...SERVICE_FILES.fallback,
      ...SERVICE_FILES.main,
    ]),
  };
}

export function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}
