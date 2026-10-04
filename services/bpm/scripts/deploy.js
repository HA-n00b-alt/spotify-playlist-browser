/**
 * Deploys the BPM services to Cloud Run. It is one step of the root `npm run deploy:production`
 * (#59), which runs verify first and records the result in its Vercel Blob manifest, so this
 * module neither verifies, keeps its own manifest nor commits anything.
 *
 * A service is deployed only when the content hash of its files differs from the hash recorded
 * for the last deploy (or when `force` is set). The main service is also redeployed whenever the
 * worker or the fallback service is, as before the move.
 */
import { run } from "./lib/exec.js";
import { GCP_CONFIG, repoRoot } from "./lib/env.js";
import { computeServiceHashes } from "./lib/hash.js";
import {
  assertFallbackServiceUrl,
  getCloudRunUrl,
  grantWorkerFallbackInvoker,
} from "./lib/gcp.js";

/** Cloud Run service name for each hash key of `computeServiceHashes()`. */
export const BPM_SERVICES = Object.freeze({
  worker: "bpm-worker",
  fallback: "bpm-fallback-service",
  main: "bpm-service",
});

/**
 * @param {{
 *   previousHashes: Record<string, string | undefined>,
 *   force?: boolean,
 *   log?: (message: string) => void,
 * }} options `previousHashes` is keyed by Cloud Run service name
 * @returns {{ deployed: string[], services: Record<string, { contentHash: string, url: string }> }}
 */
export function deployBpmServices({ previousHashes, force = false, log = console.log }) {
  const hashes = computeServiceHashes();
  const changed = (key) => force || previousHashes[BPM_SERVICES[key]] !== hashes[key];
  const deployEnv = { ...process.env, ...GCP_CONFIG };
  const options = { cwd: repoRoot(), env: deployEnv };
  const deployed = [];

  const workerChanged = changed("worker");
  const fallbackChanged = changed("fallback");

  if (workerChanged) {
    log("Deploying bpm-worker (changes detected)");
    run("./deploy_worker.sh", options);
    deployed.push(BPM_SERVICES.worker);
  } else {
    log("bpm-worker unchanged — skipped");
  }

  if (fallbackChanged) {
    log("Deploying bpm-fallback-service (changes detected)");
    run("./deploy_fallback.sh", options);
    deployed.push(BPM_SERVICES.fallback);
  } else {
    log("bpm-fallback-service unchanged — skipped");
  }

  assertFallbackServiceUrl(getCloudRunUrl(BPM_SERVICES.fallback, GCP_CONFIG));
  grantWorkerFallbackInvoker(GCP_CONFIG);

  if (changed("main") || workerChanged || fallbackChanged) {
    log("Deploying bpm-service");
    run("./deploy.sh", options);
    deployed.push(BPM_SERVICES.main);
  } else {
    log("bpm-service unchanged — skipped");
  }

  const services = {};
  for (const [key, name] of Object.entries(BPM_SERVICES)) {
    services[name] = { contentHash: hashes[key], url: getCloudRunUrl(name, GCP_CONFIG) };
  }
  return { deployed, services };
}
