import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./env.js";

function createClient(config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function readBody(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readRemoteManifest(config) {
  const client = createClient(config);
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: config.R2_MANIFEST_KEY,
      })
    );
    const body = await readBody(response.Body);
    return JSON.parse(body);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function writeRemoteManifest(config, manifest) {
  const client = createClient(config);
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  await client.send(
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: config.R2_MANIFEST_KEY,
      Body: payload,
      ContentType: "application/json",
    })
  );
}

export function readLocalLock() {
  const lockPath = path.join(repoRoot(), "deploy.lock.json");
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

export function writeLocalLock(manifest) {
  const lockPath = path.join(repoRoot(), "deploy.lock.json");
  fs.writeFileSync(lockPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function readDeploymentManifest(config, { hasR2Manifest }) {
  if (hasR2Manifest(config)) {
    const remote = await readRemoteManifest(config);
    if (remote) {
      return remote;
    }
  }
  return readLocalLock();
}

export async function writeDeploymentManifest(config, manifest, { hasR2Manifest }) {
  writeLocalLock(manifest);
  if (hasR2Manifest(config)) {
    await writeRemoteManifest(config, manifest);
  }
}
