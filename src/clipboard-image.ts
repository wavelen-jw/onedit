import { imageDimensions, pictureFile, type PictureFile } from './pictures.js';
export type ClipboardPicture = PictureFile & {displaySize?:{width:number;height:number}};

// Hancom can expose an opaque Windows raster alongside an embedded original
// PNG in the same clipboard HTML. Resolve only the sole selected picture's
// own resource; transformed/effected pictures keep the supplied rendered raster.
export function hancomClipboardPNG(html:string): Uint8Array<ArrayBuffer>|undefined {
  if(html.length>16*1024*1024)return;
  const matches=[...html.matchAll(/<!--\[data-hwpjson\]([\s\S]*?)-->/g)];
  if(matches.length!==1)return;
  let j:any;try{j=JSON.parse(matches[0][1]);}catch{return;}
  if(!j||typeof j!=='object'||!j.ro||!j.cs||!j.bidt||!Array.isArray(j.bi))return;
  const controls:string[]=[];
  for(const p of Object.values(j.ro) as any[])for(const r of (Array.isArray(p?.ru)?p.ru:[]))for(const ch of (Array.isArray(r?.ch)?r.ch:[]))if(ch?.cc===11&&typeof ch.co==='string')controls.push(ch.co);
  if(controls.length!==1||!Object.hasOwn(j.cs,controls[0]))return;
  const picture=j.cs[controls[0]],rc=picture?.rc,img=rc?.img;
  if(picture?.cc!==11||picture?.ci!==1735618336||rc?.ci!==611346787||!img||rc.gl!==0||rc.ra!==0||rc.fh!==false||rc.fv!==false||rc.il!==0||rc.it!==0||rc.ir!==rc.iw||rc.ib!==rc.ih||img.ie!==true||img.br!==0||img.co!==0||img.ef!==0||img.al!==0)return;
  if(Object.keys(rc.ls??{}).length||Object.values(rc.ef??{}).some((v:any)=>v&&typeof v==='object'&&Object.keys(v).length))return;
  const refs=j.bi.filter((b:any)=>b?.ty==='image/png'&&b.sr===img.bi);
  if(refs.length!==1||typeof img.bi!=='string'||!Object.hasOwn(j.bidt,img.bi))return;
  const data=j.bidt[img.bi];
  if(typeof data!=='string'||data.length>28*1024*1024||!/^iVBOR[0-9A-Za-z+/]*={0,2}$/.test(data))return;
  try{const raw=atob(data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const d=imageDimensions(bytes);if(d.extension!=='png')return;pictureFile({bytes,extension:'png',naturalWidth:d.width,naturalHeight:d.height});return bytes;}catch{return;}
}

// Read only a single image's absolute frame dimensions. Never create DOM,
// execute HTML/VML, load src, or infer native size from bitmap/DPR differences.
export function clipboardImageFrame(html:string): {width:number;height:number}|undefined {
  const tags=html.replace(/<!--[\s\S]*?-->/g,'').match(/<img\b[^>]*>/gi)??[];
  if(tags.length!==1)return;
  const attrs:Record<string,string>={};
  for(const m of tags[0].matchAll(/\s(width|height|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))attrs[m[1].toLowerCase()]=m[2]??m[3]??m[4];
  const css:Record<string,string>={};
  for(const part of (attrs.style??'').split(';')){const m=part.trim().match(/^(width|height)\s*:\s*(.+)$/i);if(m)css[m[1].toLowerCase()]=m[2].trim();}
  const length=(s:string|undefined)=>{if(!s)return;const m=s.trim().match(/^(\d+(?:\.\d+)?)\s*(pt|px|in|cm|mm)?$/i);if(!m)return;const n=Number(m[1]),factor:Record<string,number>={pt:100,px:75,in:7200,cm:7200/2.54,mm:7200/25.4};const v=n*factor[(m[2]??'px').toLowerCase()];return Number.isFinite(v)&&v>0&&v<=2147483647?Math.round(v):undefined;};
  const width=length(css.width??attrs.width),height=length(css.height??attrs.height);
  if(width&&height)return {width,height};
}

/** Snapshot File objects synchronously while the trusted paste event owns its
 * DataTransfer. Do not read paths, fetch HTML img URLs, or retry another source. */
export function pasteFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  if (data.files.length) return Array.from(data.files);
  return Array.from(data.items).filter(i => i.kind === 'file')
    .map(i => i.getAsFile()).filter((f): f is File => !!f);
}

export function imageOnly(html: string, text: string, fileName?: string): void {
  const images = html.match(/<\s*img\b/gi) ?? [];
  const visible = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ').trim();
  // Explorer may accompany its actual File with a file name/URI. It is metadata
  // only; the supplied image bytes, never the path, are inserted.
  const metadata = (!!fileName && text.trim() === fileName) || /^(?:file:\/\/|[a-z]:[\\/]|\\\\)[^\r\n]+$/i.test(text.trim());
  if (images.length > 1 || (visible && visible !== fileName) || (text.trim() && !metadata))
    throw Error('그림과 본문을 함께 붙이거나 여러 그림을 붙이는 형식은 아직 지원하지 않습니다. 그림 한 개만 복사하세요.');
}

export async function clipboardPicture(blob: Blob, html=''): Promise<ClipboardPicture> {
  if (!blob.size || blob.size > 20 * 1024 * 1024)
    throw Error('클립보드 그림은 20MB 이하이어야 합니다.');
  const bytes = hancomClipboardPNG(html) ?? new Uint8Array(await blob.arrayBuffer());
  const d = imageDimensions(bytes);
  const file: PictureFile = { bytes, extension:d.extension, naturalWidth:d.width, naturalHeight:d.height };
  pictureFile(file);
  // Decode only the supplied bytes. No canvas re-encoding: PNG alpha and JPEG
  // bytes remain exactly those supplied by the browser/OS.
  const bitmap = await createImageBitmap(new Blob([bytes], {type:d.extension === 'png' ? 'image/png' : 'image/jpeg'}), {imageOrientation:'none'});
  try {
    if (bitmap.width !== d.width || bitmap.height !== d.height)
      throw Error('그림 원본 크기와 브라우저 해석이 다릅니다. 원본은 변경하지 않았습니다.');
  } finally { bitmap.close(); }
  const displaySize=clipboardImageFrame(html);
  return displaySize?{...file,displaySize}:file;
}

export function clipboardPictureSize(file: ClipboardPicture): {width:number;height:number} {
  const w=file.displaySize?.width??file.naturalWidth*75, h=file.displaySize?.height??file.naturalHeight*75;
  const scale=Math.max(100/Math.min(w,h), Math.min(1,72000/Math.max(w,h)));
  const width=Math.round(w*scale),height=Math.round(h*scale);
  if (Math.max(width,height)>72000 || Math.min(width,height)<100)
    throw Error('현재 그림 크기 범위에서 원종횡비를 유지할 수 없습니다.');
  return {width,height};
}
