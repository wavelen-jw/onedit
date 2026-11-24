import { decodePictureBytes, imageDimensions, pictureFile, pictureInitialSize, type PictureFile } from './pictures.js';
export type ClipboardPicture = PictureFile & {displaySize?:{width:number;height:number}};

// Hancom can expose an opaque Windows raster alongside an embedded original
// PNG in the same clipboard HTML. Resolve only the sole selected picture's
// own resource; transformed/effected pictures keep the supplied rendered raster.
type HancomNativePicture = {
  bytes: Uint8Array<ArrayBuffer>;
  frame?: { width: number; height: number };
};

function hancomNativePicture(html: string): HancomNativePicture | undefined {
  if(html.length>16*1024*1024)return;
  const matches=[...html.matchAll(/<!--\s*\[data-hwpjson\]([\s\S]*?)-->/gi)];
  if(matches.length!==1)return;
  let j:any;try{j=JSON.parse(matches[0][1]);}catch{return;}
  if(!j||typeof j!=='object'||!j.ro||typeof j.cs!=='object'||!j.cs||!j.bidt||!Array.isArray(j.bi))return;
  // Hancom uses cc=11 for several control kinds, including tables. Resolve
  // each reference before counting pictures. An unreferenced PNG cannot own
  // the visible image, and multiple picture references remain ambiguous.
  let rc:any;
  for(const p of Object.values(j.ro) as any[]){
    for(const r of (Array.isArray(p?.ru)?p.ru:[])){
      for(const ch of (Array.isArray(r?.ch)?r.ch:[])){
        if(ch?.cc!==11||typeof ch.co!=='string'||!Object.hasOwn(j.cs,ch.co))continue;
        const control=j.cs[ch.co];
        if(control?.cc!==11||control?.ci!==1735618336||control?.rc?.ci!==611346787)continue;
        if(rc)return;
        rc=control.rc;
      }
    }
  }
  const img=rc?.img;
  if(!img||rc.gl!==0||rc.ra!==0||rc.fh!==false||rc.fv!==false||rc.il!==0||rc.it!==0||rc.ir!==rc.iw||rc.ib!==rc.ih||img.ie!==true||img.br!==0||img.co!==0||img.ef!==0||img.al!==0)return;
  if(Object.keys(rc.ls??{}).length||Object.values(rc.ef??{}).some((v:any)=>v&&typeof v==='object'&&Object.keys(v).length))return;
  const refs=j.bi.filter((b:any)=>b?.ty==='image/png'&&b.sr===img.bi);
  if(refs.length!==1||typeof img.bi!=='string'||!Object.hasOwn(j.bidt,img.bi))return;
  const data=j.bidt[img.bi];
  if(typeof data!=='string'||data.length>28*1024*1024||!/^iVBOR[0-9A-Za-z+/]*={0,2}$/.test(data))return;
  try {
    const raw = atob(data);
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const dimensions = imageDimensions(bytes);
    if (dimensions.extension !== 'png') return;
    pictureFile({bytes, extension:'png', naturalWidth:dimensions.width, naturalHeight:dimensions.height});
    const frame = Number.isSafeInteger(rc.cw) && rc.cw > 0 && Number.isSafeInteger(rc.ch) && rc.ch > 0
      ? { width: Number(rc.cw), height: Number(rc.ch) }
      : undefined;
    return { bytes, frame };
  } catch {
    return;
  }
}

export function hancomClipboardPNG(html: string): Uint8Array<ArrayBuffer> | undefined {
  return hancomNativePicture(html)?.bytes;
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

export type HancomMixedPicture = Readonly<{
  tag: string;
  file: PictureFile;
  width: number;
  height: number;
}>;
const mixedPictures = new WeakSet<HancomMixedPicture>();
export const isHancomMixedPicture = (value: HancomMixedPicture) => mixedPictures.has(value);

/** Bind a single visible Hancom image slot to bytes belonging to the same
 * clipboard item. Source URLs and file paths are never resolved or fetched. */
export async function hancomMixedPicture(
  html: string, text: string, image?: Blob, fileName?: string,
): Promise<HancomMixedPicture | undefined> {
  try { imageOnly(html, text, fileName); return; } catch { /* A mixed selection may have a companion raster. */ }
  const tags = html.replace(/<!--[\s\S]*?-->/g, "").match(/<img\b[^<>]*>/gi) ?? [];
  if (tags.length !== 1)
    throw Error("한/글 본문과 함께 복사된 그림의 위치를 하나로 확인할 수 없습니다.");
  const tag = tags[0];
  const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  const address = src?.[1] ?? src?.[2] ?? src?.[3] ?? "";
  const data = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(address);
  if (/^data:/i.test(address) && !data) throw Error("한/글에 포함된 그림 형식이 PNG 또는 JPEG가 아닙니다.");
  const native = !data ? hancomNativePicture(html) : undefined;
  let blob = image;
  if (data) {
    const bytes = Uint8Array.from(atob(data[2]), c => c.charCodeAt(0));
    const expected = data[1].toLowerCase() === "png" ? "png" : "jpg";
    if (imageDimensions(bytes).extension !== expected) throw Error("그림의 MIME 형식이 원본과 다릅니다.");
    blob = new Blob([bytes]);
  } else if (native) blob = new Blob([native.bytes]);
  if (!blob) throw Error("한/글 클립보드에서 그림 위치에 연결된 이미지 데이터를 확인할 수 없습니다.");
  const file = await clipboardPicture(blob);
  const declared = clipboardImageFrame(tag);
  if (!data && !native && (!declared ||
    Math.abs(declared.width / declared.height / (file.naturalWidth / file.naturalHeight) - 1) > 0.02))
    throw Error("함께 복사된 그림 파일과 문서의 그림 위치가 일치하는지 확인할 수 없습니다.");
  // Hancom's visible img can round the frame to whole points. Use the
  // dimensions from the same validated picture control only when the visible
  // slot corroborates them to within that export precision.
  if (native?.frame && (!declared ||
    Math.abs(native.frame.width - declared.width) >= 100 ||
    Math.abs(native.frame.height - declared.height) >= 100))
    throw Error("한/글 그림의 표시 크기와 원본 개체 크기가 일치하지 않습니다.");
  const frame = native?.frame ?? declared ?? { width: file.naturalWidth * 75, height: file.naturalHeight * 75 };
  if ([frame.width, frame.height].some(n => n < 100 || n > 72000))
    throw Error("혼합 붙여넣기에서 그림의 원래 표시 크기를 유지할 수 없습니다.");
  const result = Object.freeze({ tag, file, ...frame });
  mixedPictures.add(result);
  return result;
}

export async function clipboardPicture(blob: Blob, html=''): Promise<ClipboardPicture> {
  if (!blob.size || blob.size > 20 * 1024 * 1024)
    throw Error('클립보드 그림은 20MB 이하이어야 합니다.');
  const bytes = hancomClipboardPNG(html) ?? new Uint8Array(await blob.arrayBuffer());
  const file = await decodePictureBytes(bytes);
  const displaySize=clipboardImageFrame(html);
  return displaySize?{...file,displaySize}:file;
}

export function clipboardPictureSize(file: ClipboardPicture): {width:number;height:number} {
  return pictureInitialSize(file, file.displaySize);
}
