#!/usr/bin/env node

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: npm run maps:generate -- [source-directory]

Options:
  --source <directory>       Original image directory (default: assets/maps)
  --preview-size <pixels>    Preview longest edge (default: 2560)
  --thumb-size <pixels>      Thumbnail longest edge (default: 360)
  --preview-quality <1-100>  Preview WebP quality (default: 82)
  --thumb-quality <1-100>    Thumbnail WebP quality (default: 70)

Image names must end in an ASCII id, for example:
  中心区3D_ground-zero-3d.png`);
  process.exit(0);
}

function positiveInteger(name, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

const positionalSource = args.find((arg, index) => !arg.startsWith('-') && args[index - 1]?.startsWith('--') !== true);
const sourceRoot = resolve(projectRoot, option('--source') ?? positionalSource ?? 'assets/maps');
const previewSize = positiveInteger('--preview-size', 2560);
const thumbSize = positiveInteger('--thumb-size', 360);
const previewQuality = positiveInteger('--preview-quality', 82, 1, 100);
const thumbQuality = positiveInteger('--thumb-quality', 70, 1, 100);
const previewsRoot = resolve(projectRoot, 'previews');
const thumbsRoot = resolve(projectRoot, 'thumbs');
const config = JSON.parse(await readFile(resolve(projectRoot, 'maps.config.json'), 'utf8'));
const supportedExtension = /^\.(?:png|jpe?g)$/i;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseFileName(fileName) {
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  const separator = stem.lastIndexOf('_');
  const candidate = separator >= 0 ? stem.slice(separator + 1) : stem;
  if (!idPattern.test(candidate)) {
    throw new Error(`Cannot derive an ASCII id from "${fileName}". Rename it to <title>_<ascii-id>${extension}.`);
  }
  const rawTitle = separator >= 0 ? stem.slice(0, separator) : candidate.replaceAll('-', ' ');
  return { id: candidate, rawTitle };
}

function inferGroup(title) {
  const firstPart = title.split(/[-－—]/u)[0];
  return firstPart.replace(/[（(].*$/u, '').replace(/\s*[23]D$/iu, '').trim() || '其他';
}

function displayTitle(rawTitle) {
  return rawTitle
    .replaceAll('-', '－')
    .replace(/([^\s])([23]D)$/iu, '$1 $2')
    .trim();
}

function dimensions(metadata) {
  let width = metadata.width;
  let height = metadata.height;
  if (!width || !height) throw new Error('Image dimensions are unavailable.');
  if ([5, 6, 7, 8].includes(metadata.orientation ?? 1)) [width, height] = [height, width];
  return { width, height };
}

const files = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && supportedExtension.test(extname(entry.name)))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'zh-CN'));

if (files.length === 0) throw new Error(`No PNG/JPG images found in ${sourceRoot}`);

await Promise.all([mkdir(previewsRoot, { recursive: true }), mkdir(thumbsRoot, { recursive: true })]);

const seenIds = new Set();
const generated = [];
for (const fileName of files) {
  const { id, rawTitle } = parseFileName(fileName);
  if (seenIds.has(id)) throw new Error(`Duplicate map id "${id}" in ${sourceRoot}.`);
  seenIds.add(id);

  const source = resolve(sourceRoot, fileName);
  const metadata = await sharp(source).metadata();
  const { width, height } = dimensions(metadata);
  const override = config.maps?.[id] ?? {};
  const title = override.title ?? displayTitle(rawTitle);
  const group = override.group ?? inferGroup(title);

  await Promise.all([
    sharp(source).rotate().resize({ width: previewSize, height: previewSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: previewQuality, effort: 6, preset: 'picture', smartSubsample: true })
      .toFile(resolve(previewsRoot, `${id}.webp`)),
    sharp(source).rotate().resize({ width: thumbSize, height: thumbSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: thumbQuality, effort: 5, preset: 'picture', smartSubsample: true })
      .toFile(resolve(thumbsRoot, `${id}.webp`)),
  ]);

  generated.push({ id, group, title, fileName, width, height });
  console.log(`generated ${id} (${width}×${height})`);
}

const order = new Map((config.order ?? []).map((id, index) => [id, index]));
generated.sort((a, b) => {
  const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  return aOrder - bOrder || a.title.localeCompare(b.title, 'zh-CN');
});

const quote = (value) => JSON.stringify(value).replaceAll('</', '<\\/');
const rows = generated.map((map) => (
  `  { id: ${quote(map.id)}, group: ${quote(map.group)}, title: ${quote(map.title)}, original: ${quote(`./${map.fileName}`)}, preview: ${quote(`./previews/${map.id}.webp`)}, thumbnail: ${quote(`./thumbs/${map.id}.webp`)}, width: ${map.width}, height: ${map.height} },`
));
const manifest = `// Generated by scripts/generate-maps.mjs. Edit maps.config.json, not this file.\n` +
`export type MapItem = {\n  id: string;\n  group: string;\n  title: string;\n  original: string;\n  preview: string;\n  thumbnail: string;\n  width: number;\n  height: number;\n};\n\n` +
`export const maps: MapItem[] = [\n${rows.join('\n')}\n];\n`;

await writeFile(resolve(projectRoot, 'src/maps.ts'), manifest, 'utf8');
for (const [directory, label] of [[previewsRoot, 'preview'], [thumbsRoot, 'thumbnail']]) {
  const derivedFiles = await readdir(directory);
  for (const fileName of derivedFiles) {
    if (extname(fileName).toLowerCase() !== '.webp') continue;
    const id = basename(fileName, '.webp');
    if (seenIds.has(id)) continue;
    await unlink(resolve(directory, fileName));
    console.log(`removed stale ${label} ${fileName}`);
  }
}
console.log(`\nDone: ${generated.length} maps from ${sourceRoot}`);
