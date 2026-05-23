import type { S3Client, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';

/**
 * Lazy R2 client (ADR-014). Wraps the AWS S3 SDK (R2 is S3-compatible)
 * with the Resend-style lazy-init pattern: module import is side-effect
 * free, the SDK is only instantiated on first use, and a clean
 * `r2_not_configured` sentinel surfaces when env vars are absent so
 * Next.js build-time page data collection doesn't require R2 secrets.
 *
 * Env vars consumed (see .env.example):
 *   R2_ENDPOINT          — e.g. https://<account>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME       — defaults to "peptides-exports"
 */

let _client: S3Client | null = null;
let _initError: Error | null = null;

export class R2NotConfiguredError extends Error {
  constructor() {
    super('r2_not_configured');
    this.name = 'R2NotConfiguredError';
  }
}

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function readConfig(): R2Config | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME ?? 'peptides-exports';
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

export function getR2Bucket(): string {
  const cfg = readConfig();
  if (!cfg) throw new R2NotConfiguredError();
  return cfg.bucket;
}

async function getClient(): Promise<S3Client> {
  if (_initError) throw _initError;
  if (_client) return _client;
  const cfg = readConfig();
  if (!cfg) {
    _initError = new R2NotConfiguredError();
    throw _initError;
  }
  const mod = await import('@aws-sdk/client-s3');
  _client = new mod.S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // R2 doesn't use AWS request-checksum headers; opt out so the
    // request doesn't fail validation on the Cloudflare edge.
    forcePathStyle: true,
  });
  return _client;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType?: string;
}

export async function r2PutObject(input: PutObjectInput): Promise<void> {
  const cfg = readConfig();
  if (!cfg) throw new R2NotConfiguredError();
  const client = await getClient();
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType ?? 'application/octet-stream',
    })
  );
}

export async function r2DeleteObject(key: string): Promise<void> {
  const cfg = readConfig();
  if (!cfg) throw new R2NotConfiguredError();
  const client = await getClient();
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

export interface ListedObject {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * Lists objects under a prefix. Walks ContinuationToken pages so a backlog
 * larger than 1000 keys still resolves.
 */
export async function r2ListObjects(prefix: string): Promise<ListedObject[]> {
  const cfg = readConfig();
  if (!cfg) throw new R2NotConfiguredError();
  const client = await getClient();
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const out: ListedObject[] = [];
  let token: string | undefined = undefined;
  for (;;) {
    const cmd = new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: prefix,
      ContinuationToken: token,
    });
    const res = (await client.send(cmd)) as ListObjectsV2CommandOutput;
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || !obj.LastModified) continue;
      out.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified,
      });
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
    if (!token) break;
  }
  return out;
}

export async function r2PresignGetUrl(key: string, expiresInSeconds: number): Promise<string> {
  const cfg = readConfig();
  if (!cfg) throw new R2NotConfiguredError();
  const client = await getClient();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const presigner = await import('@aws-sdk/s3-request-presigner');
  return presigner.getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Test-only: reset the cached client between tests. */
export function __resetR2ClientForTesting(): void {
  _client = null;
  _initError = null;
}
