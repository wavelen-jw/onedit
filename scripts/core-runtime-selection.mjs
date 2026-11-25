import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const provenanceFile = "core/selected-runtime-provenance.json";
const runtimeFile = "development-runtime.json";
const bindingFile = "src/root-editor-core-binding.ts";
export const runtimeNames = ["rhwp.js", "rhwp.d.ts", "rhwp_bg.wasm", "rhwp_bg.wasm.d.ts"];
const supported = ["checked-external-open", "editor-format-snapshot", "editor-owner-bindings"];
const digest = /^[a-f0-9]{64}$/;

async function readJson(root, name) {
  return JSON.parse(await readFile(join(root, name), "utf8"));
}

function bindingText(runtime) {
  return `// Generated from development-runtime.json by scripts/core-runtime-selection.mjs.
export const rootEditorCoreSha256: string = ${JSON.stringify(runtime.files["rhwp_bg.wasm"])};
type CoreAdmission = ${supported.map(name => JSON.stringify(name)).join(" | ")};
const admissions: readonly CoreAdmission[] = ${JSON.stringify(runtime.admissions, null, 2)};
export function hasSelectedCoreAdmission(sha256: string | undefined, capability: CoreAdmission) {
  return sha256 === rootEditorCoreSha256 && admissions.includes(capability);
}
`;
}

function validateRuntime(runtime) {
  assert.equal(runtime.schema, 2, "Unsupported selected Core manifest");
  assert.equal(runtime.source, "development/core");
  assert.deepEqual(Object.keys(runtime.files).sort(), [...runtimeNames].sort());
  for (const pin of Object.values(runtime.files)) assert.match(pin, digest);
  assert.ok(Array.isArray(runtime.admissions) &&
    runtime.admissions.every(name => supported.includes(name)) &&
    new Set(runtime.admissions).size === runtime.admissions.length, "Invalid Core admission names");
}

function validateProvenance(provenance) {
  assert.equal(provenance.schema, 1);
  const gitObject = /^[a-f0-9]{40}$/;
  for (const key of ["commit", "tree", "parent", "patchBaseline"])
    assert.match(provenance.core[key], gitObject);
  const commits = provenance.core.orderedCommits;
  assert.ok(Array.isArray(commits) && commits.every(sha => gitObject.test(sha)));
  assert.equal(commits.at(-1), provenance.core.commit);
  assert.equal(commits.at(-2) ?? provenance.core.patchBaseline, provenance.core.parent);
  assert.match(provenance.core.cargoLockSha256, digest);
  assert.match(provenance.build.recipeSha256, digest);
  validateRuntime(provenance.runtime);
  for (const name of provenance.runtime.admissions)
    assert.ok(provenance.reviews[name]?.length, `Missing Core admission review: ${name}`);
}

export async function readRuntimeSelection(base = root) {
  const runtime = await readJson(base, runtimeFile);
  validateRuntime(runtime);
  const provenance = await readJson(base, provenanceFile).catch(error => {
    // The public editor package contains the projection and four runtime pins.
    if (error.code !== "ENOENT") throw error;
  });
  if (provenance) {
    validateProvenance(provenance);
    assert.deepEqual(runtime, provenance.runtime, "Selected Core projection differs from the private record");
  }
  assert.equal(await readFile(join(base, bindingFile), "utf8"), bindingText(runtime),
    "Selected Core binding differs from the projected manifest");
  return runtime;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--write")) {
    const provenance = await readJson(root, provenanceFile);
    validateProvenance(provenance);
    const { runtime } = provenance;
    for (const name of runtimeNames) {
      const pin = createHash("sha256").update(await readFile(join(root, runtime.source, name))).digest("hex");
      assert.equal(pin, runtime.files[name], `${name} differs from the selected Core`);
    }
    await writeFile(join(root, runtimeFile), JSON.stringify(runtime, null, 2) + "\n");
    await writeFile(join(root, bindingFile), bindingText(runtime));
  } else {
    await readRuntimeSelection();
  }
}
