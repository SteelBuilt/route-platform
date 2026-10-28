// Private file storage. Cloudflare R2 (S3 API) when R2_* variables are set;
// otherwise, in development and tests only, files are stored on local disk
// under .data/uploads and served through HMAC-signed, expiring URLs.
// Production refuses to run without R2.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { devSecret, env } from "@/config/env";

export interface StorageAdapter {
  kind: "r2" | "local";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedGetUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string>;
}

function r2Config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return { account: R2_ACCOUNT_ID, key: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET };
  }
  return null;
}

class R2Storage implements StorageAdapter {
  kind = "r2" as const;
  private client: AwsClient;
  private base: string;
  constructor(c: NonNullable<ReturnType<typeof r2Config>>) {
    this.client = new AwsClient({ accessKeyId: c.key, secretAccessKey: c.secret, service: "s3", region: "auto" });
    this.base = `https://${c.account}.r2.cloudflarestorage.com/${c.bucket}`;
  }
  async put(key: string, bytes: Uint8Array, contentType: string) {
    const res = await this.client.fetch(`${this.base}/${key}`, {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
  }
  async signedGetUrl(key: string, ttlSeconds: number, downloadName: string) {
    const url = new URL(`${this.base}/${key}`);
    url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    url.searchParams.set("response-content-disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
    const signed = await this.client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
    return signed.url;
  }
}

function signingSecret() {
  return env().APP_SIGNING_SECRET ?? devSecret("signing");
}

export function signLocalToken(key: string, expiresAt: number, name: string) {
  const payload = Buffer.from(JSON.stringify({ k: key, e: expiresAt, n: name })).toString("base64url");
  const sig = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyLocalToken(token: string, now = Date.now()): { key: string; name: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k: string; e: number; n: string };
  if (data.e < now) return null;
  return { key: data.k, name: data.n };
}

export function localRoot() {
  return path.join(process.cwd(), ".data", "uploads");
}

class LocalStorage implements StorageAdapter {
  kind = "local" as const;
  async put(key: string, bytes: Uint8Array) {
    const file = path.join(localRoot(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  async signedGetUrl(key: string, ttlSeconds: number, downloadName: string) {
    const token = signLocalToken(key, Date.now() + ttlSeconds * 1000, downloadName);
    return `${env().APP_URL}/api/files/local/${token}`;
  }
}

export async function readLocal(key: string) {
  const root = localRoot();
  const file = path.resolve(root, key);
  if (!file.startsWith(root)) throw new Error("Invalid key");
  return readFile(file);
}

let adapter: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (adapter) return adapter;
  const c = r2Config();
  if (c) adapter = new R2Storage(c);
  else if (env().NODE_ENV === "production") throw new Error("R2 storage is not configured");
  else adapter = new LocalStorage();
  return adapter;
}
