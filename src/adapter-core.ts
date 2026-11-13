import type { HwpDocument } from "../development/core/rhwp.js";

export function result<T = any>(raw: string): T {
  const v = JSON.parse(raw);
  if (v?.ok === false || v?.error) throw Error(v.error ?? "Core 명령 실패");
  return v;
}

/** Raw dispatch only. The existing Adapter call owns its synchronous projection cache. */
export function invokeCore(doc: HwpDocument, method: keyof HwpDocument, args: any[]): string {
  return (doc[method] as Function).apply(doc, args);
}
