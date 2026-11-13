/** Presentation only. Draft initial values use this same string, so opening,
 * cancelling or editing another field never rounds the stored paragraph. */
export function paragraphFieldText(key:string,value:unknown):string{
  if(value===undefined)return '';
  return (key==='spacingBefore'||key==='spacingAfter')&&typeof value==='number'&&Number.isFinite(value)?value.toFixed(1):String(value);
}
