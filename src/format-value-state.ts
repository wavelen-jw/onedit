import type { FormatState } from "./formatting.js";
import type { Props } from "./model.js";

export type FormatValueState = "common" | "mixed" | "unavailable";
const known = (value: unknown): boolean => value !== undefined && value !== null &&
  (typeof value === "number" ? Number.isFinite(value) : Array.isArray(value)
    ? value.every(known) : typeof value === "object" ? Object.values(value).every(known) : true);
const equal = (a: unknown,b: unknown,key:string) => key==="tabStops" ? JSON.stringify(a)===JSON.stringify(b) : a===b;

// Already queried display samples only. These keys are UI provenance, never
// Command properties or serialized document state. Partial coverage is unknown.
export function summarizeFormatValues(rows: Props[]): FormatState {
  if(!rows.length)return {};
  const state:FormatState={},mixed:string[]=[],unavailable:string[]=[];
  const keys=new Set(Object.keys(rows[0]));
  if("fontLanguage0" in rows[0])keys.add("fontFamily");
  for(const key of keys){
    const first=rows[0][key];
    state[key]=rows.every(row=>equal(row[key],first,key))?first:undefined;
    const language=key==="fontFamily"&&"fontLanguage0" in rows[0]?"font":
      ["ratios","spacings","relativeSizes","charOffsets"].includes(key)&&`${key}Language0` in rows[0]?key:undefined;
    let verified=true,same=true,seen=false,initial:unknown;
    for(const row of rows){
      const values=language?Array.from({length:7},(_,i)=>row[`${language}Language${i}`]):[row[key]];
      for(const value of values){
        if(!known(value)||(key.startsWith("font")&&value==="")){verified=false;break;}
        if(!seen){initial=value;seen=true;}else if(!equal(initial,value,key))same=false;
      }
      if(!verified)break;
    }
    if(!verified){unavailable.push(key);state[key]=undefined;}
    else if(!same)mixed.push(key);
  }
  state.__mixedFields=mixed;state.__unavailableFields=unavailable;
  return state;
}
export function formatValueState(state:FormatState,key:string):FormatValueState {
  if((state.__unavailableFields as string[]|undefined)?.includes(key))return "unavailable";
  if((state.__mixedFields as string[]|undefined)?.includes(key))return "mixed";
  return known(state[key])?"common":"unavailable";
}
export function formatValueGroup(state:FormatState,keys:string[]):FormatValueState {
  const kinds=keys.map(key=>formatValueState(state,key));
  if(kinds.includes("unavailable"))return "unavailable";
  if(kinds.includes("mixed"))return "mixed";
  return keys.every(key=>state[key]===state[keys[0]])?"common":"mixed";
}
export const formatValueHint=(kind:FormatValueState)=>kind==="mixed"?"혼합 / 유지":kind==="unavailable"?"미조회 / 유지":"유지";
export function markFormatValue(control:HTMLInputElement|HTMLSelectElement,kind:FormatValueState){
  control.dataset.valueState=kind;control.dataset.mixed=String(kind==="mixed");
  if(control instanceof HTMLInputElement)control.placeholder=formatValueHint(kind);
  else if(control.options[0]?.value==="")control.options[0].textContent=formatValueHint(kind);
}

// Toggle projections consume the same queried provenance as property forms.
// An unavailable current value is neither off nor mixed; admission stays with
// the existing Command/menu guards, independent of this display state.
export function formatToggleState(state:FormatState,key:string,expected?:string){
  let status:FormatValueState,value=state[key];
  if(key==="normal"){
    const parts=["superscript","subscript"].map(k=>formatValueState(state,k));
    status=parts.includes("unavailable")?"unavailable":parts.includes("mixed")?"mixed":"common";
    value=!state.superscript&&!state.subscript;
  }else status=formatValueState(state,key);
  const pressed:"true"|"false"|"mixed"|undefined=status==="unavailable"?undefined:status==="mixed"?"mixed":String(expected===undefined?!!value:value===expected) as "true"|"false";
  return {valueState:status,pressed};
}
export function markFormatToggle(button:HTMLButtonElement,state:ReturnType<typeof formatToggleState>,reason=""){
  if(button.dataset.valueState!==state.valueState)button.dataset.valueState=state.valueState;
  if(state.pressed===undefined){if(button.hasAttribute("aria-pressed"))button.removeAttribute("aria-pressed");}
  else if(button.getAttribute("aria-pressed")!==state.pressed)button.setAttribute("aria-pressed",state.pressed);
  const text=state.valueState==="unavailable"?`현재값 미조회 · ${reason||"기존 조회에서 값을 제공하지 않았습니다. 원본 값은 유지됩니다."}`:
    state.valueState==="mixed"?"현재 선택의 조회된 값이 혼합입니다.":"";
  if(button.getAttribute("aria-description")!==text)button.setAttribute("aria-description",text);
  let note=button.querySelector<HTMLElement>("[data-format-state-note]");
  if(!note){note=button.ownerDocument.createElement("small");note.dataset.formatStateNote="";button.append(note);}
  const compact=button.matches("#bold,#italic,#underline,[data-script],[data-align]");
  const label=state.valueState==="unavailable"?(compact?"?":" · 미조회"):state.valueState==="mixed"?(compact?"±":" · 혼합"):"";if(note.textContent!==label)note.textContent=label;
  if(note.hidden!==!label)note.hidden=!label;
}
