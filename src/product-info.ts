import { closeEditorDialog, showUtilityDialog } from "./editor-popup-focus.js";
const sha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Current product information. Presentation only: no document or History writes. */
export function mountProductInfo(doc: Document, panel: HTMLElement, busy: () => boolean) {
  const line = doc.createElement('hr'), button = doc.createElement('button');
  button.type = 'button'; button.dataset.fileEntry = 'about'; button.textContent = '제품 정보';
  button.setAttribute('role', 'menuitem'); panel.append(line, button);
  const d = doc.createElement('dialog'); d.id = 'product-info'; d.setAttribute('aria-labelledby', 'product-info-title');
  const h = doc.createElement('h2'); h.id = 'product-info-title';
  const brand = doc.querySelector('header .product-brand');
  if (brand) h.append(brand.cloneNode(true)); else h.textContent = '온편집';
  const intro = doc.createElement('p'); intro.className = 'product-intro';
  intro.textContent = '브라우저에서 쓰는 한글 문서 편집기';
  const features = doc.createElement('ul'); features.className = 'product-features';
  for (const text of [
    'HWPX 문서 불러오기·편집·저장',
    '글자·문단 서식, 표·그림·글상자 편집',
    '마크다운 텍스트·파일을 편집 가능한 문서로 가져오기',
    '실행 취소·다시 실행과 문서 인쇄',
  ]) { const item = doc.createElement('li'); item.textContent = text; features.append(item); }
  const compatibility = doc.createElement('p');
  compatibility.textContent = '한/글과의 HWPX 호환성을 우선합니다. 글꼴과 문서 기능에 따른 조판 차이는 계속 개선하고 있습니다.';
  const buildBox = doc.createElement('div'); buildBox.className = 'product-build';
  const version = doc.createElement('p'); version.textContent = '제품 버전 0.1.0 · 개발 중';
  const tab = doc.createElement('p'), server = doc.createElement('p');
  // The running module URL belongs to this tab even after the public entry changes.
  const assetDirectory = new URL('./', import.meta.url);
  const tabSource = /\/assets\/([a-f0-9]{64})-[^/]+\.js$/.exec(new URL(import.meta.url).pathname)?.[1];
  const uiEntries = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href]')]
    .map(link => new URL(link.href))
    .filter(url => new URL('./', url).href === assetDirectory.href &&
      url.pathname.split('/').at(-1)?.startsWith(tabSource + '-ui-'));
  const uiPath = tabSource && uiEntries.length === 1
    ? 'assets/' + uiEntries[0].pathname.split('/').at(-1) : undefined;
  tab.textContent = tabSource ? '이 탭의 빌드 ' + tabSource.slice(0, 12) : '이 탭의 빌드: 확인할 수 없음';
  if (tabSource) tab.title = tabSource;
  server.setAttribute('role', 'status');
  buildBox.append(version, tab, server);
  const technical = doc.createElement('details'), technicalSummary = doc.createElement('summary'), fingerprint = doc.createElement('pre');
  technicalSummary.textContent = '빌드 정보'; technical.append(technicalSummary, fingerprint);
  const productLicense = doc.createElement('details'), licenseSummary = doc.createElement('summary'), licenseText = doc.createElement('pre');
  licenseSummary.textContent = '오픈소스 및 글꼴 라이선스';
  licenseText.textContent = "MIT License\n\nCopyright (c) 2026 RHWP Studio Next contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";
  const core = doc.createElement('p'); core.textContent = '문서 엔진: RHWP Core · MIT License · Copyright (c) 2025–2026 Edward Kim';
  const links = doc.createElement('div'); links.className = 'product-links';
  const source = doc.createElement('a'); source.href = 'https://github.com/edwardkim/rhwp'; source.textContent = 'RHWP 원본 출처';
  const fonts = doc.createElement('a'); fonts.href = new URL('../public/fonts/STUDIO-THIRD-PARTY-LICENSES.md', import.meta.url).href; fonts.textContent = '동봉 글꼴 라이선스';
  for (const link of [source, fonts]) { link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); }
  productLicense.append(licenseSummary, core, links, licenseText);
  const close = doc.createElement('button'); close.type = 'button'; close.textContent = '닫기';
  close.onclick = () => closeEditorDialog(d);
  d.append(h, intro, features, compatibility, buildBox, technical, productLicense, close); doc.body.append(d);
  button.onclick = () => {
    if (busy() || doc.querySelector('dialog[open]')) return;
    doc.querySelectorAll('#main-menu details[open]').forEach(e => e.removeAttribute('open'));
    showUtilityDialog(d, button); close.focus();
    server.textContent = '서버 빌드 확인 중…';
    fingerprint.textContent = tabSource ? '이 탭 Source ' + tabSource : '';
    void fetch(new URL('../asset-manifest.json', import.meta.url), {cache: 'no-store'})
      .then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(m => {
        if (m.version !== 1 || !sha256(m.app)) throw Error();
        server.textContent = '서버 빌드 ' + m.app.slice(0, 12) +
          (tabSource && tabSource !== m.app ? ' · 이 탭과 다릅니다. 문서를 저장한 뒤 새로고침하세요.' : '');
        const ui = uiPath ? m.files?.[uiPath] : undefined;
        fingerprint.textContent = [
          tabSource && '이 탭 Source ' + tabSource,
          sha256(ui) && '이 탭 UI (목록 지문) ' + ui,
          '서버 Source ' + m.app,
        ].filter(Boolean).join('\n');
      }).catch(() => { server.textContent = '서버 빌드를 확인할 수 없습니다.'; });
  };
}
