// Deterministic .flow zips (stored, fixed timestamps, sorted names) so a
// release asset's sha256 depends only on file bytes. VERSION is release
// metadata and is not packed — the app never reads it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FLOWS = join(ROOT, "flows");
const DIST = join(ROOT, "dist");
const REPO = "flow-registry/flow-package";
// Registry metadata and the version pin are not part of the runtime zip.
const SKIP = new Set(["VERSION", "registry.yaml", ".DS_Store"]);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

const CRC_CHECK = crc32(Buffer.from("123456789"));
if (CRC_CHECK !== 0xcbf43926) {
  console.error(`crc32 self-check failed: ${CRC_CHECK.toString(16)}`);
  process.exit(1);
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

// DOS date 1980-01-01, time 00:00:00. Flag bit 11 marks UTF-8 names.
function zipStored(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x800),
      u16(0),
      u16(0),
      u16(0x21),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x800),
      u16(0),
      u16(0),
      u16(0x21),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, end]);
}

function addCap(caps, name) {
  if (name && !caps.includes(name)) caps.push(name);
}

// Capabilities are derived, not copied into the index by hand: tool steps,
// ct.tool.call("...") / ct.storage.* in imported modules, plus script.eval
// when the manifest has a js step.
function capabilities(dir, manifest) {
  const caps = [];
  const toolRe = /ct\.tool\.call\(\s*["']([a-z_][a-z0-9_.]*)["']/g;
  for (const step of manifest.steps || []) {
    if (step && typeof step.tool === "string") addCap(caps, step.tool);
  }
  for (const rel of manifest.import || []) {
    let src = "";
    try { src = readFileSync(join(dir, rel), "utf8"); } catch { continue; }
    for (const match of src.matchAll(toolRe)) addCap(caps, match[1]);
    if (/ct\.storage\.kv\b/.test(src)) addCap(caps, "storage.kv");
    if (/ct\.storage\.n\b/.test(src)) addCap(caps, "storage.n");
  }
  if ((manifest.steps || []).some((step) => step && step.js)) addCap(caps, "script.eval");
  return caps;
}

function catalogEntry(id, dir, built) {
  const manifest = yaml.load(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  const reg = yaml.load(readFileSync(join(dir, "registry.yaml"), "utf8")) || {};
  const entry = {
    id,
    name: manifest.name,
    author: reg.author,
    description: manifest.description,
    version: built.version,
  };
  if (reg.minApp) entry.minApp = reg.minApp;
  entry.tags = reg.tags || [];
  entry.capabilities = capabilities(dir, manifest);
  entry.repo = REPO;
  entry.path = `flows/${id}`;
  entry.distUrl = built.distUrl;
  entry.sha256 = built.sha256;
  if (reg.seed) entry.seed = true;
  return entry;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

mkdirSync(DIST, { recursive: true });
const packages = {};
for (const id of readdirSync(FLOWS).filter((n) => statSync(join(FLOWS, n)).isDirectory()).sort()) {
  const dir = join(FLOWS, id);
  const version = readFileSync(join(dir, "VERSION"), "utf8").trim();
  const files = walk(dir)
    .map((path) => ({
      name: relative(dir, path).split(sep).join("/"),
      data: readFileSync(path),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!files.some((f) => f.name === "manifest.yaml")) {
    console.error(`${id}: manifest.yaml missing`);
    process.exit(1);
  }
  const bytes = zipStored(files);
  const file = `${id}.flow`;
  writeFileSync(join(DIST, file), bytes);
  const tag = `${id}-v${version}`;
  packages[id] = {
    version,
    tag,
    file,
    distUrl: `https://github.com/${REPO}/releases/download/${tag}/${file}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  console.log(`${file}  ${packages[id].sha256}  ${bytes.length}B  ${tag}`);
}

const index = { repo: REPO, packages };
writeFileSync(join(DIST, "index.json"), JSON.stringify(index, null, 2) + "\n");
const catalog = Object.keys(packages).sort().map((id) => catalogEntry(id, join(FLOWS, id), packages[id]));
writeFileSync(join(ROOT, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`dist/index.json + catalog.json: ${catalog.length} packages`);
