// A minimal S3 client for the round-history bucket on MinIO: signature
// version 4 over fetch, path-style, no dependencies. put, get, list, and
// the bucket's creation.
import { createHmac, createHash } from "node:crypto";
const sha = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
export class S3 {
  constructor({ endpoint, accessKey, secretKey, region = "us-east-1" }) { this.endpoint = endpoint.replace(/\/$/, ""); this.accessKey = accessKey; this.secretKey = secretKey; this.region = region; }
  async request(method, path, body = null, query = "") {
    const url = new URL(this.endpoint + path + (query ? `?${query}` : ""));
    const now = new Date(); const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); const date = amz.slice(0, 8);
    const payload = body ? sha(body) : sha("");
    const headers = { host: url.host, "x-amz-content-sha256": payload, "x-amz-date": amz };
    const signed = Object.keys(headers).sort(); const canonicalHeaders = signed.map((h) => `${h}:${headers[h]}\n`).join("");
    const canonicalQuery = [...url.searchParams].sort().map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const canonical = [method, url.pathname, canonicalQuery, canonicalHeaders, signed.join(";"), payload].join("\n");
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n");
    const key = hmac(hmac(hmac(hmac("AWS4" + this.secretKey, date), this.region), "s3"), "aws4_request");
    const sig = createHmac("sha256", key).update(toSign).digest("hex");
    const res = await fetch(url, { method, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${sig}` }, body: body || undefined });
    return res;
  }
  async ensureBucket(bucket) { const r = await this.request("PUT", `/${bucket}`); if (![200, 409].includes(r.status)) throw new Error(`bucket ${bucket}: ${r.status} ${(await r.text()).slice(0, 200)}`); return r.status === 200 ? "created" : "exists"; }
  async put(bucket, key, body, contentType = "application/json") { const r = await this.request("PUT", `/${bucket}/${key}`, typeof body === "string" ? body : JSON.stringify(body)); if (!r.ok) throw new Error(`put ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`); return r.headers.get("etag"); }
  async get(bucket, key) { const r = await this.request("GET", `/${bucket}/${key}`); if (r.status === 404) return null; if (!r.ok) throw new Error(`get ${key}: ${r.status}`); return r.json(); }
  async list(bucket, prefix = "") { const r = await this.request("GET", `/${bucket}`, null, `list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`); const t = await r.text(); if (!r.ok) throw new Error(`list: ${r.status} ${t.slice(0, 200)}`); return [...t.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]); }
}
export function roundHistory() { const F = process.env.FROM_HOST === "1"; return new S3({ endpoint: process.env.MINIO_URL || (F ? "http://127.0.0.1:19100" : "http://closed-rounds-and-proofs:9000"), accessKey: process.env.MINIO_ROOT_USER || "demo", secretKey: process.env.MINIO_ROOT_PASSWORD || "demo-only-change-me" }); }
export const BUCKET = "round-history";
