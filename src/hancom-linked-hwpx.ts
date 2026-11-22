import { rewriteSectionXml } from "./clipboard-section-zip.js";

const P="http://www.hancom.co.kr/hwpml/2011/paragraph";
const START=0x25686c6b;  // %hlk
const END=0x00686c6b;    // field end
const SECD=0x73656364, COLD=0x636f6c64, PGNP=0x70676e70, TABLE=0x74626c20;
const bodyId=/^[A-Fa-f0-9]{24}$/;
const mail=/^mailto:[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const wrapper=/<div\b(?=[^<>]*\sid\s*=\s*["']hwpEditorBoardContent["'])(?=[^<>]*\sdata-hjsonver\s*=\s*["']1\.0["'])[^<>]*>/i;
const safeTop=new Set(["documentPr","dh","bf","cp","tp","nu","bu","pp","st","mp","ro","sl","cs","bi","bidt"]);
const blockedHtml=/<\s*(?:script|svg|object|embed|iframe|link|base|img|audio|video|source)\b/i;

type RecordValue=Record<string,unknown>;
type Link={paragraph:number;start:number;end:number;command:string;uri:string;label:string;editable:boolean;dirty:boolean;
  fieldId:number|undefined;zOrder:number|undefined;neutralProp:boolean};
type Caption={table:number;paragraphId:string;source:RecordValue;width:number;gap:number;full:boolean;outerWidth:number};
type ImportDocument={pasteHwpJson(sec:number,p:number,at:number,model:string):string;exportHwpx():Uint8Array;free():void};

function reject():never { throw Error("한/글 링크 포함 붙여넣기의 내용과 참조를 확인하지 못했습니다."); }
function object(x:unknown):RecordValue {
  if (!x||typeof x!=="object"||Array.isArray(x)) reject();
  return x as RecordValue;
}
function array(x:unknown):unknown[] {if(!Array.isArray(x)) reject();return x;}
function id(x:unknown):string {if(typeof x!=="string"||!bodyId.test(x))reject();return x;}
function string(x:unknown):string {if(typeof x!=="string")reject();return x;}
function optionalInteger(value:unknown,min:number,max:number):number|undefined {
  if(value===undefined)return;
  if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)reject();
  return value;
}
function compact(text:string):string {return text.replace(/\s/g,"");}
function unescapeCommand(command:string):string {
  let uri="",escaped=false;
  for(const ch of command) {
    if(escaped){uri+=ch;escaped=false;}
    else if(ch==="\\")escaped=true;
    else if(ch===";")break;
    else uri+=ch;
  }
  return uri;
}

function extract(html:string,plain:string):{wire:string;link:Link;bodyCount:number;captions:Caption[]}|undefined {
  if(html.length>1_000_000||plain.length>128_000||!wrapper.test(html)||!/<a\b/i.test(html))return;
  const matches=[...html.matchAll(/<!--\s*\[data-hwpjson\]([\s\S]*?)-->/gi)];
  if(matches.length!==1)reject();
  const visible=html.replace(/<!--[\s\S]*?-->/g,"");
  if(blockedHtml.test(visible)||/url\s*\(|expression\s*\(|@import|\son\w+\s*=/i.test(visible))reject();
  const found=[...visible.matchAll(/<a\s+href=(["'])([^"'<>]+)\1\s*>([\s\S]*?)<\/a\s*>/gi)];
  if(found.length!==1||(visible.match(/<a\b/gi)||[]).length!==1)reject();
  const [, ,href,rawLabel]=found[0];
  const label=rawLabel.replace(/<\/?span\b[^<>]*>/gi,"");
  if(!mail.test(href)||label!==href.slice(7)||/[<>&]/.test(label))reject();

  const m=object(JSON.parse(matches[0][1]));
  if(Object.keys(m).some(k=>!safeTop.has(k))||array(m.bi).length||Object.keys(object(m.bidt)).length)reject();
  const body=object(m.ro), cells=object(m.sl), controls=object(m.cs);
  if(Object.keys(body).length>160||Object.keys(cells).length>400||Object.keys(controls).length>96)reject();
  const seenBody=new Set<string>(),seenCells=new Set<string>(),seenControls=new Set<string>();
  const content:string[]=[];
  const captions:Caption[]=[];
  let tableCount=0,lastBody:RecordValue|undefined;
  let link:Link|undefined,startId="";
  let linkStart:Omit<Link,"end"|"label">|undefined;
  function read(pool:RecordValue,first:string,seen:Set<string>,inCell:boolean) {
    let p=first,seq=0;
    while(p) {
      if(seen.has(p))reject();
      seen.add(p);
      const node=object(pool[id(p)]);
      if(!inCell) lastBody=node;
      const chunks:string[]=[];
      for(const r of array(node.ru))for(const raw of array(object(r).ch)){
        const part=object(raw);
        if(typeof part.t==="string"){
          if(Object.keys(part).length!==1||/[\u0000-\u0009\u000b-\u001e]/.test(part.t))reject();
          const text=part.t.replace(/\u001f/g,"\u3000");
          part.t=text;chunks.push(text);content.push(text);
          continue;
        }
        const co=id(part.co);
        if(seenControls.has(co))reject();
        const obj=object(controls[co]), type=obj.ci;
        if(part.ci!==type||part.cc!==obj.cc||Object.keys(part).length!==3)reject();
        seenControls.add(co);
        if(type===TABLE&&!inCell&&obj.cc===11&&!linkStart) {
          const table=tableCount++;
          const metadata=obj.ca;
          if(metadata&&typeof metadata==="object") {
            const captionRef=object(metadata).so;
            if(captionRef) {
              const header=id(captionRef),sub=object(cells[header]);
              const paragraphId=id(sub.hp),caption=object(sub.ca),source=object(cells[paragraphId]);
              if(seenCells.has(header)||seenCells.has(paragraphId)||sub.td!==0||sub.lw!==0||sub.va!==0||
                 sub.ll!==""||sub.ln!==""||source.np!==""||caption.si!==3||caption.lw!==-1||
                 typeof caption.fs!=="boolean"||typeof caption.wi!=="number"||typeof caption.ga!=="number"||
                 typeof obj.swi!=="number"||![caption.wi,caption.ga,obj.swi].every(n=>Number.isInteger(n)&&n>=0&&n<=100000))
                reject();
              for(const r of array(source.ru))for(const chunk of array(object(r).ch)){
                const t=object(chunk);
                if(Object.keys(t).length!==1||t.t!=="")reject();
              }
              seenCells.add(header);seenCells.add(paragraphId);
              captions.push({table,paragraphId,source,width:caption.wi,gap:caption.ga,full:caption.fs,outerWidth:obj.swi});
            }
          }
          for(const row of array(obj.tr))for(const c of array(row)){
            const header=id(object(c).so);
            if(seenCells.has(header))reject();
            seenCells.add(header);
            read(cells,id(object(cells[header]).hp),seenCells,true);
          }
        } else if(!inCell&&((seq===0&&(type===SECD||type===COLD)&&obj.cc===2)||(type===PGNP&&obj.cc===21))) {
          if(linkStart)reject();
        } else if(!inCell&&type===START&&obj.cc===3&&!linkStart&&!link) {
          const f=object(obj.fb),parameters=object(f.pa),command=string(parameters.co);
          if(command.length>256||/[\u0000-\u001f]/.test(command)||unescapeCommand(command)!==href)reject();
          const fieldId=optionalInteger(f.fi,0,0xffffffff);
          const order=optionalInteger(f.zo,-0x80000000,0xffffffff);
          startId=co;
          linkStart={paragraph:seq,start:chunks.join("").length,command,uri:href,editable:f.ed===true,dirty:f.di===true,
            fieldId,zOrder:order===undefined?undefined:order|0,neutralProp:parameters.pr===0};
        } else if(!inCell&&type===END&&obj.cc===4&&linkStart&&obj.fo===startId) {
          const text=chunks.join(""),visibleLabel=text.slice(linkStart.start);
          if(visibleLabel!==label)reject();
          link={...linkStart,end:text.length,label:visibleLabel};
          delete controls[startId];delete controls[co];linkStart=undefined;
        } else reject();
      }
      if(linkStart)reject();
      for(const r of array(node.ru)) {
        const run=object(r);
        run.ch=array(run.ch).filter(raw=>{const part=object(raw);return part.ci!==START&&part.ci!==END;});
      }
      p=string(node.np);seq++;
    }
  }
  const controlCount=Object.keys(controls).length;
  read(body,id(body.hp),seenBody,false);
  if(!link||!lastBody||seenBody.size!==Object.keys(body).length-1||seenCells.size!==Object.keys(cells).length||
     seenControls.size!==controlCount||compact(content.join(""))!==compact(plain))reject();
  // Stage the empty caption through the ordinary paragraph writer so that
  // paragraph/style references are generated by the Core rather than guessed.
  let tail=lastBody as RecordValue;
  for(const cap of captions) {
    if(body[cap.paragraphId])reject();
    tail.np=cap.paragraphId;
    body[cap.paragraphId]=tail={...cap.source,np:""};
  }
  return {wire:JSON.stringify(m),link,bodyCount:seenBody.size,captions};
}

function addLink(xml:Document,link:Link) {
  const para=Array.from(xml.documentElement.children).filter(n=>n.namespaceURI===P&&n.localName==="p")[link.paragraph];
  if(!para||xml.getElementsByTagNameNS(P,"fieldBegin").length||xml.getElementsByTagNameNS(P,"fieldEnd").length)reject();
  const runs=Array.from(para.children).filter(n=>n.namespaceURI===P&&n.localName==="run");
  const leaves=runs.flatMap(run=>Array.from(run.children));
  if(!leaves.length||leaves.some(n=>n.namespaceURI!==P||n.localName!=="t"||n.children.length))reject();
  const original=leaves.map(n=>n.textContent??"").join("");
  if(original.slice(link.start,link.end)!==link.label)reject();
  const elem=(name:string,attrs:Record<string,string>={})=>{
    const n=xml.createElementNS(P,"hp:"+name);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
    return n;
  };
  const field=elem("fieldBegin",{id:"1",type:"HYPERLINK",name:"",editable:link.editable?"1":"0",dirty:link.dirty?"1":"0"});
  const endField=elem("fieldEnd",{beginIDRef:"1"});
  if(link.fieldId!==undefined) {
    field.setAttribute("fieldid",String(link.fieldId));
    endField.setAttribute("fieldid",String(link.fieldId));
  }
  if(link.zOrder!==undefined)field.setAttribute("zorder",String(link.zOrder));
  const parameters=elem("parameters",{cnt:link.neutralProp?"2":"1",name:""}),command=elem("stringParam",{name:"Command"});
  // The supported mail link has no additional behavior flags.
  if(link.neutralProp) {
    const prop=elem("integerParam",{name:"Prop"});
    prop.textContent="0";
    parameters.append(prop);
  }
  command.textContent=link.command;parameters.append(command);field.append(parameters);
  const begin=elem("ctrl");begin.append(field);
  const end=elem("ctrl");end.append(endField);
  const positions=new Map([[link.start,begin],[link.end,end]]);
  let offset=0;
  for(const leaf of leaves) {
    const text=leaf.textContent??"";
    let consumed=0;
    for(const [pos,marker] of positions){
      if(pos<offset||pos>=offset+text.length) continue;
      const index=pos-offset;
      if(index>consumed) {
        const before=leaf.cloneNode(false) as Element;
        before.textContent=text.slice(consumed,index);leaf.before(before);
      }
      leaf.before(marker);positions.delete(pos);consumed=index;
    }
    leaf.textContent=text.slice(consumed);
    offset+=text.length;
  }
  if(positions.size===1&&positions.has(offset)){runs.at(-1)!.append(positions.get(offset)!);positions.delete(offset);}
  if(positions.size||Array.from(para.getElementsByTagNameNS(P,"t")).map(n=>n.textContent??"").join("")!==original)reject();
}

function restoreCaptions(xml:Document,bodyCount:number,captions:Caption[]) {
  const body=Array.from(xml.documentElement.children).filter(n=>n.namespaceURI===P&&n.localName==="p");
  const tables=Array.from(xml.getElementsByTagNameNS(P,"tbl"));
  if(body.length!==bodyCount+captions.length)reject();
  const make=(name:string,attrs:Record<string,string>)=>{
    const n=xml.createElementNS(P,"hp:"+name);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
    return n;
  };
  for(const [i,cap] of captions.entries()){
    const table=tables[cap.table],para=body[bodyCount+i];
    if(!table||!para||para.textContent?.trim()||
       table.getElementsByTagNameNS(P,"caption").length)reject();
    const size=Array.from(table.children).find(x=>x.localName==="sz");
    if(!size||Number(size.getAttribute("width"))!==cap.outerWidth)reject();
    const caption=make("caption",{side:"BOTTOM",fullSz:cap.full?"1":"0",width:String(cap.width),
      gap:String(cap.gap),lastWidth:String(cap.outerWidth)});
    const sub=make("subList",{id:"",textDirection:"HORIZONTAL",lineWrap:"BREAK",vertAlign:"TOP",
      linkListIDRef:"0",linkListNextIDRef:"0",textWidth:"0",textHeight:"0",hasTextRef:"0",hasNumRef:"0"});
    sub.append(para);caption.append(sub);
    const row=Array.from(table.children).find(n=>n.localName==="tr");
    if(!row)reject();
    row.before(caption);
  }
}

/** Prepare the clipboard's supported linked HWPX in a scratch Core. Source
 * labels and destinations are checked as data and never navigated. */
export async function prepareHancomLinkedHwpx(
  html:string,plain:string,createScratch:()=>ImportDocument,
):Promise<{bytes:Uint8Array;expected:Link}|undefined> {
  const prepared=extract(html,plain);
  if(!prepared)return;
  const scratch=createScratch();
  try {
    if(JSON.parse(scratch.pasteHwpJson(0,0,0,prepared.wire)).ok!==true)reject();
    const bytes=await rewriteSectionXml(scratch.exportHwpx(),xml=>{restoreCaptions(xml,prepared.bodyCount,prepared.captions);addLink(xml,prepared.link);});
    return {bytes,expected:prepared.link};
  } finally { scratch.free(); }
}


/** Reconcile a single clipboard link against the matching native HWPX. */
export async function restoreHancomNativeLink(bytes: Uint8Array, html: string, plain: string):
  Promise<{bytes: Uint8Array; expected: Link}|undefined> {
  const clipboard = extract(html, plain);
  if (!clipboard) return;
  const link = clipboard.link;
  const enriched = await rewriteSectionXml(bytes, xml => {
    const root = xml.documentElement;
    const owner = Array.from(root.children).filter(n => n.namespaceURI === P && n.localName === "p")[link.paragraph];
    const begins = xml.getElementsByTagNameNS(P, "fieldBegin");
    const ends = xml.getElementsByTagNameNS(P, "fieldEnd");
    if (!owner || begins.length !== 1 || ends.length !== 1) reject();
    const head = begins[0], tail = ends[0];
    if (!owner.contains(head) || !owner.contains(tail) || head.getAttribute("type") !== "HYPERLINK" ||
        !head.hasAttribute("id") || head.getAttribute("id") !== tail.getAttribute("beginIDRef")) reject();
    const fields = Array.from(head.children);
    if (fields.length !== 1 || fields[0].namespaceURI !== P || fields[0].localName !== "parameters") reject();
    const params = fields[0];
    const commands = Array.from(params.children).filter(n => n.namespaceURI === P &&
      n.localName === "stringParam" && n.getAttribute("name") === "Command");
    if (commands.length !== 1 || commands[0].textContent !== link.command) reject();
    if (link.fieldId !== undefined) {
      head.setAttribute("fieldid", String(link.fieldId));
      tail.setAttribute("fieldid", String(link.fieldId));
    }
    if (link.zOrder !== undefined) head.setAttribute("zorder", String(link.zOrder));
    head.setAttribute("dirty", link.dirty ? "1" : "0");
    head.setAttribute("editable", link.editable ? "1" : "0");
    if (link.neutralProp) {
      const props = Array.from(params.children).filter(n => n.getAttribute("name") === "Prop");
      if (props.length > 1 || props.length === 1 && props[0].textContent !== "0") reject();
      if (!props.length) {
        const prop = xml.createElementNS(P, "hp:integerParam");
        prop.setAttribute("name", "Prop");
        prop.textContent = "0";
        params.prepend(prop);
        params.setAttribute("cnt", String(params.children.length));
      }
    }
  });
  return {bytes: enriched, expected: link};
}
