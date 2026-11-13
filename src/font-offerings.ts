// Product chooser policy only. Never rewrite authored font references or remove
// the renderer's ability to open an existing document with these source names.
export function offeredFontFamily(name:string):boolean{
  const key=name.normalize('NFC').trim().replace(/^(['"])(.*)\1$/,'$2').replace(/[\s_-]/g,'').toLowerCase();
  return !/^(?:dejavusans|liberationsans)(?:regular|book|bold|italic|oblique|condensed)*$/.test(key);
}
