// UI-only color draft. The existing object Command remains the sole writer.
// Common native palette presentation is observed; keyboard policy is Edit's.
type PaletteOptions = { id: string; label: string; caption: string; allowNone?: boolean;
  keep?: boolean; boundary?: HTMLElement; onChange?: (value: string) => void };
export function objectLinePalette(initial: string, signal: AbortSignal, config?: PaletteOptions) {
  const name = config?.label ?? '선 색';
  const validHex = (value: string) => /^#[\da-f]{6}$/i.test(value);
  const description = (value: string) => validHex(value) ? value : value === 'none' ? '단색 없음' : '혼합 / 조회 불가 · 유지';
  const row = document.createElement('div'), caption = document.createElement('span');
  const trigger = document.createElement('button'), chip = document.createElement('span');
  const popup = document.createElement('div'), grid = document.createElement('div');
  const status = document.createElement('p'), customLabel = document.createElement('label');
  const custom = document.createElement('input'), choose = document.createElement('button');
  row.className = 'object-line-color-row'; caption.textContent = config?.caption ?? '색';
  trigger.type = 'button'; trigger.dataset.objectLineColor = 'true';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', config?.id ?? 'object-line-color-popup'); trigger.title = config ? name : '선 색 · Alt+C';
  chip.className = 'object-color-chip'; chip.setAttribute('aria-hidden', 'true');
  const arrow = document.createElement('span'); arrow.textContent = '▾'; arrow.setAttribute('aria-hidden', 'true');
  trigger.append(chip, arrow);
  popup.id = config?.id ?? 'object-line-color-popup'; popup.className = 'object-color-popup'; popup.hidden = true;
  popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', `${name} 팔레트`);
  grid.className = 'object-color-grid'; grid.setAttribute('role', 'listbox'); grid.setAttribute('aria-label', `${name} 견본`);
  status.className = 'object-color-status'; status.setAttribute('aria-live', 'polite');
  const colors = [
    '#ffffff','#000000','#eee8ce','#353579','#6585d8','#ff8533','#aaaaaa','#ffcc00','#339966','#9955bb',
    '#eeeeee','#777777','#fff2b3','#d6d6eb','#dce6fa','#ffe6d5','#dddddd','#fffacc','#ccf2e1','#eadcf1',
    '#cccccc','#555555','#ffe066','#aaaacc','#b0c4ef','#ffccaa','#bbbbbb','#fff080','#99ddbb','#ccaae0',
    '#999999','#333333','#ddbb33','#7777aa','#7799dd','#ffaa77','#888888','#eedd33','#66bb99','#aa77cc',
    '#777777','#111111','#998822','#444477','#3355aa','#dd7733','#555555','#aa9900','#227755','#774499',
    '#000000','#ff0000','#ff6600','#ffff00','#ccff33','#008000','#33ccff','#0000ff','#333366','#800080'
  ];
  // Never quantize or replace a source color absent from the preset grid.
  if (validHex(initial) && !colors.includes(initial)) colors.unshift(initial);
  if (config?.allowNone) colors.unshift('none');
  if (config?.keep) colors.unshift('');
  let value = initial;
  const options: HTMLButtonElement[] = [];
  const close = (restore = true) => {
    popup.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    custom.setCustomValidity(''); custom.value = validHex(value) ? value : '';
    if (restore) trigger.focus();
  };
  const paint = () => {
    chip.style.backgroundColor = validHex(value) ? value : ''; chip.dataset.colorState = validHex(value) ? 'color' : value === 'none' ? 'none' : 'mixed'; trigger.dataset.color = value;
    trigger.setAttribute('aria-label', `${name} ${description(value)}`); status.textContent = `선택: ${description(value)}`;
    const selected = options.findIndex(b => b.dataset.color === value);
    options.forEach((b, i) => b.setAttribute('aria-selected', String(i === selected)));
  };
  // Publish the draft before focus/blur can synchronously emit change.
  const commit = (color: string) => { const next = color.toLowerCase(); value = next; paint(); config?.onChange?.(next); close(); };
  const focusOption = (index: number) => {
    options.forEach((b, i) => b.tabIndex = i === index ? 0 : -1); options[index].focus();
  };
  for (const color of colors) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.color = color;
    b.setAttribute('role', 'option'); b.setAttribute('aria-label', color === initial ? `원본 ${color}` : color);
    b.title = color; b.style.backgroundColor = validHex(color) ? color : ''; b.tabIndex = -1;
    if (!validHex(color)) { b.className = 'color-sentinel'; b.textContent = color === 'none' ? '없음' : '유지'; b.setAttribute('aria-label', color === 'none' ? '단색 없음' : '혼합 / 유지'); }
    b.addEventListener('click', () => commit(color), {signal});
    b.addEventListener('keydown', e => {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const i = options.indexOf(b); let n: number;
      switch (e.key) {
        case 'ArrowLeft': n = Math.max(0, i - 1); break;
        case 'ArrowRight': n = Math.min(options.length - 1, i + 1); break;
        case 'ArrowUp': n = Math.max(0, i - 10); break;
        case 'ArrowDown': n = Math.min(options.length - 1, i + 10); break;
        case 'Home': n = 0; break;
        case 'End': n = options.length - 1; break;
        default: return;
      }
      e.preventDefault(); e.stopPropagation(); focusOption(n);
    }, {signal});
    options.push(b); grid.append(b);
  }
  customLabel.textContent = '직접 입력'; custom.type = 'text'; custom.maxLength = 7;
  custom.pattern = '#[0-9a-fA-F]{6}'; custom.placeholder = '#RRGGBB';
  custom.setAttribute('aria-label', `${name} 직접 입력`); customLabel.append(custom);
  choose.type = 'button'; choose.textContent = '선택'; choose.setAttribute('aria-label', `직접 입력한 ${name} 선택`);
  const chooseCustom = () => {
    if (!/^#[\da-f]{6}$/i.test(custom.value)) {
      custom.setCustomValidity(`${name}은 #RRGGBB로 입력하세요.`); custom.reportValidity(); custom.focus(); return;
    }
    commit(custom.value);
  };
  custom.addEventListener('input', () => custom.setCustomValidity(''), {signal});
  custom.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); e.stopPropagation(); chooseCustom();
    }
  }, {signal});
  choose.addEventListener('click', chooseCustom, {signal});
  popup.append(grid, status, customLabel, choose); row.append(caption, trigger, popup);
  const open = () => {
    popup.hidden = false; trigger.setAttribute('aria-expanded', 'true'); custom.value = validHex(value) ? value : '';
    paint();
    // Only callers inside a clipped panel opt in. Fit before focusing an
    // option, so native focus scrolling cannot push the panel under its popup.
    if(config?.boundary){
      popup.style.top='100%';popup.style.maxHeight=`${config.boundary.clientHeight}px`;popup.style.overflowY='auto';
      const clip=config.boundary.getBoundingClientRect(),anchor=row.getBoundingClientRect(),height=popup.getBoundingClientRect().height;
      const top=clip.top+config.boundary.clientTop,bottom=top+config.boundary.clientHeight;
      popup.style.top=`${Math.max(top,Math.min(anchor.bottom,bottom-height))-anchor.top}px`;
    }
    focusOption(Math.max(0, options.findIndex(b => b.dataset.color === value)));
  };
  trigger.addEventListener('click', () => popup.hidden ? open() : close(), {signal});
  trigger.addEventListener('keydown', e => {
    if (!e.isComposing && !e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowDown') {
      e.preventDefault(); open();
    }
  }, {signal});
  popup.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); e.stopImmediatePropagation(); close();
    }
  }, {signal});
  // During native Tab, activeElement can transiently be body between blur/focus.
  // relatedTarget is the actual next focus; do not hide its input mid-transfer.
  row.addEventListener('focusout', e => {
    if (!(e.relatedTarget instanceof Node && row.contains(e.relatedTarget))) close(false);
  }, {signal});
  document.addEventListener('pointerdown', e => {
    if (!popup.hidden && !row.contains(e.target as Node)) close(false);
  }, {capture: true, signal});
  paint();
  return {row, read: () => value, open, close, setValue: (next: string) => { value = next; paint(); if (popup.hidden) custom.value = validHex(value) ? value : ''; }};
}
