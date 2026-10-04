import { spawnSync } from "node:child_process";

export function run(command, options = {}) {
  const { cwd = process.cwd(), env = process.env, quiet = false } = options;
  if (!quiet) {
    console.log(`\n▶ ${command}`);
  }
  const result = spawnSync(command, {
    cwd,
    env,
    shell: true,
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(`Command failed (${result.status}): ${command}${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
}

export function runOrEmpty(command, options = {}) {
  try {
    return run(command, { ...options, quiet: true });
  } catch {
    return "";
  }
}
