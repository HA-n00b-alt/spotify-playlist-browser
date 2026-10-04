import { run } from "./exec.js";
import { askConfirm } from "./prompt.js";

/** Paths the deploy orchestrator may commit back to the branch (standards step 8). */
const DEPLOY_COMMIT_PATHS = [
  "deploy.lock.json",
  "shared_processing.py",
  "package.json",
  "package-lock.json",
  "scripts/",
  "deploy.sh",
  "deploy_worker.sh",
  "deploy_fallback.sh",
  ".env.deploy.example",
  ".gitignore",
  "README.md",
  "CONSUMER-MIGRATION.md",
  "PIPELINES-LOGGING-ANALYTICS-STANDARDS.md",
  "main.py",
  "monitor_logs.sh",
  "test_api.sh",
  "test_concurrency.sh",
  "test_fallback_auth.sh",
  "test_fallback_direct.sh",
];

export async function maybeCommitAndSync(log) {
  if (process.env.DEPLOY_SKIP_GIT_COMMIT === "1") {
    log("DEPLOY_SKIP_GIT_COMMIT=1 — skipping git commit/sync");
    return;
  }

  for (const path of DEPLOY_COMMIT_PATHS) {
    run(`git add -- ${path}`, { quiet: true });
  }

  const staged = run("git diff --staged --name-only", { quiet: true });
  if (!staged) {
    log("No git changes to commit");
    return;
  }

  console.log("\nCommitting deployment tracking changes:");
  for (const file of staged.split("\n").filter(Boolean)) {
    console.log(`  - ${file}`);
  }
  console.log("");

  run('git commit -m "chore: update deployment lock and manifest"');
  log("Git commit created automatically");

  const shouldPush = await askConfirm("Push commit to remote?");
  if (!shouldPush) {
    log("Git push skipped by user");
    return;
  }

  run("git push");
  log("Git push complete");
}
