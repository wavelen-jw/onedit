// Generated from development-runtime.json by scripts/core-runtime-selection.mjs.
export const rootEditorCoreSha256: string = "7fd9812553d53a089397a05cdf23822104e190570da5db906ff1168afad4fdff";
type CoreAdmission = "checked-external-open" | "editor-format-snapshot" | "editor-owner-bindings";
const admissions: readonly CoreAdmission[] = [
  "checked-external-open",
  "editor-format-snapshot",
  "editor-owner-bindings"
];
export function hasSelectedCoreAdmission(sha256: string | undefined, capability: CoreAdmission) {
  return sha256 === rootEditorCoreSha256 && admissions.includes(capability);
}
