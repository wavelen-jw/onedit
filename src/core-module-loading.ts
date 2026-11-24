import { rootEditorCoreSha256 } from "./root-editor-core-binding.js";
import { verifiedAssetBytes } from "./verified-asset-cache.js";
import { startupNow, startupStage } from "./startup-timing.js";

async function compileRootCore(): Promise<WebAssembly.Module> {
  const asset = new URL("./" + rootEditorCoreSha256 + "-rhwp_bg.wasm", import.meta.url);
  const readStart = startupNow();
  const bytes = await verifiedAssetBytes(asset, rootEditorCoreSha256, "wasm");
  startupStage("core-verified-bytes", readStart);
  const compileStart = startupNow();
  const module = await WebAssembly.compile(bytes);
  startupStage("core-compile", compileStart);
  return module;
}

// Begin the same verified load while the editor's UI module graph is loading.
// The runtime consumes this promise once. Subsequent factories own fresh loads.
let starting: Promise<WebAssembly.Module> | undefined;
export function startRootCoreLoad() {
  if (starting) return;
  starting = compileRootCore();
  // UI import can still be pending when verification fails. The original
  // rejection is delivered to its normal startup handler in takeRootCoreModule.
  void starting.catch(() => {});
}

export function takeRootCoreModule(): Promise<WebAssembly.Module> {
  const module = starting;
  starting = undefined;
  return module ?? compileRootCore();
}
