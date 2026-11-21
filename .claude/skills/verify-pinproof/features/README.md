# PinProof 기능 지도

PinProof 의 사용자 기능을 검증하는 정본이다. 조작하기 전에 이 색인을 읽고, 맞는 기능 파일을 조작 순서로 쓴다. 헬퍼와 실행 방법은 상위 `SKILL.md` 에 있다.

## 기본 전제

- 모든 조작은 여정 스크립트 하나 안에서 `launch()` 로 시작해 `close()` 로 끝난다(조작 한 번마다 새 세션).
- `launch()` 는 실행마다 E2E 빌드를 다시 만들고, 빈 포트의 fixture 앱(`/dashboard`, `/nodes`, `/api/nodes` 200, `/api/forbidden` 403)과 새 프로필을 쓴다. 다른 실행과 상태를 나누지 않는다.
- 처음 상태는 "연결 전, 항목 0개, 카테고리 미분류 하나" 다. 담기 기능은 `connect()` 를 먼저 부른다.
- 첫 조작 전에 `doctor.mjs` 를 돌려 필수 항목이 통과하는지 본다.
- 이 여정이 띄우지 않은 브라우저나 사용자의 Chrome 은 조작하지 않는다.

## 조작 규칙

- 처음 상태에서 시작한다. 기능 파일의 Preconditions 가 다른 상태를 요구하면 그 상태를 같은 여정 안에서 만든다.
- 선택자는 data 속성 · ARIA 역할과 이름 · 라벨을 클래스보다 먼저 쓴다. 명령과 이름은 적힌 그대로 쓴다.
- 고정 대기(`waitForTimeout`) 대신 요소를 기다리거나 `waitOpfs` 로 파일을 기다린다. 5초 주기 갱신을 기다려야 하는 경우만 기능 파일에 따로 적는다.
- 확인 창(`window.confirm`)은 `dialogs` 가 기본으로 수락한다. 취소를 볼 때는 `dialogs.answer = false` 로 바꿨다가 되돌린다.

## 증명과 건너뜀 보고

- 사용자의 조작과 그 결과 상태를 모두 남긴다. 마지막 화면 하나로 증명하지 않는다.
- 화면 증명은 앱 · 패널 스크린샷(`snap`)이고, 저장 증명은 `waitOpfs` 로 읽은 파일 내용과 `close()` 가 내보낸 `opfs/` 다.
- 증거마다 기능 ID(Sub-features 의 이름)와 진입 경로를 `log` 에 남긴다.
- 닿지 못한 경로는 시도한 조작과 채우지 못한 전제를 적어 보고한다. 다른 경로로 확인한 것을 그 경로의 검증으로 보고하지 않는다.
- 대역(OPFS · 팝업 패널 · `<all_urls>` · 클립보드 가로채기 · `writeOpfs`) 위의 결과라는 점을 함께 적는다.

## 기능 파일 형식

각 파일은 H1 제목과 사용자에게 보이는 동작을 설명하는 문단 하나로 시작하고, 아래 네 H2 를 이 순서로 쓴다.

1. `Sub-features`: 짧은 ID 와 한 줄 설명
2. `How to get to it (user POV)`: 사용자가 들어가는 모든 경로
3. `Driving it with verify-pinproof harness`: `Preconditions:` 로 시작하고, 사용자 조작 · 그 조작을 하는 코드 · 보이는 결과를 짝지은 항목
4. `Gotchas`: 검증을 헛돌게 하거나 틀리게 만드는 함정

구현 세부는 적지 않는다. 사용자 경로, 안정적인 선택자, 필요한 상태, 코드, 보이는 증거만 적는다.

## 기능

| 파일 | 다루는 것 | 헬퍼 여정 |
|---|---|---|
| [network-capture.md](./network-capture.md) | 네트워크 담기: 지금 방문의 API 호출과 응답 요약을 항목으로 | `journeys/network-capture.mjs` 로 끝까지 돌려 통과함 |
| [connect-folder.md](./connect-folder.md) | 프로젝트 폴더 연결, WORKFLOW.md 생성 · 업데이트, git 무시 설정 | `connect()` 만 위 여정에서 돌림. 나머지는 run.mjs 의 연결 구역에서 통과 |
| [capture-page.md](./capture-page.md) | 요소 · 텍스트 · 영역 담기, 팝오버 메모, 번호 마커, 항목 삭제 | 아직 없음. run.mjs 의 요소 · 텍스트 · 영역 구역에서 통과 |
| [categories.md](./categories.md) | 카테고리 만들기 · 고르기 · 이름 바꾸기 · 삭제, 항목 옮기기 | 아직 없음. run.mjs 의 카테고리 구역에서 통과 |
| [handoff-archive.md](./handoff-archive.md) | 프롬프트 복사와 넘김 표시, 완료 자동 보관, 되돌리기 | 아직 없음. run.mjs 의 프롬프트 · 보관 구역에서 통과 |
