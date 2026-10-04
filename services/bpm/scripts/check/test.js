import { spawnSync } from "node:child_process";
import { repoRoot } from "../lib/env.js";

const root = repoRoot();

const compile = spawnSync("python3", ["-m", "compileall", "-q", "."], {
  cwd: root,
  stdio: "inherit",
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const astCheck = spawnSync(
  "python3",
  [
    "-c",
    `import ast, pathlib
root = pathlib.Path(${JSON.stringify(root)})
for path in sorted(root.glob('*.py')):
    ast.parse(path.read_text(), filename=str(path))
print('ast-parse ok')`,
  ],
  { cwd: root, stdio: "inherit" }
);
if (astCheck.status !== 0) {
  process.exit(astCheck.status ?? 1);
}

console.log("test passed");
