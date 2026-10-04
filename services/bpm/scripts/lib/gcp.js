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

/**
 * Fails when `FALLBACK_SERVICE_URL` in shared_processing.py is not the live fallback URL. The worker
 * and main service bake that constant into their images, so a mismatch has to be fixed in the
 * source through a pull request; the deploy no longer rewrites and commits the file itself.
 */
export function assertFallbackServiceUrl(fallbackUrl) {
  const content = fs.readFileSync(path.join(repoRoot(), "shared_processing.py"), "utf8");
  const match = content.match(FALLBACK_URL_PATTERN);
  if (!match) {
    throw new Error("FALLBACK_SERVICE_URL not found in services/bpm/shared_processing.py");
  }
  if (match[0] !== `FALLBACK_SERVICE_URL = "${fallbackUrl}"`) {
    throw new Error(
      `services/bpm/shared_processing.py has ${match[0]}, but bpm-fallback-service is served at ` +
        `${fallbackUrl}. Update the constant through a pull request, then deploy again.`
    );
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
