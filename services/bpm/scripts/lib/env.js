import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

export function repoRoot() {
  return REPO_ROOT;
}

export function loadEnvDeploy() {
  const envPath = path.join(REPO_ROOT, ".env.deploy");
  const values = {
    PROJECT_ID: process.env.PROJECT_ID ?? "delman-site",
    REGION: process.env.REGION ?? "europe-west3",
  };

  if (!fs.existsSync(envPath)) {
    return values;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function requireEnvDeploy() {
  const config = loadEnvDeploy();
  const required = ["PROJECT_ID", "REGION"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing deployment configuration: ${missing.join(", ")}. Set PROJECT_ID and REGION in .env.deploy or the environment.`
    );
  }
  return config;
}

/** R2 is optional — only used when all credentials are present (web repos in the org standard). */
export function hasR2Manifest(config) {
  return Boolean(
    config.R2_ACCOUNT_ID &&
      config.R2_ACCESS_KEY_ID &&
      config.R2_SECRET_ACCESS_KEY &&
      config.R2_BUCKET &&
      config.R2_MANIFEST_KEY
  );
}
