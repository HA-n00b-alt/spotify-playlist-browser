import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/env.js";

const root = repoRoot();

const expectedRoutes = [
  { file: "main.py", routes: ['@app.get("/health")', '@app.post("/analyze/batch"', '@app.get("/stream/{batch_id}")', '@app.get("/batch/{batch_id}"'] },
  { file: "worker.py", routes: ['@app.get("/health")', '@app.post("/pubsub/process")'] },
  { file: "fallback_service.py", routes: ['@app.get("/health")', '@app.post("/process_batch"'] },
];

for (const { file, routes } of expectedRoutes) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  for (const route of routes) {
    if (!content.includes(route)) {
      console.error(`check:api-routes failed — ${file} missing route marker: ${route}`);
      process.exit(1);
    }
  }
}

console.log("check:api-routes passed");
