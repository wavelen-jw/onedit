// Only these three JSON-valued Core reads are admitted by the matched adapter.
// No permission, command reason, selected geometry or mutable object is cached.
export type WidthMethod = "getPageDef" | "getTableProperties" | "getCellProperties";
export type WidthSite = "menu" | "toolbar";
export type WidthEvent = {site:WidthSite; method:WidthMethod; args:readonly number[]; result:"miss"|"hit"|"fallback"; from?:WidthSite};
export type WidthLookup = <T=any>(method:WidthMethod,...args:number[])=>T;
export function widthPreviewReads(
  current:()=>boolean,
  native:(method:WidthMethod,args:number[])=>string,
  decode:<T>(raw:string)=>T,
  legacy:WidthLookup,
  observe?:(row:WidthEvent)=>void,
) {
  const values = new Map<string, { raw:string; site:WidthSite }>();
  let active=true, reading=false, units=0;
  const close=()=>{active=false;values.clear();units=0;};
  const valid=()=>active&&current();
  const by=(site:WidthSite):WidthLookup=> <T>(method:WidthMethod,...args:number[]):T=>{
    const report=(result:WidthEvent["result"],from?:WidthSite)=>observe?.({site,method,args:[...args],result,from});
    const fallback=()=>{report("fallback");return legacy<T>(method,...args);};
    if(reading||!valid()){close();return fallback();}
    if(!args.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))return fallback();
    const key=method+":"+args.join(","), hit=values.get(key);
    reading=true;
    try{
      if(hit){
        const value=decode<T>(hit.raw);
        if(!valid()){close();return fallback();}
        report("hit",hit.site);return value;
      }
      const raw=native(method,args),value=decode<T>(raw);
      if(!valid()){close();return fallback();}
      if(values.size<64&&units+raw.length<=32768){values.set(key,{raw,site});units+=raw.length;}
      report("miss");return value;
    }catch(error){close();throw error;}
    finally{reading=false;}
  };
  return {by,close,valid};
}
