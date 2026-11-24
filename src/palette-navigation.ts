export function paletteGridIndex(key: string, index: number, count: number, columns: number) {
  switch (key) {
    case 'Home': return 0;
    case 'End': return count - 1;
    case 'ArrowLeft': return fitPaletteAxis(index - 1, 0, count);
    case 'ArrowRight': return fitPaletteAxis(index + 1, 0, count);
    case 'ArrowUp': return fitPaletteAxis(index - columns, 0, count);
    case 'ArrowDown': return fitPaletteAxis(index + columns, 0, count);
  }
}

export function dismissPaletteOnEscape(event: KeyboardEvent, close: () => void) {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  close();
  return true;
}

export function fitPaletteAxis(preferred: number, start: number, end: number, size = 1) {
  return Math.max(start, Math.min(preferred, end - size));
}
