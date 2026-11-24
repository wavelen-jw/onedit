import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseAssetManifest } from "./static-asset-policy.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const runtimeAsset = /^assets\/[a-f0-9]{64}-[a-zA-Z0-9_.-]+$/;

export async function browserRuntimeInventory(root) {
  const manifestBytes = await readFile(join(root, "asset-manifest.json"));
  const manifest = parseAssetManifest(manifestBytes.toString("utf8"));
  const files = { ...manifest.files };
  if (!Object.keys(files).length || Object.entries(files).some(([name, hash]) =>
    !runtimeAsset.test(name) || !/^[a-f0-9]{64}$/.test(hash)))
    throw Error("Invalid browser asset inventory");
  const published = ["index.html", "asset-manifest.json"];
  for (const directory of ["public/fonts", "public/brand"]) {
    for (const name of await readdir(join(root, directory))) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw Error("Invalid browser resource name");
      published.push(directory + "/" + name);
    }
  }
  for (const name of published.sort()) {
    const path = join(root, name);
    if (!(await lstat(path)).isFile()) throw Error("Invalid browser resource");
    files[name] = sha256(await readFile(path));
  }
  return files;
}
