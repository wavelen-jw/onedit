import type { Props, Command } from "./model.js";

export type RelativeMetric = "fontSize" | "ratios" | "spacings";
export type RelativeCharacterChange = { metric: RelativeMetric; direction: 1 | -1 };
export const relativeCharacterItems = [
  { metric: "fontSize", direction: 1, key: "e", label: "글자 크게 (+1pt)" },
  { metric: "fontSize", direction: -1, key: "r", label: "글자 작게 (−1pt)" },
  { metric: "ratios", direction: 1, key: "k", label: "장평 넓게 (+1%p)" },
  { metric: "ratios", direction: -1, key: "j", label: "장평 좁게 (−1%p)" },
  { metric: "spacings", direction: 1, key: "w", label: "자간 넓게 (+1%p)" },
  { metric: "spacings", direction: -1, key: "n", label: "자간 좁게 (−1%p)" },
] as const;

// Shared existing operations; no new increment or selection semantics.
export const relativeCharacterMenuItems = relativeCharacterItems.map(item => ({
  id: `relative-${item.metric}-${item.direction}`, label: item.label,
  shortcut: `Alt+Shift+${item.key.toUpperCase()}`,
  command: {type: "char-relative", change: {metric: item.metric, direction: item.direction}} as Extract<Command, {type: "char-relative"}>,
}));

export function relativeCharacterShortcut(key: string, code: string): RelativeCharacterChange | undefined {
  const aliases: Record<string, string> = { "ㄷ": "e", "ㄱ": "r", "ㅏ": "k", "ㅓ": "j", "ㅈ": "w", "ㅜ": "n" };
  const physical = /^Key([ERKJWN])$/.exec(code)?.[1].toLowerCase();
  const letter = physical ?? aliases[key.toLowerCase()] ?? key.toLowerCase();
  const action = relativeCharacterItems.find(item => item.key === letter);
  return action ? { metric: action.metric, direction: action.direction } : undefined;
}

// Getter and setter use hundredths of a point for size, seven independent %
// slots for width/spacing. Never round or flatten a mixed selection to its first run.
export function relativeCharacterPatch(raw: Props, change: RelativeCharacterChange): Props {
  if (!change || !["fontSize", "ratios", "spacings"].includes(change.metric) ||
      (change.direction !== 1 && change.direction !== -1)) throw Error("잘못된 글자 증감 요청입니다.");
  const { metric, direction } = change;
  const [min, max, step] = metric === "fontSize" ? [100, 20000, 100] : metric === "ratios" ? [1, 200, 1] : [-100, 100, 1];
  const values = metric === "fontSize" ? [raw.fontSize] : raw[metric];
  if (!Array.isArray(values) || values.length !== (metric === "fontSize" ? 1 : 7))
    throw Error("원래 글자 크기·언어별 간격을 조회할 수 없습니다.");
  const next = values.map(value => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max ||
        value + direction * step < min || value + direction * step > max)
      throw Error(metric === "fontSize" ? "글자 크기 범위는 1~200pt입니다. 선택 전체의 증감을 취소했습니다."
        : metric === "ratios" ? "장평 범위는 1~200%입니다. 선택 전체의 증감을 취소했습니다."
        : "자간 범위는 −100~100%입니다. 선택 전체의 증감을 취소했습니다.");
    return value + direction * step;
  });
  return { [metric]: metric === "fontSize" ? next[0] : next };
}

export function relativeTyping(underlying: Props, typing: Props, change: RelativeCharacterChange): Props {
  const raw = { ...underlying, ...typing };
  if (change.metric !== "fontSize") {
    const current = raw[change.metric];
    if (Array.isArray(current)) {
      const slots = current.map(v => typeof v === "number" ? v : NaN);
      for (let n = 0; n < 7; n++) {
        const value = typing[`${change.metric}Language${n}`];
        if (value !== undefined) slots[n] = Number(value);
      }
      raw[change.metric] = slots;
    }
  }
  const next = { ...typing, ...relativeCharacterPatch(raw, change) };
  // The new array already includes each pending language override.
  if (change.metric !== "fontSize") for (let n = 0; n < 7; n++) delete next[`${change.metric}Language${n}`];
  return next;
}
