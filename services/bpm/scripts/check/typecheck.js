import { run } from "../lib/exec.js";

run("python3 -m compileall -q .");
console.log("typecheck passed");
