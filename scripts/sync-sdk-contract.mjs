import { readFile, writeFile } from "node:fs/promises";

const files = ["ai-host-v1/wire.ts", "ai-integration/contract.ts"];
const write = process.argv.includes("--write");
for (const name of files) {
  const source = await readFile(new URL("../src/" + name, import.meta.url));
  const destination = new URL("../sdk/src/" + name, import.meta.url);
  if (write) await writeFile(destination, source);
  else if (!source.equals(await readFile(destination)))
    throw Error("SDK contract differs from the editor source: " + name);
}
