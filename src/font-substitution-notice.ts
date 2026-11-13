// Availability warning only. Never register a face, change SVG/fonts or mutate IR.
type Availability = "available" | "unavailable" | "unknown";
const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit"]);
export function primaryFont(value: string): string | undefined {
  const match = /^\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([^,]+))/.exec(value);
  const family = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").replace(/\\(['"\\])/g, "$1").trim();
  return family && !generic.has(family.toLowerCase()) && !/[\u0000-\u001f\u007f]/.test(family) ? family : undefined;
}
export async function localFontAvailability(family: string): Promise<Availability> {
  // A loaded registered face may be document-embedded or an existing alias.
  // FontFaceSet.check() is deliberately not used: it can succeed via fallback.
  try {
    const matches = Array.from(document.fonts).filter(f => f.family.replace(/^(['"])(.*)\1$/, "$2").toLowerCase() === family.toLowerCase());
    if (matches.some(f => f.status === "loaded")) return "available";
    if (matches.some(f => f.status === "loading" || f.status === "unloaded")) return "unknown";
    if (typeof FontFace !== "function") return "unknown";
    const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    // Resolve one named local face only. Do not add it to document.fonts or
    // enumerate the OS, request permissions, fetch a URL, or claim glyph coverage.
    await new FontFace("rhwp-availability-probe", `local("${escaped}")`).load();
    return "available";
  } catch (error) {
    // Local lookup failure is browser unavailability, not proof of OS absence.
    return error instanceof Error && error.name === "NetworkError" ? "unavailable" : "unknown";
  }
}
export function mountFontSubstitutionNotice(
  notice: HTMLElement,
  probe: (family: string) => Promise<Availability> = localFontAvailability,
) {
  let generation = 0;
  let latestPages: HTMLElement | undefined;
  const cache = new Map<string, Promise<Availability>>();
  const sync = async (pages: HTMLElement) => {
    latestPages = pages;
    const current = ++generation;
    notice.hidden = true;
    notice.textContent = "";
    notice.title = "";
    const names = [...new Set(Array.from(pages.querySelectorAll("svg [font-family]"),
      el => primaryFont(el.getAttribute("font-family") ?? "")).filter((s): s is string => !!s))];
    const missing: string[] = [], unknown: string[] = [];
    let next = 0;
    await Promise.all(Array.from({length: Math.min(4, names.length)}, async () => {
      while (next < names.length && current === generation) {
        const family = names[next++];
        const registered = typeof document !== "undefined" && Array.from(document.fonts ?? []).some(f => f.family.replace(/^(['"])(.*)\1$/, "$2").toLowerCase() === family.toLowerCase() && f.status === "loaded");
        if (registered) continue;
        if (!cache.has(family)) cache.set(family, Promise.resolve().then(() => probe(family)).catch(() => "unknown" as const));
        const availability = await cache.get(family)!;
        if (availability === "unavailable") missing.push(family);
        else if (availability === "unknown") unknown.push(family);
      }
    }));
    if (current !== generation) return;
    const messages: string[] = [];
    if (missing.length) messages.push(`이 브라우저에서 사용할 수 없는 글꼴: ${missing.sort().join(", ")}. 대체 글꼴로 표시하며 모양·줄 배치가 달라질 수 있습니다.`);
    if (unknown.length) messages.push(`글꼴 사용 가능 여부 미확인: ${unknown.sort().join(", ")}. 대체 표시될 수 있습니다.`);
    if (messages.length) {
      notice.textContent = `${messages.join(" ")} 원본의 글꼴 지정은 유지됩니다.`;
      notice.title = "화면 표시 안내입니다. 실제 대체 글꼴 이름과 모든 문자의 지원 여부를 확인한 결과는 아닙니다.";
      notice.hidden = false;
    }
  };
  // Existing asynchronous embedded/webfont loads can supersede an earlier
  // unknown result. Reuse cached local probes; never retry a rejected lookup.
  document.fonts?.addEventListener?.("loadingdone", () => {
    if (latestPages) void sync(latestPages);
  });
  return sync;
}
