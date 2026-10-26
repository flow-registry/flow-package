// Publish one immutable GitHub Release per package: tag <id>-v<version>,
// asset <id>.flow. A tag whose asset hash differs from this tree fails the
// job — bump flows/<id>/VERSION instead of replacing bytes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const index = JSON.parse(readFileSync(join(ROOT, "dist", "index.json"), "utf8"));

function gh(args, inherit = false) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}
function tryGh(args) {
  try {
    return gh(args);
  } catch {
    return null;
  }
}

let failed = false;
for (const [id, pkg] of Object.entries(index.packages)) {
  const tag = pkg.tag;
  const assetPath = join(ROOT, "dist", pkg.file);
  const notes = [
    `${id} ${pkg.version}`,
    "",
    `sha256: ${pkg.sha256}`,
    `bytes: ${pkg.bytes}`,
    `url: ${pkg.distUrl}`,
    "",
    "Built from flows/" + id + " (VERSION excluded from the zip).",
  ].join("\n");

  const view = tryGh(["release", "view", tag, "--json", "assets,tagName"]);
  if (!view) {
    gh([
      "release", "create", tag, assetPath,
      "--title", `${id} ${pkg.version}`,
      "--notes", notes,
    ], true);
    console.log(`created ${tag}`);
    continue;
  }
  const assets = JSON.parse(view).assets || [];
  if (!assets.some((a) => a.name === pkg.file)) {
    gh(["release", "upload", tag, assetPath, "--clobber"], true);
    console.log(`uploaded missing asset on ${tag}`);
    continue;
  }
  const dir = mkdtempSync(join(tmpdir(), "fpkg-"));
  try {
    gh(["release", "download", tag, "--pattern", pkg.file, "--dir", dir, "--clobber"], true);
    const got = createHash("sha256").update(readFileSync(join(dir, pkg.file))).digest("hex");
    if (got !== pkg.sha256) {
      console.error(`✗ ${tag} is immutable and already has sha256 ${got}`);
      console.error(`  this tree would publish ${pkg.sha256}`);
      console.error(`  bump flows/${id}/VERSION and ship a new tag`);
      failed = true;
    } else {
      console.log(`${tag} unchanged`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failed) process.exit(1);
console.log("releases match dist/index.json");
