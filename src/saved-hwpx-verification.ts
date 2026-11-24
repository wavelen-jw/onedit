/** Filename evidence only; request identity and checked export bytes remain mandatory.
 * Match the literal name or a bounded browser collision suffix. Never normalize,
 * trim, case-fold, parse a path or infer the user's download directory.
 */
function matchesDownloadedHwpxName(requested: string, selected: string) {
  if (typeof selected !== "string" || /[\\/\x00-\x1f\x7f]/.test(selected))
    return false;
  const extension = requested.slice(-5);
  if (!/^\.hwpx$/i.test(extension)) return false;
  if (selected === requested) return true;
  if (new TextEncoder().encode(selected).length > 255) return false;
  const prefix = requested.slice(0, -5) + " (";
  const suffix = ")" + extension;
  if (!selected.startsWith(prefix) || !selected.endsWith(suffix)) return false;
  return /^[1-9][0-9]{0,5}$/.test(
    selected.slice(prefix.length, -suffix.length),
  );
}

export function verifySavedHwpxMetadata(
  requestedName: string,
  selectedName: string,
  expectedSize: number,
  actualSize: number,
) {
  if (!matchesDownloadedHwpxName(requestedName, selectedName) || actualSize !== expectedSize)
    throw Error("확인 대상의 파일명·크기가 다릅니다. 해당 요청으로 저장한 파일을 선택하세요.");
}

export function verifySavedHwpxBytes(expected: Uint8Array, actual: Uint8Array) {
  if (actual.length !== expected.length || actual.some((byte, i) => byte !== expected[i]))
    throw Error("저장 파일이 해당 요청의 HWPX와 다릅니다. 다시 저장하세요.");
}
