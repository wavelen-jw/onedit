# 패치노트

## v1.2.0

- 온라인 AI 데모에서 초대 코드를 입력하기 전에도 문서를 열고 편집할 수 있습니다. 초대 코드 입력 화면과 연결 안내를 정리했습니다.
- AI가 작성한 보고서는 별도의 Markdown 미리보기 없이 적용 내용을 확인한 뒤 문서에 넣을 수 있습니다.
- 일반 편집기와 AI 데모가 같은 편집기 빌드를 사용합니다. 붙여넣기, HWPX 저장 확인, 글자·문단 서식, 표·그림 조작을 공통 처리 경로로 통합했습니다.
- Host SDK의 20개 메서드와 8개 이벤트를 유지했습니다. 같은 버전의 실행 패키지로 SDK 예제를 사용할 수 있습니다.

[실행 및 빌드 안내](https://github.com/wavelen-jw/onedit/blob/v1.2.0/BUILDING-PUBLIC.md) · [Core 고지](https://github.com/wavelen-jw/onedit/blob/v1.2.0/THIRD_PARTY_CORE_NOTICE.md)

## v1.1.0

- 클립보드에 복사한 GFM 문서의 제목·목록·표를 편집 가능한 서식으로 붙여넣을 수 있습니다.
- 한/글이 브라우저에 제공한 클립보드 데이터에서 본문·병합표·이미지와 서식을 가져오는 경로를 개선했습니다.
- 반복 입력과 셀 조작 시 화면 갱신을 줄이고, 고정 높이 표와 부동 표가 쪽 경계에서 본문과 겹치는 문제를 개선했습니다.
- SDK 임베딩 예제는 별도 검증한 `onedit-sdk-editor-runtime.tar.gz`를 사용합니다. Host SDK v1의 20개 메서드·8개 이벤트와 전송 버전을 유지합니다.
- 공개 Core는 WASM과 바인딩으로 배포합니다. Core 바이너리와 브라우저 실행 패키지에 Rust 표준 라이브러리의 저작권 및 라이선스 고지가 포함돼 있습니다.

[실행 및 빌드 안내](https://github.com/wavelen-jw/onedit/blob/v1.1.0/BUILDING-PUBLIC.md) · [Core 고지](https://github.com/wavelen-jw/onedit/blob/v1.1.0/THIRD_PARTY_CORE_NOTICE.md)
