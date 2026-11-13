# 버전 및 지원 범위

| 항목 | RC2 범위 |
| --- | --- |
| 패키지 | 1.0.0-rc2, ESM / TypeScript declarations. Node.js 22 계약 시험. |
| 편집기 프로토콜 | onedit-host, transportVersion 2, apiVersion 1.0. checked-open-v1은 편집기 opt-in과 권한 확인 필요. |
| 호환 타깃 | METADATA.json의 온편집 App과 Core. 타 빌드 또는 과거 v1 embed 호환은 이 RC의 새 브라우저 검증 범위가 아님. |
| 생성 | Markdown / DocumentSpec. 등록 스타일, 일반 표, 구조화 DocumentSpec의 검증된 병합 격자 생성. |
| 열기 | 합성 HWP5 본문 / HWPX 일반 셀 fixture. 지원·거부 정책은 API_REFERENCE.md 참조. 임의 파일, 암호/DRM/HWP3 등은 이 RC의 호환 보장 범위가 아님. |
| 선택 수정 | 본문 한 문단 일부 / 최상위 일반 셀의 한 문단 일부, 한 가지 문자 서식. 역방향 선택은 정규화. |
| 미지원 선택 | 다중·병합 셀, 중첩 표, 다문단, 컨트롤·혼합 서식, 개행으로 구조 변경. |
| 출력 | 검사된 HWPX ArrayBuffer / SHA-256 / 길이. HWP 원본 덮어쓰기와 SWP는 미지원. 원형 HWP 대신 HWPX를 새로 내보냄. |
| 상태/이벤트 | 승인·revision·origin/session을 검증하는 온편집 계약. 일반 승인·적용·Undo/Redo와 HWPX 재열기를 범위로 함. 모든 이벤트 단절/취소 경쟁의 전수 검증은 아님. |
| 별도 제품 검증 | Windows/한글, 전체 문서군, 복합 조판과 운영 배포는 이번 RC 판정에 포함되지 않음. |

별도 제품 이슈: 이미지가 포함된 기존 HWP를 HWP 형식으로 다시 저장한 회귀 시험에서 서식과 화면 배치가 달라졌습니다(FAIL). HWP 동일 형식 저장은 계속 미지원입니다. B5 표 조판 회귀는 별도 보류(HOLD)입니다. 두 이슈의 판정은 위의 HWPX 생성·부분 수정·내보내기 지원 범위와 구분합니다.
