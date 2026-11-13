/** D standalone input admission policy only; Core owns ZIP/XML decoding.
 * Never extracts files, normalizes manifest hrefs or repairs document data.
 */
export function assertSafeHwpxEntryNames(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () => { throw Error("HWPX_ARCHIVE_BOUNDARY_UNVERIFIED: 파일 항목 목록을 확인할 수 없습니다."); };
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  }
  if (end < 0) return fail();
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return fail();
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (count > 4096 || count !== view.getUint16(end + 8, true) || start + size !== end || count === 65535 || start === 0xffffffff) return fail();
  let p = start;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || view.getUint32(p, true) !== 0x02014b50) return fail();
    const length = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const next = p + 46 + length + extra + comment;
    if (!length || length > 2048 || next > end) return fail();
    // ZIP legacy name encoding is retained; ASCII path delimiters are literal bytes.
    const name = Array.from(bytes.subarray(p + 46, p + 46 + length), b => String.fromCharCode(b)).join("");
    if (name.startsWith("/") || name.includes("\\") || name.includes(":") || name.includes("\0") || name.split("/").includes(".."))
      throw Error("HWPX_UNSAFE_ZIP_ENTRY: 문서 내부 항목 이름이 허용된 상대 경로 범위를 벗어납니다. 현재 문서는 유지됩니다.");
    p = next;
  }
  if (p !== end) fail();
}
