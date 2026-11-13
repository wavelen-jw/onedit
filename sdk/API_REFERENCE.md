# 온편집 외부 Host API 1.0 — 비공개 RC2

패키지 버전은 `1.0.0-rc2`이며 wire 버전은 `onedit-host / 2 / 1.0`입니다. [METADATA.json](METADATA.json)에 정확한 온편집·WASM과 빌드 지문이 있습니다.

- ESM: `import { OneditHostClient, openApprovalDigest } from 'onedit-ai-host-sdk'`. [공개 선언](dist/index.d.ts)에서 `Input`, `Output`, `Binding`, `Snapshot`, `Prepared`, `Proposal` 등을 제공합니다. `createFromChat`과 `revisePinnedSelection`은 SDK 편의 함수입니다.
- JSON Schema 2020-12: [요청](schema/request.schema.json), [응답·이벤트](schema/response.schema.json), [scope·오류·한도](schema/surface.json). `x-transferable`은 구조화 복제의 `ArrayBuffer`를 뜻합니다. 파일 길이·SHA·네이티브 검사와 승인은 스키마 외에 실제 코드에서 확인합니다.

## 연결과 상태

`onedit-host` / `transportVersion: 2` / `apiVersion: '1.0'`의 명시적 opt-in입니다. 구성된 편집기 HTML의 `meta[name=onedit-host-origins]`와 CSP `frame-ancestors`에 정확한 부모 origin을 설정해야 합니다. 즉시 부모만 연결할 수 있고, 세션은 하나의 `MessagePort`에 결속됩니다. `targetOrigin: '*'`는 사용하지 않습니다. `checkedOpen: true`를 요청해도 검증된 네이티브 검사기가 없거나 `lifecycle` 권한이 없으면 열기는 광고되지 않습니다. 두 구세대/신세대 opt-in을 한 HTML에 동시에 설정하면 닫힙니다. 기존 `onedit-ai/1.0` 및 legacy embed는 이 계약과 별개입니다.

Binding은 `documentId, documentInstanceId, workingCopyId, mutationRevision, hostVersion`입니다. 같은 파일을 다시 열어도 instance가 달라집니다. 문서가 바뀌면 이전 선택, 초안, 승인을 다시 사용하지 않습니다. `hostVersion`은 Host가 제공하는 별도 버전입니다. 생성 확정, 선택 수정 적용, 파일 열기에는 안정적인 `operationId`가 필요합니다. 연결 이후의 이벤트는 sequence가 있는 메타데이터이며 문서 원문·프롬프트를 담지 않습니다. 누락 신호 `resync-required`를 받으면 `getState`로 다시 확인합니다. iframe의 `load`만으로 API 준비가 보장되지 않습니다. 샘플은 편집기가 표시된 뒤 명시적으로 연결합니다. `ready`는 연결 후 이벤트입니다.

## 메서드 20개

아래의 ‘지원’은 온편집 구현 표면을 뜻합니다. 검증 수준은 [지원표](SUPPORT_MATRIX.md)를 참조하세요. DTO에서 생략하지 않은 메서드는 현재 Binding을 옵션으로 받습니다.

| 메서드 | 권한 | 요청 → 응답 | 범위 |
| --- | --- | --- | --- |
| `getCapabilities` | read | `{}` → `Capabilities` | 현재 연결의 메서드, 형식, 한도, 선택 범위. 실제 권한/지원 여부는 메서드 목록과 상태를 함께 확인. |
| `getState` | read | `{}` → `State` | 현재 Binding, selection revision, readonly/dirty, Undo/Redo, 열기 형식. |
| `openDocument` | lifecycle (+edit for edit scope) | `FileTransfer + OpenMetadata + OpenApproval` → `{state,displayRefreshed}` | 검사기가 연결된 opt-in. HWP5/HWPX 일부, `edit`/명시 `readonly`. 새 작업본만, 미저장 덮어쓰기 금지. |
| `getLayoutReport` | read | `{}` → `Layout` | 현재 쪽 수. 일반 조회의 `overflow:null`은 미확인, 글꼴 경고는 네이티브 한/글 일치 증명이 아님. |
| `listTemplates` | read | `{}` → `{templates}` | `public-report` v1. |
| `getStyleCatalog` | read | `{templateId,templateVersion}` → `{templateId,templateVersion,styles}` | title/subtitle/body/bullet/table. |
| `prepareDocument` | lifecycle | `{markdown \| spec,destination,replaceDirty?}` → `Prepared` | 분리 문서, blocks·layout·warnings·bytesHash·만료·previewDigest. 현재 편집기 무변경. |
| `commitPreparedDocument` | lifecycle | `{candidateId,approval}` → `{state,displayRefreshed}` | 정확한 미리보기 승인. 미저장 작업본 교체는 `replaceDirty:true`를 검토·승인한 해당 초안만. |
| `captureSelection` | read | `{}` → `Snapshot` | 실제 선택 고정. 한 본문 문단 또는 최상위 일반 셀의 한 문단, 동일 글자서식 범위. |
| `readSelection` | read | `{snapshotId,context?}` → `ReadSelection` | 정확한 원문·opaque segmentKey·최소 서식. 문맥 기본 없음, 요청 시 앞뒤 각 500 code point 이내. |
| `previewEdits` | edit | `{snapshotId,targetId,replacement}` → `Proposal` | 분리 조판; before/after, layout, target/source/format 증거와 digest. 라이브 변경 없음. |
| `applyProposal` | edit | `{proposalId,approval}` → `{applied,state,displayRefreshed}` | 검토했던 결과만 적용. 새 위치나 수정문을 받지 않음. 실제 변경 한 건당 Undo 한 번. |
| `discardProposal` | edit | `{proposalId}` → `{discarded}` | 현재 제안 폐기. |
| `releaseSnapshot` | read | `{snapshotId}` → `{released}` | 현재 선택 핸들 해제. |
| `getOperation` | read | `{operationId}` → `Operation` | 같은 세션에서 진행/확정/실패/취소와 원래 receipt 조회. |
| `cancelOperation` | edit | `{operationId}` → `Operation` | 확정 전만 취소. 이미 적용됐으면 `ALREADY_COMMITTED`와 receipt. 실행 중 동기 네이티브 작업의 강제 중단 API는 아님. |
| `undo` | edit | `{operationId?}` → `{changed,state,displayRefreshed}` | 현재 History의 Undo. 작업 지정 시 최신 작업이 아니면 거부. |
| `redo` | edit | `{}` → `{changed,state,displayRefreshed}` | 현재 History의 Redo. |
| `exportDocument` | save | `{format:'hwpx'}` → `Export` | 검사된 ArrayBuffer, byteLength, SHA-256, exportId, exportRevision. 다운로드는 dirty를 지우지 않음. |
| `acknowledgeSave` | save | `{exportId,sha256,hostVersion,proof}` → `{state,savedRevision,displayRefreshed}` | Host가 별도로 저장한 결과를 온편집에 알리는 선택 기능. 현재 작업본·해시·버전에 묶임. 내려받기만 할 때 호출하지 않음. |

