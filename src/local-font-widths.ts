// Read nominal widths from the verified standalone SFNT face.
export function readLocalGlyphWidths(bytes:Uint8Array<ArrayBuffer>) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=(p:number)=>v.getUint16(p);
  const u32=(p:number)=>v.getUint32(p);
  const table=(tag:string)=>{
    for(let i=0;i<u16(4);i++){
      const p=12+i*16;
      if(String.fromCharCode(...bytes.subarray(p,p+4))!==tag)continue;
      const offset=u32(p+8),length=u32(p+12);
      if(offset+length>bytes.length)throw Error('Invalid SFNT table bounds');
      return {offset,length};
    }
    throw Error('Missing SFNT table');
  };
  const head=table('head'),maxp=table('maxp'),hhea=table('hhea'),hmtx=table('hmtx'),cmap=table('cmap');
  if(head.length<20||maxp.length<6||hhea.length<36||cmap.length<4)throw Error('Truncated SFNT metrics');
  const unitsPerEm=u16(head.offset+18),glyphs=u16(maxp.offset+4),count=u16(hhea.offset+34);
  if(unitsPerEm<16||unitsPerEm>16384||!count||count>glyphs||count*4+(glyphs-count)*2>hmtx.length)throw Error('Invalid SFNT metrics');
  const encodings=u16(cmap.offset+2);
  if(encodings>128||4+encodings*8>cmap.length)throw Error('Invalid SFNT cmap directory');
  const unicode:{at:number;end:number;format:number;rank:number}[]=[];
  for(let i=0;i<encodings;i++){
    const p=cmap.offset+4+i*8,platform=u16(p),encoding=u16(p+2),offset=u32(p+4);
    if((platform!==0&&!(platform===3&&(encoding===1||encoding===10)))||offset+4>cmap.length)continue;
    const at=cmap.offset+offset,format=u16(at);
    if(format!==4&&format!==12)continue;
    if(format===12&&offset+16>cmap.length)continue;
    const length=format===4?u16(at+2):u32(at+4),end=at+length;
    if(length<16||end>cmap.offset+cmap.length)continue;
    unicode.push({at,end,format,rank:format===12?0:1});
  }
  unicode.sort((a,b)=>a.rank-b.rank);
  if(!unicode.length)throw Error('No supported Unicode cmap');
  const lookup=(cp:number)=>{
    for(const {at,end,format} of unicode){
      let glyph=0;
      if(format===12){
        const n=u32(at+12);
        if(at+16+n*12>end)continue;
        let a=0,b=n;
        while(a<b){
          const m=(a+b)>>>1,p=at+16+m*12,start=u32(p);
          if(cp<start)b=m;
          else if(cp>u32(p+4))a=m+1;
          else{glyph=u32(p+8)+cp-start;break;}
        }
      }else{
        const doubled=u16(at+6),n=doubled>>>1;
        if(doubled%2||!n||at+16+n*8>end)continue;
        let a=0,b=n;
        while(a<b){const m=(a+b)>>>1;if(cp>u16(at+14+m*2))a=m+1;else b=m;}
        if(a===n||cp<u16(at+16+n*2+a*2))continue;
        const delta=u16(at+16+n*4+a*2),range=at+16+n*6+a*2,offset=u16(range);
        if(!offset)glyph=(cp+delta)&65535;
        else {
          const g=range+offset+2*(cp-u16(at+16+n*2+a*2));
          if(g+2>end)continue;
          const raw=u16(g);if(raw)glyph=(raw+delta)&65535;
        }
      }
      if(glyph>0&&glyph<glyphs){
        const width=u16(hmtx.offset+4*Math.min(glyph,count-1));
        if(width<=unitsPerEm*4&&width!==65535)return width;
      }
    }
    return 65535;
  };
  return {unitsPerEm,lookup};
}
