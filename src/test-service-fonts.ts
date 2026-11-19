// This distribution uses local and publicly bundled fonts.
export type TestServiceFamily = { family: string; aliases: readonly string[]; restricted?: boolean; files: readonly { file:string; weight:string; SHA256:string }[] };
export const TEST_FONT_ACCESS_PATH = '/_onedit-test-fonts/';

export const testServiceFonts: readonly TestServiceFamily[] = [];
