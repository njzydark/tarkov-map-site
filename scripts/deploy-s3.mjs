#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadEnv } from 'dotenv';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
loadEnv({ path: resolve(projectRoot, '.env'), quiet: true });
const args = process.argv.slice(2);

function option(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: npm run deploy:s3 -- --endpoint <url> --bucket <name>

Options/environment:
  --endpoint / S3_ENDPOINT   S3 API endpoint (required)
  --bucket / S3_BUCKET      Bucket name (required)
  --region / S3_REGION      S3 signing region (default: us-east-1)
  --prefix / S3_PREFIX      Optional object prefix
  --no-build                Upload the existing dist without rebuilding
  --dry-run                 Show files without uploading

Environment variables are loaded automatically from the project-root .env file.
Credentials use the standard AWS environment/profile chain, for example
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN or AWS_PROFILE.`);
  process.exit(0);
}

const endpoint = option('--endpoint') ?? process.env.S3_ENDPOINT;
const bucket = option('--bucket') ?? process.env.S3_BUCKET;
const region = option('--region') ?? process.env.S3_REGION ?? 'us-east-1';
const prefix = (option('--prefix') ?? process.env.S3_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
const dryRun = args.includes('--dry-run');
const shouldBuild = !args.includes('--no-build');

if (!endpoint) throw new Error('Missing S3 endpoint. Pass --endpoint or set S3_ENDPOINT.');
if (!bucket) throw new Error('Missing bucket. Pass --bucket or set S3_BUCKET.');
new URL(endpoint);

function run(command, commandArgs) {
  return new Promise((accept, reject) => {
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

function contentType(file) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };
  return types[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

const wait = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds));

async function putFile(client, { file, key, relativePath, size, cacheControl }) {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: contentType(file),
        CacheControl: cacheControl,
      }));
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const status = error?.$metadata?.httpStatusCode;
      console.warn(`retrying ${relativePath} after ${status ? `HTTP ${status}` : 'upload error'} (${attempt}/${attempts})`);
      await wait(500 * (2 ** (attempt - 1)));
    }
  }
}

if (shouldBuild) await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

const distRoot = resolve(projectRoot, 'dist');
const distFiles = await walk(distRoot);
if (distFiles.length === 0) throw new Error(`No files found in ${distRoot}.`);
const uploads = distFiles.map((file) => ({
  file,
  relativePath: relative(distRoot, file).split(sep).join('/'),
}));

const client = dryRun ? null : new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
let cursor = 0;
const concurrency = Math.min(6, uploads.length);

async function uploadWorker() {
  while (cursor < uploads.length) {
    const { file, relativePath } = uploads[cursor++];
    const key = prefix ? `${prefix}/${relativePath}` : relativePath;
    const cacheControl = relativePath === 'index.html'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';
    const size = (await stat(file)).size;
    console.log(`${dryRun ? 'would upload' : 'uploading'} s3://${bucket}/${key} (${size} bytes)`);
    if (!client) continue;
    await putFile(client, { file, key, relativePath, size, cacheControl });
  }
}

await Promise.all(Array.from({ length: concurrency }, uploadWorker));
console.log(`\n${dryRun ? 'Planned' : 'Uploaded'} ${uploads.length} files ${dryRun ? 'for' : 'to'} s3://${bucket}/${prefix}`);
