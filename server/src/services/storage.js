import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const LOCAL_PREFIX = '/uploads/';
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

const localDriver = {
  async put(key, buffer) {
    const file = path.join(config.uploadDir, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    return `${LOCAL_PREFIX}${key}`;
  },
  async remove(url) {
    if (!url?.startsWith(LOCAL_PREFIX)) return;
    const file = path.resolve(config.uploadDir, url.slice(LOCAL_PREFIX.length));
    if (!file.startsWith(path.resolve(config.uploadDir) + path.sep)) return; // path traversal guard
    await fs.rm(file, { force: true });
  },
};

let s3Client;
async function getS3() {
  const sdk = await import('@aws-sdk/client-s3');
  if (!s3Client) {
    s3Client = new sdk.S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    });
  }
  return { sdk, client: s3Client };
}

const s3Base = () => `${(config.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/`;

const s3Driver = {
  async put(key, buffer, contentType) {
    const { sdk, client } = await getS3();
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${s3Base()}${key}`;
  },
  async remove(url) {
    if (!url?.startsWith(s3Base())) return;
    const { sdk, client } = await getS3();
    await client.send(new sdk.DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: url.slice(s3Base().length) }));
  },
};

const driver = () => (config.STORAGE_DRIVER === 's3' ? s3Driver : localDriver);

/**
 * Validates an uploaded image by decoding it, strips metadata (EXIF/GPS),
 * normalises orientation and size, and stores it as WebP under a random name.
 */
export async function storeImage(buffer, { folder, maxSize = 1600 }) {
  let output;
  try {
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!ALLOWED_FORMATS.has(meta.format)) throw new Error(`format ${meta.format}`);
    output = await image
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badRequest('The uploaded file is not a valid image.');
  }
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `${folder}/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.webp`;
  return driver().put(key, output, 'image/webp');
}

export async function removeStoredFile(url) {
  try {
    await driver().remove(url);
  } catch (err) {
    logger.warn({ err, url }, 'Failed to delete stored file');
  }
}
