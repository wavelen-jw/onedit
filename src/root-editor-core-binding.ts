// Generated from development-runtime.json by scripts/core-runtime-selection.mjs.
export const rootEditorCoreSha256: string = "203415b16f2e534e22a56b7f7c2e87c902b641b06337d92363c4cbe55d4c76fe";
type CoreAdmission = "checked-external-open" | "editor-format-snapshot" | "editor-owner-bindings";
const admissions: readonly CoreAdmission[] = [
  "checked-external-open",
  "editor-format-snapshot",
  "editor-owner-bindings"
];
export function hasSelectedCoreAdmission(sha256: string | undefined, capability: CoreAdmission) {
  return sha256 === rootEditorCoreSha256 && admissions.includes(capability);
}
