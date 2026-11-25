const romanDigits = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
] as const;

export function romanHeading(number: number): string {
  let result = "";
  for (const [value, symbol] of romanDigits) {
    result += symbol.repeat(Math.floor(number / value));
    number %= value;
  }
  return result;
}

export function readSectionNumber(marker: string): number | undefined {
  const label = marker.replace(/[.)]$/u, "").normalize("NFKC").toUpperCase();
  if (/^\d+$/u.test(label)) {
    const number = Number(label);
    return number >= 1 && number <= 3999 ? number : undefined;
  }
  if (!/^[IVXLCDM]{1,15}$/u.test(label)) return undefined;
  let remaining = label;
  let number = 0;
  for (const [value, symbol] of romanDigits) {
    while (remaining.startsWith(symbol)) {
      number += value;
      remaining = remaining.slice(symbol.length);
    }
  }
  return number >= 1 && number <= 3999 && romanHeading(number) === label ? number : undefined;
}

/** Explicit Roman-numbered report heading in a plain-text paragraph. */
export function readRomanSection(text: string): {prefix: string; number: number} | undefined {
  const match = /^[ \t]*([IVXLCDM\u2160-\u217f]+[.])[ \t]+(?=\S)/u.exec(text);
  if (!match) return undefined;
  const number = readSectionNumber(match[1]);
  return number === undefined ? undefined : {prefix: match[0], number};
}
