#!/usr/bin/env node
import { run } from "./lib/exec.js";
import { requireEnvDeploy, repoRoot, hasR2Manifest } from "./lib/env.js";
import { computeServiceHashes, gitSha } from "./lib/hash.js";
import {
  readDeploymentManifest,
  writeDeploymentManifest,
} from "./lib/r2-manifest.js";
import {
  getCloudRunUrl,
  grantWorkerFallbackInvoker,
  updateFallbackServiceUrl,
  uploadSecrets,
} from "./lib/gcp.js";
import { maybeCommitAndSync } from "./lib/git-sync.js";

const logs = [];

function log(message) {
  console.log(message);
  logs.push(`${new Date().toISOString()} ${message}`);
}

const SERVICE_MANIFEST_KEYS = {
  worker: "bpm-worker",
  fallback: "bpm-fallback-service",
  main: "bpm-service",
};

function shouldDeploy(serviceName, hashes, remoteManifest, force) {
  if (force) return true;
  const manifestKey = SERVICE_MANIFEST_KEYS[serviceName];
  const remoteHash = remoteManifest?.services?.[manifestKey]?.contentHash;
  return remoteHash !== hashes[serviceName];
}

async function main() {
  const root = repoRoot();
  process.chdir(root);

  log("Step 1/8 — Run verify");
  run("npm run verify");

  log("Step 2/8 — Read deployment manifest");
  const config = requireEnvDeploy();
  const remoteManifest = await readDeploymentManifest(config, { hasR2Manifest });
  if (hasR2Manifest(config)) {
    if (remoteManifest) {
      log(`Remote R2 manifest loaded (${remoteManifest.deployedAt ?? "unknown timestamp"})`);
    } else {
      log("No remote R2 manifest found — using deploy.lock.json if present");
    }
  } else if (remoteManifest) {
    log(`Local deploy.lock.json loaded (${remoteManifest.deployedAt ?? "unknown timestamp"})`);
  } else {
    log("No deployment manifest found — first deploy for this service");
  }

  log("Step 3/8 — Apply pending migrations");
  log("No database migrations configured (Firestore is schemaless) — skipped");

  log("Step 4/8 — Upload new/changed secrets");
  uploadSecrets(config);

  const hashes = computeServiceHashes();
  const force = process.env.DEPLOY_FORCE === "1";
  const deployEnv = {
    ...process.env,
    PROJECT_ID: config.PROJECT_ID,
    REGION: config.REGION,
  };

  log("Step 5/8 — Build/deploy accessory components");
  const workerChanged = shouldDeploy("worker", hashes, remoteManifest, force);
  const fallbackChanged = shouldDeploy("fallback", hashes, remoteManifest, force);

  if (workerChanged) {
    log("Deploying bpm-worker (changes detected)");
    run("./deploy_worker.sh", { env: deployEnv });
  } else {
    log("Skipping bpm-worker deploy (no changes)");
  }

  if (fallbackChanged) {
    log("Deploying bpm-fallback-service (changes detected)");
    run("./deploy_fallback.sh", { env: deployEnv });
  } else {
    log("Skipping bpm-fallback-service deploy (no changes)");
  }

  const fallbackUrl = getCloudRunUrl("bpm-fallback-service", config);
  const fallbackUpdated = updateFallbackServiceUrl(fallbackUrl);
  grantWorkerFallbackInvoker(config);

  if (fallbackUpdated) {
    log("shared_processing.py updated with fallback URL — redeploying worker and main");
    run("./deploy_worker.sh", { env: deployEnv });
  }

  log("Step 6/8 — Build/deploy main app");
  const mainChanged = shouldDeploy("main", hashes, remoteManifest, force);
  if (mainChanged || workerChanged || fallbackChanged || fallbackUpdated) {
    run("./deploy.sh", { env: deployEnv });
  } else {
    log("Main service unchanged — skipped");
  }

  const services = {
    "bpm-worker": {
      contentHash: hashes.worker,
      url: getCloudRunUrl("bpm-worker", config),
    },
    "bpm-fallback-service": {
      contentHash: hashes.fallback,
      url: getCloudRunUrl("bpm-fallback-service", config),
    },
    "bpm-service": {
      contentHash: hashes.main,
      url: getCloudRunUrl("bpm-service", config),
    },
  };

  const manifest = {
    repo: "bpm-finder-api",
    projectId: config.PROJECT_ID,
    region: config.REGION,
    deployedAt: new Date().toISOString(),
    gitSha: gitSha(),
    combinedHash: hashes.combined,
    services,
    logs,
  };

  log("Step 7/8 — Write deployment manifest");
  await writeDeploymentManifest(config, manifest, { hasR2Manifest });
  if (hasR2Manifest(config)) {
    log("deploy.lock.json and remote R2 manifest updated");
  } else {
    log("deploy.lock.json updated");
  }

  log("Step 8/8 — Upload changes to git");
  await maybeCommitAndSync(log);

  log("✅ deploy:production complete");
  console.log(JSON.stringify({ services }, null, 2));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
