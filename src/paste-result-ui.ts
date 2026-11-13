// Display-only receipts for the existing clipboard commands. No clipboard read,
// document query, policy conversion, focus change or second edit lives here.
export const pastePolicyHelp = {
  source: "원본 서식 중 기존 지원 범위를 붙입니다. 서식 데이터가 없으면 텍스트만 붙입니다.",
  text: "클립보드 서식은 제외하고 기존 입력 서식을 사용합니다. 대상 서식 맞춤 정책과는 다릅니다.",
  target: "대상 서식에 맞추는 별도 정책은 아직 지원하지 않습니다.",
};
type State = { documentId: string; revision: number };
type Applied = { detail: string; changed: boolean; formatted: boolean; extensionMetadata: boolean };
export function mountPasteResult(
  doc: Document,
  current: () => State,
  fontDescriptions: () => readonly string[],
) {
  const root = doc.createElement("section"), heading = doc.createElement("strong"),
    request = doc.createElement("p"), result = doc.createElement("p"), notes = doc.createElement("ul");
  root.id = "paste-result"; root.hidden = true;
  root.setAttribute("aria-label", "최근 붙여넣기 실행 결과");
  root.append(heading, request, result, notes); doc.querySelector("footer")!.append(root);
  let receipt: (State & { plain: boolean; beforeFonts: Set<string>; baseNotes: string[]; formatted: boolean }) | undefined;
  const showNotes = () => {
    if (!receipt) return;
    const state = current();
    const values = [...receipt.baseNotes];
    // Reuse the provider's existing evidence, only while reading the receipt.
    // Never label a CSS family or a substitution candidate as an actual face.
    if (receipt.formatted && doc.querySelector("#workspace-status-notices[open]") && state.documentId === receipt.documentId && state.revision === receipt.revision)
      for (const value of fontDescriptions())
        if (!receipt.beforeFonts.has(value) && value.includes("→ 대체 후보") && /대체 표시|로딩 실패/.test(value))
          values.push("현재 문서의 표시 대체 후보 · " + value);
    notes.replaceChildren(...values.map(value => { const li = doc.createElement("li"); li.textContent = value; return li; }));
    notes.hidden = !values.length;
  };
  doc.addEventListener("toggle", e => {
    if ((e.target as HTMLElement).id === "workspace-status-notices" && (e.target as HTMLDetailsElement).open) showNotes();
  }, true);
  doc.addEventListener("rhwp:fonts-updated", () => {
    if (doc.querySelector("#workspace-status-notices[open]")) showNotes();
  });
  const sync = () => {
    if (receipt && current().documentId !== receipt.documentId) { receipt = undefined; root.hidden = true; }
  };
  return {
    sync,
    start(plain: boolean) {
      receipt = { ...current(), plain, beforeFonts: new Set(fontDescriptions()), baseNotes: [], formatted: false };
      root.hidden = true;
    },
    applied(data: Applied) {
      if (!receipt) return;
      // Called only after the existing Command and presentation path returned.
      Object.assign(receipt, current(), { formatted: data.formatted && data.changed });
      heading.textContent = data.changed ? "최근 붙여넣기 실행 결과" : "붙여넣기 · 변경 없음";
      request.textContent = "선택: " + (receipt.plain ? "텍스트만 붙이기" : "원본 서식 포함 (지원 범위)");
      result.textContent = data.changed ? "실제 적용: " + data.detail : "문서 변경이 없어 적용 완료로 표시하지 않습니다.";
      receipt.baseNotes = [];
      if (data.changed && !receipt.plain && !data.formatted)
        receipt.baseNotes.push("클립보드에 서식 데이터가 없어 텍스트만 적용했습니다.");
      if (data.changed && data.extensionMetadata)
        receipt.baseNotes.push("HTML에 포함된 HWP 전용 확장 데이터는 적용하지 않습니다. 지원 HTML/CSS 서식만 처리했습니다.");
      showNotes(); root.hidden = true;
      doc.dispatchEvent(new CustomEvent("rhwp:paste-diagnostic",{detail:{...receipt,applied:{...data}}}));
    },
    failed(reason: string, commandApplied: boolean) {
      if (!receipt) return;
      Object.assign(receipt, current()); receipt.formatted = false; receipt.baseNotes = [];
      heading.textContent = commandApplied ? "붙여넣기 후 표시 오류 · 결과 확인 필요" : "붙여넣기 미적용";
      request.textContent = "요청: " + (receipt.plain ? "텍스트만 붙이기" : "원본 서식 포함 (지원 범위)");
      result.textContent = commandApplied ? "편집 명령 이후 오류가 발생했습니다. 성공 또는 원문 보존으로 판정하지 않습니다. " + reason : reason;
      notes.replaceChildren(); notes.hidden = true; root.hidden = false;
      doc.dispatchEvent(new CustomEvent("rhwp:transient-notice",{detail:root}));
    },
  };
}
