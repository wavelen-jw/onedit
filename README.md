# 온편집 (Onedit)

브라우저에서 **HWP·HWPX 문서를 열고 편집한 결과를 HWPX로 저장**할 수 있는 한글 문서 편집기입니다. 독립 편집기와 다른 앱에 편집 화면을 연결하는 JavaScript·TypeScript Host SDK를 제공합니다.

[온라인 편집기](https://edit.govpress.cloud/) · [v1.2.0 다운로드](https://github.com/wavelen-jw/onedit/releases/tag/v1.2.0) · [패치노트](CHANGELOG.md) · [Host SDK](sdk/QUICKSTART.md)

## 주요 기능

- **문서 편집** — 본문과 표 셀 편집, 글자·문단 서식, 찾기·바꾸기, 실행 취소·다시 실행
- **모바일 편집** — 두 번 탭 또는 길게 눌러 단어 선택, 선택 손잡이로 범위 확장, 본문·선택·표에 맞춘 하단 편집 도구
- **표 테두리** — 색·굵기·실선·파선·점선 설정. ‘하나의 셀처럼 적용’에서 ‘바깥 전체’를 선택하면 안쪽 선을 유지하며 바깥 네 방향을 설정할 수 있습니다.
- **작성과 저장** — Markdown 가져오기와 GFM 클립보드 붙여넣기, HWPX 저장, 파일 메뉴의 ‘HWPX 사본 다운로드’

## 로컬 실행

[v1.2.0](https://github.com/wavelen-jw/onedit/releases/tag/v1.2.0)에서 `onedit-browser-runtime.tar.gz`와 `SHA256SUMS`를 내려받으세요. Node.js 22 이상이 필요합니다.

```bash
sha256sum --check --ignore-missing SHA256SUMS
mkdir -p onedit-runtime
tar -xzf onedit-browser-runtime.tar.gz -C onedit-runtime
cd onedit-runtime
node start-ai-editor.mjs 4173
```

브라우저에서 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)을 엽니다. 독립 편집기는 별도의 AI 서버 없이 실행됩니다.

## 다른 앱에 연결

[같은 릴리스의 Host SDK](https://github.com/wavelen-jw/onedit/releases/download/v1.2.0/onedit-ai-host-sdk-1.2.0.tgz)를 설치합니다.

```bash
npm install --ignore-scripts ./onedit-ai-host-sdk-1.2.0.tgz
```

승인된 파일 열기를 사용하는 SDK 예제는 같은 릴리스의 `onedit-sdk-editor-runtime.tar.gz`로 실행합니다. 독립 편집에는 `onedit-browser-runtime.tar.gz`를 사용합니다.

Host가 iframe의 온편집과 연결해 승인된 파일을 `openDocument`로 열고 `exportDocument({ format: "hwpx" })`로 편집 결과를 받습니다. Host가 사용자 인증, 열기·수정 승인과 저장을 담당합니다. SDK v1은 20개 메서드와 8개 이벤트를 제공합니다. [연동 예제](sdk/EXTERNAL-HOST.md) · [API 레퍼런스](sdk/API_REFERENCE.md)

## AI 데모

[온라인 AI 데모](https://edit.govpress.cloud/ai/)에서는 초대 코드를 입력하기 전에도 편집기를 쓸 수 있습니다. 코드 확인 후 AI 보고서 작성과 선택 문장 수정을 사용할 수 있습니다. 생성한 보고서는 적용 내용을 확인하고 문서에 넣습니다. 외부 앱에서 AI 보고서 작성이나 선택 문장 재작성을 제공하려면 해당 앱의 모델 API와 인증 서버를 연결해야 합니다.

## 소스 빌드

같은 버전의 소스와 실행 패키지를 사용합니다. 아래 명령은 제공된 Core WASM과 바인딩으로 브라우저 자산을 재현합니다.

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/replay-public-release.mjs ../onedit-runtime
npm --prefix sdk run build
npm --prefix sdk run verify:release
npm --prefix sdk test
```

[빌드 가이드](BUILDING-PUBLIC.md) · [Core 출처](CORE-BUILD-PROVENANCE.md)

## 라이선스와 공개 범위

- **편집기와 Host SDK**의 공개 소스에는 [MIT 라이선스](LICENSE)가 적용됩니다.
- **온편집 Core**는 MIT 라이선스인 [RHWP](https://github.com/edwardkim/rhwp)를 기반으로 합니다. 온편집에서 수정한 Rust 소스와 패치 이력은 비공개로 관리합니다. 공개 릴리스는 컴파일된 WASM과 실행에 필요한 바인딩을 제공합니다. [Core 고지](THIRD_PARTY_CORE_NOTICE.md)
- **Core 바이너리와 브라우저 실행 패키지**에는 RHWP와 Rust 표준 라이브러리의 저작권 및 라이선스 고지가 포함됩니다. 의존성과 글꼴에는 각 구성 요소의 조건이 적용됩니다. [제3자 고지](THIRD_PARTY_NOTICES.md)
