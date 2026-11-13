// Localized names belong to the selected FontData, not an invented substitute.
// Detection reads only bounded SFNT header/directory/name slices. Full face bytes
// are still acquired and verified by localFaceBytes only when actually selected.
export async function readLocalFontNames(face:{postscriptName:string;blob?:()=>Promise<Blob>},valid:(name:unknown)=>name is string):Promise<string[]>{
  try{
    if(!face.blob)return [];
    const blob=await face.blob();
    if(blob.size<12||blob.size>32*1024*1024)return [];
    const header=new DataView(await blob.slice(0,12).arrayBuffer()),signature=header.getUint32(0);
    if(![0x00010000,0x4f54544f,0x74727565].includes(signature))return []; // TTC face addresses remain unsupported.
    const count=header.getUint16(4),end=12+count*16;
    if(count>4096||end>blob.size)return [];
    const directory=new DataView(await blob.slice(12,end).arrayBuffer());
    for(let i=0;i<count;i++){
      const at=i*16;if(directory.getUint32(at)!==0x6e616d65)continue;
      const offset=directory.getUint32(at+8),length=directory.getUint32(at+12);
      if(length<6||length>1024*1024||offset<end||offset>blob.size||length>blob.size-offset)return [];
      const table=new DataView(await blob.slice(offset,offset+length).arrayBuffer()),n=table.getUint16(2),start=table.getUint16(4);
      if(6+n*12>length||start<6+n*12||start>length)return [];
      const names=new Set<string>(),postscript=new Set<string>();
      for(let j=0;j<n;j++){
        const r=6+j*12,platform=table.getUint16(r),id=table.getUint16(r+6),size=table.getUint16(r+8),from=start+table.getUint16(r+10);
        if(![1,4,6,16].includes(id)||from>length||size>length-from)continue;
        let value='';
        if(platform===0||platform===3){if(size%2)continue;for(let k=0;k<size;k+=2)value+=String.fromCharCode(table.getUint16(from+k));}
        else if(platform===1){for(let k=0;k<size;k++){const b=table.getUint8(from+k);if(b>=128){value='';break;}value+=String.fromCharCode(b);}}
        if(!valid(value))continue;
        value=value.normalize('NFC').trim();names.add(value);
        if(id===6)postscript.add(value.toLocaleLowerCase('en-US'));
      }
      return postscript.has(face.postscriptName.normalize('NFC').trim().toLocaleLowerCase('en-US'))?[...names]:[];
    }
  }catch{/* A name-table failure must not discard the native metadata or old document. */}
  return [];
}
