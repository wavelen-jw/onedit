# 온편집 (Onedit)

**브라우저 기반 HWP/HWPX 문서 편집기 · JavaScript/TypeScript Host SDK**  
*Browser-based Korean document editor with an embeddable Host SDK.*

[![Release](https://img.shields.io/github/v/release/wavelen-jw/onedit?include_prereleases&label=release)](https://github.com/wavelen-jw/onedit/releases/tag/v1.0.0-rc4)
[![License: MIT](https://img.shields.io/badge/source%20license-MIT-blue)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](BUILDING-PUBLIC.md)

온편집은 웹브라우저에서 **HWP5/HWPX 문서를 열고, 편집한 결과를 HWPX로 저장**할 수 있는 프로젝트입니다. 독립 실행형 편집기와 외부 서비스에 연결할 수 있는 Host SDK를 제공합니다.

**[온라인 편집기](https://edit.govpress.cloud/) · [AI 연동 데모](https://edit.govpress.cloud/ai) · [v1.0.0-rc4 다운로드](https://github.com/wavelen-jw/onedit/releases/tag/v1.0.0-rc4) · [SDK 문서](sdk/QUICKSTART.md)**

> [!IMPORTANT]
> **v1.0.0-rc4는 Pre-release입니다.** 일부 HWP/HWPX 구조에 대한 편집·변환을 지원하며, 모든 문서의 서식·조판 동일성을 보장하지 않습니다. 공개 배포본에는 **운영용 AI 모델 API, 인증 서버, 비밀키 또는 TLS 서비스**가 포함되지 않습니다.

## 주요 기능

| 영역 | 제공 기능 |
| --- | --- |
| 문서 열기 | 지원 범위 내 HWP5, HWPX 파일 불러오기 |
| 문서 편집 | 본문·일반 표/셀 편집, 선택·서식 조정, 실행 취소/다시 실행 |
| 문서 생성 | Markdown(GFM의 지원 구조)·DocumentSpec 기반 초안 생성 및 검토 |
| 문서 내보내기 | **HWPX**로 다운로드, 파일 무결성 및 재열기 확인 |
| Host SDK | 문서 준비·미리보기·명시적 적용, 선택 영역 수정, HWPX 내보내기 |
| 독립 실행 | 브라우저 자산과 Core WebAssembly를 포함하는 로컬 실행 패키지 |

공개 SDK는 **20개 메서드·8개 이벤트**의 v1 인터페이스를 제공합니다. 문서 생성·선택 수정의 상세 지원 조건은 [API Reference](sdk/API_REFERENCE.md)와 [지원 범위](sdk/SUPPORT_MATRIX.md)를 확인하세요.

## 빠른 시작

**요구 환경:** Node.js 22 이상(릴리스 검증 환경: Node.js 22.23.1), Chromium 계열 브라우저 권장.

[GitHub Releases](https://github.com/wavelen-jw/onedit/releases/tag/v1.0.0-rc4)에서 독립 실행 패키지를 내려받습니다.

```bash
curl -fLO https://github.com/wavelen-jw/onedit/releases/download/v1.0.0-rc4/onedit-browser-runtime.tar.gz
curl -fLO https://github.com/wavelen-jw/onedit/releases/download/v1.0.0-rc4/SHA256SUMS

# 다운로드한 파일의 체크섬 확인 (GNU coreutils)
sha256sum --check --ignore-missing SHA256SUMS

mkdir -p onedit-runtime
tar -xzf onedit-browser-runtime.tar.gz -C onedit-runtime
cd onedit-runtime
node start-ai-editor.mjs 4173
```

브라우저에서 **http://127.0.0.1:4173/** 을 엽니다. macOS에서는 `shasum -a 256`, Windows에서는 `Get-FileHash`로 체크섬을 확인할 수 있습니다.

> 독립 실행형 편집은 별도 AI 서버 없이 사용할 수 있습니다. 위 실행 패키지는 공개 앱 소스와 달리 **컴파일된 Core WASM·바인딩·글꼴 자산**을 함께 포함합니다.

## Host SDK

Host SDK는 별도 npm 레지스트리가 아닌 **이 저장소의 릴리스 설치 파일**로 배포합니다.

```bash
curl -fLO https://github.com/wavelen-jw/onedit/releases/download/v1.0.0-rc4/onedit-ai-host-sdk-1.0.0-rc4.tgz
npm install --ignore-scripts ./onedit-ai-host-sdk-1.0.0-rc4.tgz
```

```ts
import { OneditHostClient } from "onedit-ai-host-sdk";

// iframe, editorOrigin, sessionProof는 신뢰된 Host가 제공해야 합니다.
const client = await OneditHostClient.connect(iframe, editorOrigin, {
  sessionProof,
  checkedOpen: true,
  permissions: ["read", "edit", "lifecycle", "save"],
});

const capabilities = await client.request("getCapabilities", {});
console.log(capabilities.methods);
```

SDK의 문서 생성 흐름은 **`prepareDocument` → 미리보기·사용자 승인 → `commitPreparedDocument` → `exportDocument`** 입니다. 선택 영역 수정은 `captureSelection`·`readSelection`, 수정안 미리보기 및 `applyProposal`을 사용합니다. 연속 본문 문단이나 하나의 일반·병합 셀 안의 연속 문단을 수정할 수 있으며, 선택 범위의 글자 서식과 문단 수를 유지해야 합니다.

SDK는 편집기 iframe이나 사용자를 자동으로 인증하지 않습니다. 실제 서비스에서 연결하려면 정확한 **부모 origin, CSP, session proof 및 권한 정책**을 구성해야 합니다.

- [SDK 빠른 시작과 로컬 예제](sdk/QUICKSTART.md)
- [API Reference](sdk/API_REFERENCE.md)
- [지원 기능·제약](sdk/SUPPORT_MATRIX.md)
- [보안 경계](sdk/SECURITY_NOTES.md)

## AI 연동 데모

[온편집 AI 테스트 웹](https://edit.govpress.cloud/ai)은 **별도 운영 서버가 AI를 호출하고, 온편집 SDK가 문서에 반영하는 과정**을 보여주는 데모입니다. 공개 설치 패키지에 포함되는 로컬 AI 모델이나 무인증 GPT 서비스가 아닙니다.

보고서 작성 흐름은 다음과 같습니다.

1. **내용 작성:** 사용자의 목적·목차·분량·표 조건을 반영하여 1차 원고 생성
2. **서식 정리:** 별도 AI 단계에서 공공보고서 형식의 GFM 원고로 정리
3. **결과 확인:** 두 번째 응답을 미리보기에서 검토. 서식 정리 단계가 실패하면 1차 원고가 문서에 자동 적용되지는 않음
4. **문서 적용:** SDK 미리보기 → 사용자 명시적 승인 → 편집 → HWPX 저장

선택 문장을 AI로 다시 작성하는 흐름은 보고서 전체 생성과 구분되며, **선택 영역만 미리보기·승인 후 수정**합니다.

> [!NOTE]
> AI 응답의 길이와 실제 HWPX로 변환할 수 있는 문서의 크기는 별개입니다. 데모의 작성 분량을 사용자 요청에 맞추더라도, 공개 SDK에는 생성 **20,000 Unicode code point·200블록·표 20개·셀 1,000개** 등의 현행 지원 한도가 있습니다. 조판·구조 제약은 그보다 엄격하게 적용될 수 있습니다. 최신 값은 `getCapabilities().limits` 및 [API Reference](sdk/API_REFERENCE.md)를 확인하세요.

<details>
<summary>AI 문서 생성·선택 수정 시나리오 화면 보기</summary>

아래는 **2026-11-14의 합성 GPT 응답을 사용한 브라우저 검증 화면**입니다. 최신 서비스 화면과 일부 다를 수 있으며 실제 모델 호출 화면을 의미하지 않습니다.

**초안 미리보기·승인**

![AI 문서 초안 미리보기](docs/images/ai-demo/01-draft-preview.png)

**선택 문장 재작성·검토**

![선택 문장 수정안 미리보기](docs/images/ai-demo/02-selection-rewrite.png)

**편집 후 최종 문서**

![AI 수정과 직접 편집 결과](docs/images/ai-demo/03-final-document.png)

**내보낸 HWPX 별도 재열기**

![저장한 HWPX 독립 재열기](docs/images/ai-demo/05-reopen-document.png)

</details>

## 지원 범위와 알려진 제한

| 항목 | 현재 지원 범위 |
| --- | --- |
| HWP5·HWPX 입력 | 검증된 본문·일반 표 등 **일부 구조** |
| HWPX 출력 | 지원 구조의 새 HWPX 파일 생성 |
| 선택 영역 수정 | 연속 본문 문단, 일반·병합 셀 하나 안의 연속 문단. 선택 내 문자 서식과 문단 수 유지 조건 적용 |
| 원본 HWP 재저장 | **미지원** — 원본 HWP를 덮어쓰지 않음 |
| SWP 출력 | **미지원** |
| 복잡 문서 | 병합·중첩 구조, 암호·DRM, 개체와 복잡 조판의 완전 호환성 미보장 |
| 운영 통합 | 서비스 인증·TLS·모델 제공자 연결은 Host 측 구현 필요 |

브라우저·운영체제·글꼴에 따라 페이지 배치가 달라질 수 있습니다. 일부 테스트에서의 성공이 설치형 한/글과의 완전한 조판 동등성을 의미하지는 않습니다.

## 소스 빌드

이 저장소의 App·SDK 소스를 릴리스 실행 패키지와 함께 검증할 수 있습니다. 검증에 사용한 버전은 **Node.js 22.23.1 / npm 10.9.8**입니다.

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/replay-public-release.mjs ../onedit-runtime

npm --prefix sdk run build
npm --prefix sdk run verify:release
npm --prefix sdk test
```

`../onedit-runtime`은 위에서 내려받아 압축을 해제한 실행 패키지 디렉터리입니다. 이 빌드는 공개 App·SDK 소스와 제공된 Core 바이너리를 사용하며, **수정된 다운스트림 Rust Core 원본을 재빌드하지 않습니다.**

자세한 내용: [빌드 가이드](BUILDING-PUBLIC.md) · [Core 바이너리 출처](CORE-BUILD-PROVENANCE.md)

## 배포 파일 — v1.0.0-rc4

| 파일 | 용도 |
| --- | --- |
| `onedit-browser-runtime.tar.gz` | 실행형 편집기·Core WASM·브라우저 자산 |
| `onedit-app-source.tar.gz` | 공개 App 소스 |
| `onedit-ai-host-sdk-1.0.0-rc4.tgz` | Host SDK 설치 패키지 |
| `onedit-core-binary.tar.gz` | Core 바이너리·바인딩 및 고지 |
| `onedit-release-documentation.tar.gz` | 빌드·출처·라이선스 문서 |
| `RELEASE-NOTES.md` | 버전 변경 사항 |
| `SHA256SUMS` | 배포 파일 체크섬 |

**[v1.0.0-rc4 릴리스 및 다운로드](https://github.com/wavelen-jw/onedit/releases/tag/v1.0.0-rc4)**

## RHWP에 대한 감사

**온편집은 [RHWP](https://github.com/edwardkim/rhwp)를 기반으로 개발되었습니다.** HWP/HWPX 문서 처리 기술을 오픈소스로 구현하고 공개해 주신 **[Edward Kim](https://github.com/edwardkim) 님과 RHWP의 모든 기여자분들께 깊이 감사드립니다.**

RHWP의 공개 Core 덕분에 온편집은 웹 문서 편집 환경과 외부 서비스를 연결하는 Host SDK를 개발할 수 있었습니다. 온편집이 배포하는 Core는 **RHWP를 기반으로 수정된 다운스트림 WebAssembly 빌드**이며, RHWP 원저작자의 권리와 라이선스 고지를 유지합니다.

- [RHWP 원본](https://github.com/edwardkim/rhwp)
- [Core 저작권 및 라이선스](THIRD_PARTY_CORE_NOTICE.md)
- [Core 빌드 출처](CORE-BUILD-PROVENANCE.md)

## 라이선스

온편집이 직접 개발한 App 소스 및 Host SDK는 **[MIT License](LICENSE)**를 따릅니다. 다만 공개 배포물 전체에 MIT가 일괄 적용되는 것은 아닙니다.

- **RHWP 기반 Core:** 원 프로젝트 및 종속 구성요소 라이선스 유지
- **Noto 글꼴:** SIL Open Font License 1.1 등 해당 고지 적용
- **함초롬바탕·함초롬돋움(HCR):** 한컴의 별도 조건 적용. 상업적 글꼴 재배포에는 별도 허락이 필요할 수 있으며, MIT 라이선스만으로 허용되지 않습니다.

상업적으로 재배포할 때는 글꼴 및 포함 자산의 조건을 각각 확인하세요. [제3자 고지](THIRD_PARTY_NOTICES.md) · [Core 고지](THIRD_PARTY_CORE_NOTICE.md)

## 이슈 및 기여

오류 및 개선 제안은 [GitHub Issues](https://github.com/wavelen-jw/onedit/issues)에 남겨 주세요. 재현 단계, 입력 형식, 운영체제·브라우저, 온편집 버전을 적으면 문제 분석에 도움이 됩니다. **업무 문서 원본, 개인정보, 인증 코드 또는 API 키는 공개 이슈에 첨부하지 마세요.**

---

[릴리스](https://github.com/wavelen-jw/onedit/releases/tag/v1.0.0-rc4) · [SDK API](sdk/API_REFERENCE.md) · [빌드](BUILDING-PUBLIC.md) · [라이선스](LICENSE)
