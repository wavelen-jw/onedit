# 버전 및 지원 범위

| 항목 | RC4 범위 |
| --- | --- |
| 패키지 | 1.0.0-rc4, ESM / TypeScript declarations. Node.js 22 계약 시험. |
| 편집기 프로토콜 | onedit-host, transportVersion 2, apiVersion 1.0. checked-open-v1은 편집기 opt-in과 권한 확인 필요. |
| 호환 타깃 | METADATA.json의 온편집 App과 Core. 타 빌드 또는 과거 v1 embed 호환은 이 RC의 새 브라우저 검증 범위가 아님. |
| 생성 | Markdown / DocumentSpec. 등록 스타일, 일반 표, 구조화 DocumentSpec의 검증된 병합 격자 생성. |
| 열기 | 합성 HWP5 본문 / HWPX 일반 셀 fixture. 지원·거부 정책은 API_REFERENCE.md 참조. 임의 파일, 암호/DRM/HWP3 등은 이 RC의 호환 보장 범위가 아님. |
| 선택 수정 (RHW-129 후보) | 본문 또는 같은 최상위 셀(병합 포함)의 연속 문단. 동일 문자 서식, 최대 64문단/4,000 code point. LF 개수와 기존 문단 속성 보존. 역방향 선택 정규화. |
| 미지원 선택 | 다중 셀, 중첩 표, 빈 문단 구간, 컨트롤·선택 안의 혼합 문자 서식, 문단 수 변경. 안전한 보존을 증명할 수 없으면 UNSUPPORTED_SELECTION. |
| 출력 | 검사된 HWPX ArrayBuffer / SHA-256 / 길이. HWP 원본 덮어쓰기와 SWP는 미지원. 원형 HWP 대신 HWPX를 새로 내보냄. |
| 상태/이벤트 | 승인·revision·origin/session을 검증하는 온편집 계약. 일반 승인·적용·Undo/Redo와 HWPX 재열기를 범위로 함. 모든 이벤트 단절/취소 경쟁의 전수 검증은 아님. |
| 별도 제품 검증 | Windows/한글, 전체 문서군, 복합 조판과 운영 배포는 이번 RC 판정에 포함되지 않음. |

별도 제품 이슈: 이미지가 포함된 기존 HWP를 HWP 형식으로 다시 저장한 회귀 시험에서 서식과 화면 배치가 달라졌습니다(FAIL). HWP 동일 형식 저장은 계속 미지원입니다. B5 표 조판 회귀는 별도 보류(HOLD)입니다. 두 이슈의 판정은 위의 HWPX 생성·부분 수정·내보내기 지원 범위와 구분합니다.

RHW-129 후보는 공개 RC3 태그 변경이 아닙니다. Node 22에서 합성 채팅 HWPX(일반/병합 표·혼합 인라인 서식)의 공개 SDK 열기/일반 Command 편집/저장/새 runtime 재열기와 선택 수정·Undo/Redo를 검증합니다. 실제 제3자 샘플은 제공되지 않았으며 브라우저/IME/한컴 시각 검증을 대체하지 않습니다.
