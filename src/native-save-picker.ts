import type { NativeSaveTarget } from './file-lifecycle.js';

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption: boolean;
  }) => Promise<NativeSaveTarget>;
};

/** The browser/OS owns filename input, destination selection and overwrite consent. */
export function nativeSavePicker(window: Window) {
  const host = window as SavePickerWindow;
  if (!host.isSecureContext || typeof host.showSaveFilePicker !== 'function') return undefined;
  return async (suggestedName: string): Promise<NativeSaveTarget | null> => {
    try {
      return await host.showSaveFilePicker!({
        suggestedName,
        types: [{ description: '한/글 문서 (HWPX)', accept: { 'application/hwp+zip': ['.hwpx'] } }],
        excludeAcceptAllOption: true,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      // A permission/activation/write failure must not silently start a download.
      throw error;
    }
  };
}
