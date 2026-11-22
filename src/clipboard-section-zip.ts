// A bounded ZIP32 editor for one XML member in a Core-generated HWPX.
const archiveLimit = 16 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", {fatal:true});
function invalid(): never { throw Error("한/글 붙여넣기용 HWPX 구조를 확인하지 못했습니다."); }
function view(b: Uint8Array) { return new DataView(b.buffer,b.byteOffset,b.byteLength); }
function crc(bytes: Uint8Array): number {
  let r = -1;
  for (const b of bytes) {
    r ^= b;
    for (let bit=0;bit<8;bit++) r = (r>>>1) ^ (r & 1 ? 0xedb88320 : 0);
  }
  return (r ^ -1) >>> 0;
}

type XmlMember = "Contents/section0.xml" | "settings.xml";
export function rewriteSectionXml(bytes: Uint8Array, edit: (xml:Document)=>void | false) {
  return rewriteHwpxXmlMember(bytes, "Contents/section0.xml", edit);
}

export async function rewriteHwpxXmlMember(
  bytes: Uint8Array,
  member: XmlMember,
  edit: (xml:Document)=>void | false,
): Promise<Uint8Array> {
  if (bytes.length>archiveLimit || bytes.length<22) invalid();
  const input=view(bytes), eocd=bytes.length-22;
  const u16=(p:number)=>input.getUint16(p,true),u32=(p:number)=>input.getUint32(p,true);
  if (u32(eocd)!==0x06054b50 || u16(eocd+20)!==0 || u16(eocd+4)!==0 || u16(eocd+6)!==0 ||
      u16(eocd+8)!==u16(eocd+10)) invalid();
  const count=u16(eocd+10), centralAt=u32(eocd+16);
  if (count===0 || count>100 || centralAt+u32(eocd+12)!==eocd) invalid();
  const chunks:Uint8Array[] = [], central:Uint8Array[] = [];
  const names=new Set<string>();
  let c=centralAt, outputAt=0, inputAt=0, changed=false;
  let foundMember=false;
  for (let i=0;i<count;i++) {
    if (c+46>eocd || u32(c)!==0x02014b50 || u16(c+8)!==0 || u16(c+34)!==0) invalid();
    const n=u16(c+28), f=u16(c+30), comment=u16(c+32), record=c+46+n+f+comment;
    if (record>eocd) invalid();
    const name=decoder.decode(bytes.subarray(c+46,c+46+n)), local=u32(c+42), packed=u32(c+20);
    if (names.has(name) || local!==inputAt || local+30>centralAt || u32(local)!==0x04034b50 ||
        u16(local+6)!==0 || u16(local+8)!==u16(c+10) || u16(local+26)!==n ||
        u32(local+14)!==u32(c+16) || u32(local+18)!==packed || u32(local+22)!==u32(c+24)) invalid();
    names.add(name);
    const content=local+30+n+u16(local+28), end=content+packed;
    if (end>centralAt || decoder.decode(bytes.subarray(local+30,local+30+n))!==name) invalid();
    const header=bytes.slice(c,record), h=view(header);
    h.setUint32(42,outputAt,true);
    if (name===member) {
      foundMember=true;
      const compressed=bytes.slice(content,end), size=u32(c+24);
      if (size>(member==="settings.xml" ? 16384 : archiveLimit) || (u16(c+10)!==0 && u16(c+10)!==8)) invalid();
      let data: Uint8Array = compressed;
      if (u16(c+10)===8) {
        const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        data=new Uint8Array(size);
        let at=0;
        try {
          for (;;) {
            const next=await reader.read();
            if (next.done) break;
            if (at+next.value.length>size) invalid();
            data.set(next.value,at);at+=next.value.length;
          }
          if (at!==size) invalid();
        } finally { await reader.cancel(); }
      }
      if (data.length!==size || crc(data)!==u32(c+16)) invalid();
      const xmlText=decoder.decode(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) invalid();
      const xml=new DOMParser().parseFromString(xmlText,"application/xml");
      if (xml.querySelector("parsererror")) invalid();
      if (edit(xml) === false) {
        chunks.push(bytes.subarray(local,end));
        outputAt+=end-local;
        central.push(header);c=record;inputAt=end;
        continue;
      }
      const replacement=new TextEncoder().encode(new XMLSerializer().serializeToString(xml));
      const localHeader=bytes.slice(local,content),l=view(localHeader), sum=crc(replacement);
      l.setUint16(8,0,true); l.setUint32(14,sum,true);
      l.setUint32(18,replacement.length,true);l.setUint32(22,replacement.length,true);
      h.setUint16(10,0,true);h.setUint32(16,sum,true);
      h.setUint32(20,replacement.length,true);h.setUint32(24,replacement.length,true);
      chunks.push(localHeader,replacement);outputAt+=localHeader.length+replacement.length;
      changed=true;
    } else {
      chunks.push(bytes.subarray(local,end));outputAt+=end-local;
    }
    central.push(header);c=record;inputAt=end;
  }
  if (!foundMember || c!==eocd || inputAt!==centralAt || outputAt+eocd-centralAt+22>archiveLimit) invalid();
  if (!changed) return bytes;
  const tail=bytes.slice(eocd);view(tail).setUint32(16,outputAt,true);
  const out=new Uint8Array(outputAt+eocd-centralAt+22);
  let at=0;
  for (const chunk of [...chunks,...central,tail]){out.set(chunk,at);at+=chunk.length;}
  return out;
}

