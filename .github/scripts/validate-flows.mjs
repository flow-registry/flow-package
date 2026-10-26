import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FLOWS = join(ROOT, "flows");
const ID = /^[a-z0-9]([a-z0-9-]{0,62})$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const errors = [];

let ids = [];
try {
  ids = readdirSync(FLOWS).filter((name) => statSync(join(FLOWS, name)).isDirectory());
} catch (e) {
  console.error(`✗ flows/ missing — ${e.message}`);
  process.exit(1);
}
if (ids.length === 0) errors.push("flows/ has no packages");

for (const id of ids.sort()) {
  const dir = join(FLOWS, id);
  const where = id;
  if (!ID.test(id)) errors.push(`${where}: directory name is not a flow id`);
  const versionPath = join(dir, "VERSION");
  if (!existsSync(versionPath)) errors.push(`${where}: VERSION missing`);
  else {
    const version = readFileSync(versionPath, "utf8").trim();
    if (!SEMVER.test(version)) errors.push(`${where}: VERSION "${version}" must be semver x.y.z`);
    if (readFileSync(versionPath, "utf8") !== version + "\n")
      errors.push(`${where}: VERSION must be a single line ending in newline`);
  }
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    errors.push(`${where}: manifest.yaml missing`);
    continue;
  }
  let manifest;
  try {
    manifest = yaml.load(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    errors.push(`${where}: manifest.yaml does not parse — ${e.message}`);
    continue;
  }
  if (!manifest || manifest.flow !== "1") errors.push(`${where}: manifest must declare flow: "1"`);
  if (!manifest?.name || !manifest?.description)
    errors.push(`${where}: manifest needs name + description`);
  if (manifest?.description && String(manifest.description).length > 200)
    errors.push(`${where}: manifest description > 200 chars`);
  if (!manifest?.trigger || typeof manifest.trigger !== "object")
    errors.push(`${where}: manifest needs a trigger object`);
  const steps = manifest?.steps;
  if (!Array.isArray(steps) || steps.length === 0)
    errors.push(`${where}: manifest needs at least one step`);
  const imported = new Set(
    (manifest?.import || []).map((p) => String(p).replace(/^scripts\//, "").replace(/\.js$/, "")),
  );
  for (const [i, s] of (steps || []).entries()) {
    if (typeof s !== "object" || s === null || ("tool" in s) === ("js" in s))
      errors.push(`${where}: steps[${i}] must carry exactly one of tool:/js:`);
    if (s?.js && !/^[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*$/.test(s.js))
      errors.push(`${where}: steps[${i}] js must be "<module>.<function>"`);
    if (s?.js && !imported.has(s.js.split(".")[0]))
      errors.push(`${where}: steps[${i}] module ${s.js.split(".")[0]} is not in import`);
  }
  for (const mod of manifest?.import || []) {
    if (!existsSync(join(dir, mod))) errors.push(`${where}: import ${mod} missing`);
  }
  const view = manifest?.flowView || {};
  for (const k of ["cell", "detail"]) {
    if (view[k] && !existsSync(join(dir, view[k])))
      errors.push(`${where}: flowView.${k} ${view[k]} missing`);
  }
  if (!existsSync(join(dir, "README.md")))
    errors.push(`${where}: README.md missing`);
  const registryPath = join(dir, "registry.yaml");
  if (!existsSync(registryPath)) {
    errors.push(`${where}: registry.yaml missing (author/tags/seed/minApp)`);
  } else {
    let reg;
    try {
      reg = yaml.load(readFileSync(registryPath, "utf8"));
    } catch (e) {
      errors.push(`${where}: registry.yaml does not parse — ${e.message}`);
      reg = null;
    }
    if (reg) {
      const allowed = new Set(["author", "tags", "seed", "minApp"]);
      for (const key of Object.keys(reg)) {
        if (!allowed.has(key))
          errors.push(`${where}: registry.yaml field "${key}" is generated elsewhere — do not set it`);
      }
      if (typeof reg.author !== "string" || !reg.author.trim())
        errors.push(`${where}: registry.yaml needs author`);
      if (!Array.isArray(reg.tags) || reg.tags.some((t) => typeof t !== "string" || !t.trim()))
        errors.push(`${where}: registry.yaml tags must be a non-empty-string array`);
      if (reg.seed !== undefined && typeof reg.seed !== "boolean")
        errors.push(`${where}: registry.yaml seed must be boolean`);
      if (reg.minApp !== undefined && !SEMVER.test(reg.minApp))
        errors.push(`${where}: registry.yaml minApp must be semver x.y.z`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`flows: ${ids.length} packages OK`);
