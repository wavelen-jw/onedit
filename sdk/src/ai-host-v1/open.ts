import {AIError,digest,type Binding,type NewBinding} from '../ai-integration/contract.js';

export type FileFormat='hwp'|'hwpx';
export type OpenScope='edit'|'readonly';
export type OpenApproval={digest:string;sessionId:string;expiresAt:number;proof:string};
export type OpenMetadata={format:FileFormat;scope:OpenScope;byteLength:number;sha256:string;destination:NewBinding;fileName?:string};
export type OpenedSource={format:FileFormat;scope:OpenScope;exportFormats:('hwpx')[];conversionRequired:boolean;fileName?:string};
// Display basename only. Do not normalize or trim approved names.
export function validOpenName(name:unknown,format:FileFormat):name is string{
 return typeof name==='string'&&[...name].length<=255&&name.trim()===name&&
  !/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)&&
  name.length>format.length+1&&name.toLowerCase().endsWith('.'+format);
}
export function openRefusalMessage(error:unknown):string{
 switch(error){
  case 'OPEN_RESOURCE_LIMIT':return '파일이 안전하게 열 수 있는 크기 또는 복잡도 한도를 넘었습니다.';
  case 'OPEN_FORMAT_MISMATCH':return '파일 내용과 요청 형식이 다릅니다.';
  case 'OPEN_UNSUPPORTED_CONTENT':return '파일에 아직 열기를 지원하지 않는 내용이 있습니다.';
  case 'OPEN_INVALID_IMAGE':return '파일의 이미지 또는 미리보기를 읽을 수 없습니다.';
  case 'OPEN_INVALID_XML':return '파일의 문서 구조를 읽을 수 없습니다.';
  case 'OPEN_UNSAFE_ENTRY':
  case 'OPEN_DUPLICATE_ENTRY':
  case 'OPEN_CORRUPT_CONTAINER':return '파일의 내부 구성이 올바르지 않아 열지 않았습니다.';
  default:return '안전하게 열 수 있는 문서인지 확인하지 못했습니다.';
 }
}
// The shared error serializer intentionally ignores arbitrary messages. Only
// literals selected by the exact native-code switch can cross this boundary.
export class OpenRefusal extends AIError{
 readonly #safe:string;
 constructor(error:unknown){super('UNSUPPORTED_UNSAFE_FILE','파일 검사 거부');this.#safe=openRefusalMessage(error);}
 override toWire(){return {...super.toWire(),message:this.#safe};}
}
export const checkedOpenFeature='checked-open-v1' as const;
export function sniffFile(bytes:Uint8Array):FileFormat|undefined{
 const hwp=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
 if(hwp.every((n,i)=>bytes[i]===n))return 'hwp';
 if(bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04)return 'hwpx';
 return undefined;
}
/** Host issues proof only after authenticating the user and the exact working
 * copy/version. No file bytes or document text are sent to the policy API. */
export const openApprovalDigest=(sessionId:string,operationId:string,binding:Binding,file:OpenMetadata,expiresAt:number)=>
 digest(['onedit-host',2,'1.0',checkedOpenFeature,sessionId,operationId,binding,file,expiresAt]);
