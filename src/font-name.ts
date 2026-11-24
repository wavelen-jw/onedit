export const normalizeFontName = (name: string) => name.normalize('NFC').trim();

export function fontFamilyKey(family: string) {
  const unquoted = family.trim().replace(/^(['"])(.*)\1$/, '$2');
  return unquoted.normalize('NFC').toLowerCase();
}