`getCapabilities/getState/listTemplates/getStyleCatalog/getOperation/cancelOperation`에는 Binding 옵션을 보내지 않습니다. Operation receipt는 세션 종료 후 영속 보관되지 않습니다. `OUTCOME_UNKNOWN`이면 같은 세션의 `getOperation`을 확인하고 새 키로 자동 재적용하지 않습니다.

## 지원 범위와 거부

- 생성: Markdown의 제목·본문·목록·일반 표 및 `DocumentSpec`의 등록 스타일과 검증된 병합 격자. Markdown은 보고서 서식 경고를 검토 화면에 올립니다. 복합 HTML, 외부 자원, 인용 객체·코드 블록 등 이 경로가 받지 않는 구조는 `INVALID_SPEC` 등으로 거부합니다. 병합 격자 **생성**과 기존 병합 셀 **선택 수정**은 다릅니다.
- 선택: 역방향 선택은 정규화합니다. 반개구간 code point 오프셋과 grapheme 경계를 검증하며 원문을 정규화하지 않습니다. 캐럿만, 다문단·다중/병합 셀·중첩 표·필드/컨트롤 혼합·선택 안의 혼합 서식 및 문단 구조를 바꾸는 개행은 지원하지 않습니다. 문서 변경 후 자동 rebase하지 않습니다. IME 조합 중에는 완료까지 기다립니다.
- 외부 파일: 바이트 길이·해시·실제 서명·요청 형식 일치를 확인하고, HWP5/CFB 또는 HWPX/ZIP 네이티브 검사로 실제 구조와 자원 한도를 확인합니다. 확인된 범위는 [지원표](SUPPORT_MATRIX.md)의 합성 HWP5 본문과 HWPX 일반 셀 및 해당 거부군입니다. 정상 서명도 전 파일 호환을 뜻하지 않습니다. 암호/배포용·DRM·스크립트·위험한 경로/리소스, 불량 미리보기 등은 해당 검사기가 허용하지 않습니다. `UNSUPPORTED_CAPABILITY`는 기능이 연결되지 않은 상태, `UNSUPPORTED_UNSAFE_FILE`은 검사에서 구조·지원 범위·한도·내용을 승인할 수 없는 상태, `FORMAT_MISMATCH`는 초기 서명과 요청 형식 불일치입니다. `fileName`은 승인에 묶이는 선택 표시 이름이며 경로가 아닙니다. `hwpOverwrite:false`; **HWP 원본을 덮어쓰지 않으며 HWPX만 내보냅니다**. SWP는 지원하지 않습니다.
- 숫자 한도: JSON 2 MiB, 파일 30 MiB, 생성 20,000 code point·200 blocks·20 tables·1,000 cells·12 columns, 선택 4,000 code point, 문맥 각 500. TTL은 선택 5분, 제안 3분 이내, 초안 10분. 최신 값은 `getCapabilities().limits`. 컨테이너/자원/조판 조건은 이 수치보다 좁게 허용할 수 있습니다.
- 오류는 `code/message/retryable/recovery`. 오류 분기는 한국어 메시지가 아니라 [정본 코드](schema/surface.json) 기준으로 하세요. 충돌(`STALE_DOCUMENT`, `SOURCE_MISMATCH`)은 재선택·검토, 권한·승인(`PERMISSION_DENIED`, `APPROVAL_REQUIRED`, `INVALID_APPROVAL`)은 신뢰된 승인 경로 재확인, `RECOVERY_REQUIRED`는 복구용 사본 안내. 미지원 인자는 wire에서 `INVALID_REQUEST`로 먼저 거부될 수 있습니다(예: `format:'hwp'` 내보내기). 어떠한 거부도 빈 문서로 폴백하지 않습니다.
