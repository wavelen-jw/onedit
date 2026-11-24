import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { schemaDocument, version, methods } from "./dist/ai-host-v1/wire.js";

const write = process.argv.includes("--write");
const read = async name => JSON.parse(await readFile(new URL("./schema/" + name, import.meta.url)));
for (const kind of ["request", "response"]) {
  const name = kind + ".schema.json", schema = schemaDocument(kind);
  if (write) await writeFile(new URL("./schema/" + name, import.meta.url), JSON.stringify(schema, null, 2) + "\n");
  else assert.deepEqual(await read(name), schema);
}
const surface = await read("surface.json");
for (const [key, value] of Object.entries(version)) assert.equal(surface.identity[key], value);
assert.deepEqual(Object.fromEntries(Object.entries(surface.methods).map(([name, entry]) => [name, entry.scope])),
  Object.fromEntries(Object.entries(methods).map(([name, [, scope]]) => [name, scope])));
