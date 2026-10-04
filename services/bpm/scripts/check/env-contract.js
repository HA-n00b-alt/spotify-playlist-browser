import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/env.js";

const root = repoRoot();

const requiredFiles = [
  "main.py",
  "worker.py",
  "fallback_service.py",
  "shared_processing.py",
  "deploy.sh",
  "deploy_worker.sh",
  "deploy_fallback.sh",
  "package.json",
  "scripts/deploy-production.js",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error(`check:env-contract failed — missing files: ${missing.join(", ")}`);
  process.exit(1);
}

const examplePath = path.join(root, ".env.deploy.example");
if (!fs.existsSync(examplePath)) {
  console.error("check:env-contract failed — missing .env.deploy.example");
  process.exit(1);
}

const shared = fs.readFileSync(path.join(root, "shared_processing.py"), "utf8");
if (!/^FALLBACK_SERVICE_URL = "https:\/\//m.test(shared)) {
  console.error("check:env-contract failed — FALLBACK_SERVICE_URL must be an HTTPS URL");
  process.exit(1);
}

if (/bpm-api-microservice/.test(fs.readFileSync(path.join(root, "deploy.sh"), "utf8"))) {
  console.error("check:env-contract failed — deploy.sh still references bpm-api-microservice");
  process.exit(1);
}

for (const script of ["deploy.sh", "deploy_worker.sh", "deploy_fallback.sh"]) {
  const content = fs.readFileSync(path.join(root, script), "utf8");
  if (!content.includes('PROJECT_ID="${PROJECT_ID:-delman-site}"')) {
    console.error(`check:env-contract failed — ${script} must default PROJECT_ID to delman-site`);
    process.exit(1);
  }
}

console.log("check:env-contract passed");
