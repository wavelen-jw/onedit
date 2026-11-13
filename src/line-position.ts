import type { Props, Command } from "./model.js";

// Existing Core UnderlineType values, distinct from underlineShape (line style).
export const linePositions = [
  ["None", "선 없음"], ["Bottom", "아랫줄"], ["Top", "윗줄"],
] as const;

// Share the existing explicit position Commands across menu surfaces.
export const linePositionItems = linePositions.map(([value, label]) => ({
  id: `line-${value}`, label, value, property: "underlineType" as const,
  command: {type: "char", props: {underlineType: value}} as Extract<Command, {type: "char"}>,
}));

// Keep the legacy Boolean toggle and the explicit position coherent. Core parses
// underlineType after underline; stale pending types must not undo a later toggle.
export function normalizeUnderlineChange(props: Props): Props {
  if (!("underlineType" in props) && !("underline" in props)) return props;
  const out = { ...props };
  if ("underlineType" in out) {
    if (!linePositions.some(([value]) => value === out.underlineType))
      throw Error("지원하지 않는 선 위치입니다. 없음·아랫줄·윗줄만 선택하세요.");
    const enabled = out.underlineType !== "None";
    if ("underline" in out && out.underline !== enabled)
      throw Error("선 위치와 밑줄 켜기·끄기 값이 다릅니다. 다시 선택하세요.");
    out.underline = enabled;
  } else {
    if (typeof out.underline !== "boolean") throw Error("밑줄 켜기·끄기 값이 올바르지 않습니다.");
    // Keep the old Boolean command delta: an already-true Top is a no-op.
  }
  return out;
}

export function mergeUnderlineTyping(previous: Props, delta: Props): Props {
  const next = { ...previous, ...delta };
  if ("underline" in delta && !("underlineType" in delta))
    next.underlineType = delta.underline ? "Bottom" : "None";
  return next;
}

// Draft-only coupling. Keep/mixed never coerces either control to false.
export function connectUnderlineDraft(controls: Map<string, HTMLInputElement | HTMLSelectElement>) {
  const position = controls.get("underlineType"), enabled = controls.get("underline");
  if (!position || !enabled) return;
  position.addEventListener("change", () => {
    if (!linePositions.some(([value]) => value === position.value)) return;
    enabled.value = String(position.value !== "None");
    enabled.dataset.mixed = "false";
  });
  enabled.addEventListener("change", () => {
    if (!["true", "false"].includes(enabled.value)) return;
    position.value = enabled.value === "true" ? (position.value === "Top" ? "Top" : "Bottom") : "None";
    position.dataset.mixed = "false";
  });
}
