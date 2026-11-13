import {toCoreCharacter,toCoreParagraph} from './formatting.js';
/** One supported block vocabulary shared by slash commands and report import. */
export const reportBlockPresets = {
  subtitle:{text:'□',size:16,font:'함초롬돋움',before:15,color:'#17365D',bold:true,cells:0},
  body1:{text:'○',size:15,font:'함초롬바탕',before:10,cells:2},
  body2:{text:'-',size:15,font:'함초롬바탕',before:5,cells:4},
  reference1:{text:'*',size:12,font:'맑은 고딕',before:3,cells:6},
  reference2:{text:'※',size:12,font:'맑은 고딕',before:3,cells:6},
  title:{text:'',size:20,font:'함초롬돋움',underline:true},
  text:{text:'',size:15,font:'함초롬바탕',before:0,cells:0},
} as const;
export type ReportBlockRole=keyof typeof reportBlockPresets;
export const slashReportRoles=['subtitle','body1','body2','reference1','reference2','title'] as const;
export function reportBlockFormat(role:ReportBlockRole,prefixOverride?:string){
  const spec=reportBlockPresets[role];
  const character=toCoreCharacter({fontFamily:spec.font,fontSize:spec.size,textColor:'color'in spec?spec.color:'#000000',bold:'bold'in spec&&spec.bold,underline:'underline'in spec&&spec.underline,italic:false,strikethrough:false});
  // Shared real hanging indentation, including wrapped continuation lines.
  // Leading inset is literal U+0020 spaces, never a paragraph left margin.
  // The command measures this whole prefix only for wrapped-line hanging.
  const paragraph=toCoreParagraph({alignment:role==='title'?'center':'left',marginLeft:0,marginRight:0,indent:0,spacingBefore:'before'in spec?spec.before:0,spacingAfter:0,lineSpacing:160,lineSpacingType:'Percent',headType:'None',numberingId:0,paraLevel:0});
  const marker=prefixOverride??(spec.text?spec.text+' ':'');
  const prefix=marker?' '.repeat('cells'in spec?spec.cells:0)+marker.trimStart():'';
  return {character,paragraph,prefix};
}
