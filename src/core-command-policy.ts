import type { HwpDocument } from "../development/core/rhwp.js";

// Retain the prior policy for the legacy nested caret name.
type CoreCommand = keyof HwpDocument | "getCursorRectInCellByPath";

type CommandPolicy = Readonly<{
  pendingLayout: "keep" | "complete" | "restore";
  keepUpdateReads: boolean;
  viewCache: "none" | "view" | "verified";
}>;

// Unlisted commands finish deferred layout and invalidate recorded reads.
const defaultPolicy: CommandPolicy = {
  pendingLayout: "complete", keepUpdateReads: false, viewCache: "none",
};
const uncachedQuery: CommandPolicy = { ...defaultPolicy, pendingLayout: "keep" };
const viewQuery: CommandPolicy = {
  pendingLayout: "keep", keepUpdateReads: true, viewCache: "view",
};
const completeViewQuery: CommandPolicy = { ...viewQuery, pendingLayout: "complete" };
const verifiedViewQuery: CommandPolicy = { ...viewQuery, viewCache: "verified" };
const completeVerifiedViewQuery: CommandPolicy = { ...verifiedViewQuery, pendingLayout: "complete" };
const revisionQuery: CommandPolicy = { ...uncachedQuery, keepUpdateReads: true };
const restore: CommandPolicy = { ...defaultPolicy, pendingLayout: "restore" };

const rules: readonly (readonly [CommandPolicy, readonly CoreCommand[]])[] = [
  [viewQuery, [
    "captureCellParagraphPath", "getBodyInlineTables", "getBulletList", "getCellCharPropertiesAt",
    "getCellCharPropertiesAtByPath", "getCellOwnProperties", "getCellParaPropertiesAt",
    "getCellParaPropertiesByPath", "getCharPropertiesAt", "getCharShapeRuns",
    "getCharShapeRunsInCellByPath", "getControlTextPositions", "getControls", "getNumberingList",
    "getParaPropertiesAt", "getPictureProperties", "resolveCellParagraphPath",
    "validateCellParagraphPath",
  ]],
  [completeViewQuery, [
    "getCursorModel", "getCursorRect", "getCursorRectInCell", "getCursorRectInCellByPath",
    "getCursorRectOnLine", "getDocumentInfo", "getLineInfo", "getPageControlLayout",
    "getPageTextLayout", "getTableCellBboxes",
  ]],
  [verifiedViewQuery, [
    "getCaretStops", "getCharIndexAtStreamPos", "getColumnDef", "getObjects", "getPageHide",
    "getParaShapeSet",
  ]],
  [completeVerifiedViewQuery, [
    "getPageInfo",
  ]],
  [defaultPolicy, [
    "getPageSizeRuns", "getTableCellBboxesByPath",
  ]],
  [revisionQuery, [
    "getTextFileUnicode",
  ]],
  // Existing queries and captures that can run while body pagination is pending.
  [uncachedQuery, [
    "captureBodyClipboard", "captureDeleteRange", "captureNestedClipboard", "capturePictureTransform",
    "captureSectionRaw", "getAnnotateMetricFont", "getBodyInlineTableOffsets", "getBookmarks",
    "getCanvasKitDocumentPreflight", "getCanvasKitReplayPlan", "getCanvasKitReplayPlanWithProfile",
    "getCanvasPageLayerTree", "getCaretPosition", "getCellInfo", "getCellInfoByPath",
    "getCellParaFormatRangeByPath", "getCellParagraphCount", "getCellParagraphCountByPath",
    "getCellParagraphLength", "getCellParagraphLengthByPath", "getCellParagraphPaths",
    "getCellPicturePropertiesByPath", "getCellProperties", "getCellPropertiesByPath",
    "getCellShapePropertiesByPath", "getCellShapeSet", "getCellStyleAt", "getCellTextDirection",
    "getCharPropertiesInHeaderFooter", "getCharShapeSet", "getChartData", "getChartDataByIndex",
    "getClickHereProps", "getClipboardTarget", "getClipboardText", "getControlImageData",
    "getControlImageMime", "getCurFieldState", "getCursorRectByPath", "getCursorRectByPathNear",
    "getCursorRectInFootnote", "getCursorRectInHeaderFooter", "getCursorRectInNote", "getDpi",
    "getEndnoteShape", "getEquationProperties", "getEventLog", "getExternalImageBasenames",
    "getExternalImageReferences", "getFallbackFont", "getFieldInfoAt", "getFieldInfoAtByPath",
    "getFieldInfoAtInCell", "getFieldInfoAtInCellEx", "getFieldList", "getFieldValue",
    "getFieldValueByName", "getFontDecisionTrace", "getFootnoteAtCursor", "getFootnoteInfo",
    "getFormObjectAt", "getFormObjectInfo", "getFormValue", "getHeaderFooter",
    "getHeaderFooterEditTarget", "getHeaderFooterList", "getHeaderFooterParaInfo",
    "getHeaderFooterPictureProperties", "getHeaderFooterPreviewPage", "getHmlOpenMetadata",
    "getHmlSaveState", "getHyperlinkContext", "getLineInfoInCell", "getLineStarts", "getLogicalLength",
    "getNominalFontDemand", "getNoteEditInfo", "getNoteEquationProperties", "getObjectCycle",
    "getOutlineNavigation", "getPageBorderFill", "getPageCaretStarts", "getPageDef",
    "getPageFlowImageOps", "getPageFontSources", "getPageFootnoteInfo", "getPageLayerTree",
    "getPageLayerTreeWithProfile", "getPageOfPosition", "getPageOpenFontSources",
    "getPageOverlayImages", "getPageRenderTree", "getPageSourceImageKeys", "getPageText",
    "getParaBounds", "getParaPropertiesInFootnote", "getParaPropertiesInHf", "getParagraphCount",
    "getParagraphLength", "getPlainTableCellTextLength", "getPositionOfPage", "getScanItems",
    "getSectionCount", "getSectionDef", "getSectionStarts", "getSelectionRects",
    "getSelectionRectsInCell", "getSelectionRectsInCellByPath", "getSelectionRectsInCellByPathEx",
    "getSelectionRectsInCellEx", "getSelectionRectsInFootnote", "getSelectionRectsInHeaderFooter",
    "getShapeBBox", "getShapeProperties", "getShowControlCodes", "getShowParagraphMarks",
    "getShowTransparentBorders", "getSourceFontBytes", "getSourceFormat", "getSourceImageBytes",
    "getStoredCaret", "getStructure", "getStyleAt", "getStyleDetail", "getStyleList", "getTableBBox",
    "getTableBBoxAtPage", "getTableDimensions", "getTableDimensionsByPath", "getTableProperties",
    "getTableStructureByPath", "getTextBoxControlIndex", "getTextFileText", "getTextInCell",
    "getTextInCellByPath", "getTextInCellEx", "getTextRange", "getValidationWarnings",
    "getVisibleFontStyles", "getWordEnd", "getWordStarts", "logicalToTextOffset", "resolveTableCell",
  ]],
  [restore, [
    "restoreSnapshot",
  ]],
  // A focused body edit manages its own pending layout.
  [uncachedQuery, [
    "replaceBodyTextLocal",
  ]],
];

const commandPolicies = new Map<CoreCommand, CommandPolicy>();
for (const [policy, commands] of rules)
  for (const command of commands) commandPolicies.set(command, policy);

export function coreCommandPolicy(command: CoreCommand): CommandPolicy {
  return commandPolicies.get(command) ?? defaultPolicy;
}
