import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/** The GCP project and region every BPM service runs in. The root env contract pins the same project. */
export const GCP_CONFIG = Object.freeze({
  PROJECT_ID: "delman-site",
  REGION: "europe-west3",
});

/** `services/bpm/`: the directory the deploy scripts, Dockerfiles and Python sources live in. */
export function repoRoot() {
  return REPO_ROOT;
}
