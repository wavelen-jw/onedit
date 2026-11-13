# 빠른 시작

## 프로젝트와 분리된 디렉터리에서 실행

패키지 tarball과 별도 승인 경로로 받은 온편집 사전 빌드 디렉터리를 준비하세요. SDK tarball에는 편집기, WASM, 폰트, Playwright가 들어 있지 않습니다. 승인받은 사전 빌드가 없으면 설치·import·계약 시험까지 실행할 수 있으며 브라우저 전체 예제는 실행할 수 없습니다.

```sh
npm init -y
npm install --offline --ignore-scripts ./onedit-ai-host-sdk-1.0.0-rc2.tgz
SDK=node_modules/onedit-ai-host-sdk
node "$SDK/tests/contract.test.mjs"
node "$SDK/sample/stage-editor.mjs" /path/to/authorized-onedit-runtime ./editor
node "$SDK/sample/local.mjs" ./editor
```

출력된 loopback URL을 Chromium에서 열고 편집기가 보이면 **편집기 연결**을 누릅니다. 예제는 임시로 다른 loopback port에 편집기를 제공하고 해당 부모 origin만 허용합니다. fixture는 설치 경로의 `fixtures/plain.hwp`, `fixtures/table.hwpx`입니다. 임의 파일을 승인하는 예제가 아닙니다.

1. **Markdown 문서 검토** 또는 **DocumentSpec 문서 검토**에서 미리보기 후 **승인**합니다. **HWPX 다운로드**로 결과를 받습니다.
2. 새 탭에서 HWP 또는 HWPX fixture를 선택해 **파일 열기 검토 → 승인**을 누릅니다. HWP 본문의 `base` 중 `b` 또는 HWPX 일반 셀의 `def` 중 `d`를 한 글자 선택하고 **선택 고정 → 수정 제안 검토 → 승인**을 누릅니다. 고정 Mock 응답으로 각각 `B`, `X`가 됩니다. **되돌리기 / 다시 실행** 후 HWPX를 내려받고 별도 편집기에서 엽니다.
3. 내보내기와 다운로드는 저장 완료 승인과 별개입니다. 예제는 다운로드만 하므로 dirty를 지우지 않습니다. Ctrl+C로 예제를 닫습니다.

Playwright와 지원 Chromium을 **이미 별도 설치**한 소비자는 아래 선택 시험도 실행할 수 있습니다. Chromium sandbox를 그대로 유지합니다.

```sh
node "$SDK/tests/browser.mjs" ./editor ./new-results /path/to/chromium
```

## 실제 Host에서 연결

번들러에서는 `onedit-ai-host-sdk`를 import합니다. 번들러가 없으면 설치된 `dist/`의 상대 경로를 유지해 Host에 제공하고 ESM `/sdk/index.js`를 사용합니다. SDK URL은 Host 자산이며, `editorOrigin`은 iframe의 실제 편집기 origin입니다. 이 값은 경로 없는 정확한 origin이어야 합니다. 편집기의 승인된 parent allowlist와 CSP, 지원되는 policy 연동이 먼저 구성되어야 합니다. SDK는 iframe을 자동 생성하거나 운영 편집기를 활성화하지 않습니다.

[TypeScript 예제](sample/quickstart.ts)는 공개 entry에서 두 흐름을 가져옵니다. 핵심 순서는 아래와 같습니다.

- 생성: 현재 binding → `prepareDocument({markdown|spec, destination})` → preview 확인 → 검토와 결속된 proof → `commitPreparedDocument` → `exportDocument({format:'hwpx'})`.
- 선택 수정: 지원 capability 조회 → 검사할 HWP/HWPX의 bytes/length/SHA와 열기 승인 → `openDocument` → 초점 이동 전에 `captureSelection` → `readSelection` → `previewEdits` → 검토된 proposal 승인 → `applyProposal` → Undo/Redo → HWPX export.

모델에는 opaque segment key, 선택 원문, 허용 문맥만 제공하세요. 위치·revision·승인 proof는 모델 출력에서 받아들이지 않습니다. 상태가 바뀌면 선택을 다시 고정하고 검토합니다. timeout의 쓰기 결과를 확인할 때에는 새 key를 만들기 전에 같은 세션의 `getOperation`을 조회합니다.
