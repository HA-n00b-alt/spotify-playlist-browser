import fs from "node:fs";
import path from "node:path";
import { run } from "./exec.js";
import { repoRoot } from "./env.js";

const FALLBACK_URL_PATTERN = /^FALLBACK_SERVICE_URL = ".*"/m;

export function getCloudRunUrl(serviceName, config) {
  return run(
    `gcloud run services describe ${serviceName} --region=${config.REGION} --project=${config.PROJECT_ID} --format="value(status.url)"`,
    { quiet: true }
  );
}

export function updateFallbackServiceUrl(fallbackUrl) {
  const filePath = path.join(repoRoot(), "shared_processing.py");
  const content = fs.readFileSync(filePath, "utf8");
  if (!FALLBACK_URL_PATTERN.test(content)) {
    throw new Error("FALLBACK_SERVICE_URL not found in shared_processing.py");
  }
  const updated = content.replace(
    FALLBACK_URL_PATTERN,
    `FALLBACK_SERVICE_URL = "${fallbackUrl}"`
  );
  if (updated === content) {
    return false;
  }
  fs.writeFileSync(filePath, updated);
  return true;
}

export function uploadSecrets(config) {
  const secretsPath = path.join(repoRoot(), ".env.secrets");
  if (!fs.existsSync(secretsPath)) {
    console.log("ℹ️  No .env.secrets file — skipping Secret Manager upload");
    return;
  }

  for (const line of fs.readFileSync(secretsPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name || !value) continue;

    try {
      run(`gcloud secrets describe ${name} --project=${config.PROJECT_ID}`, { quiet: true });
    } catch {
      run(
        `gcloud secrets create ${name} --replication-policy=automatic --project=${config.PROJECT_ID}`,
        { quiet: true }
      );
    }

    const tmpPath = path.join(repoRoot(), `.secret-${name}.tmp`);
    fs.writeFileSync(tmpPath, value);
    try {
      run(
        `gcloud secrets versions add ${name} --data-file=${tmpPath} --project=${config.PROJECT_ID}`,
        { quiet: true }
      );
      console.log(`✅ Secret uploaded: ${name}`);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  }
}

export function grantWorkerFallbackInvoker(config) {
  const projectNumber = run(
    `gcloud projects describe ${config.PROJECT_ID} --format="value(projectNumber)"`,
    { quiet: true }
  );
  const workerSa = `${projectNumber}-compute@developer.gserviceaccount.com`;
  run(
    `gcloud run services add-iam-policy-binding bpm-fallback-service --region=${config.REGION} --member="serviceAccount:${workerSa}" --role="roles/run.invoker" --project=${config.PROJECT_ID}`,
    { quiet: true }
  );
}
