---
name: verify-pinproof
description: PinProof 크롬 익스텐션을 Playwright Chromium 에 실제로 올려 페이지 툴바 · 사이드 패널 · 저장 파일(.pinproof/)로 동작을 증명하는 절차와 헬퍼. 익스텐션의 담기 · 패널 · 저장 동작을 고친 뒤 완료를 보고하기 전, 버그를 실제 브라우저에서 재현할 때, "실제로 돌려서 확인해줘" 같은 요청에 쓴다.
---

# PinProof 검증

PinProof 를 사람이 쓰듯 조작해 동작을 증명한다. 사용자가 만지는 화면은 두 곳이다. 앱 페이지 위의 툴바 · 팝오버 · 마커(`pinproof-overlay`, 열린 shadow DOM)와 사이드 패널(`sidepanel.html`)이다. 항목은 프로젝트 폴더의 `.pinproof/` 에 저장되는데, 폴더 선택 창은 자동화할 수 없어서 검증에서는 익스텐션의 OPFS 를 프로젝트 폴더 대신 쓴다. 대역 때문에 확인하지 못하는 것은 아래 "대역과 범위 밖" 에 있다.

## 실행 모델

조작 한 번(여정 스크립트 한 번)마다 새 세션이다. 여정 스크립트가 `launch()` 로 브라우저를 띄우고 `close()` 로 정리하며, 그 사이에서 모든 조작과 확인을 한다. 여러 명령에 걸쳐 같은 브라우저를 이어 쓸 수 없으므로, 확인할 것이 생기면 여정 파일을 하나 만들어 처음부터 돌린다.

## Launch

```bash
node .claude/skills/verify-pinproof/scripts/doctor.mjs                    # 먼저 점검
node .claude/skills/verify-pinproof/scripts/journeys/network-capture.mjs  # 여정 실행, exit 0 이면 통과
```

`launch()`(scripts/harness.mjs)가 하는 일:

1. 빌드 잠금(`test-results/verify/.build.lock`) 아래에서 `PINPROOF_E2E=1` 로 `wxt build` 를 돌려 `.output-e2e/chrome-mv3` 를 만들고, 실행별 임시 폴더(`%TEMP%\pinproof-verify-XXXXXX\ext`)로 복사해 그 복사본을 올린다. 일반 `npm run build` 는 `.output` 에 쓰고 `<all_urls>` 도 없어서 검증에 쓰이지 않는다. 빌드는 1~2초 걸린다.
2. 127.0.0.1 의 빈 포트에 fixture 서버를 띄운다. `tests/e2e/fixture/index.html` 을 모든 경로에 주고, `/api/nodes` 는 200, `/api/forbidden` 은 403 을 준다. 띄워 둔 실제 앱을 쓰려면 `launch({ url: 'http://localhost:5173', start: '/' })` 처럼 넘긴다.
3. 임시 폴더의 새 프로필로 Playwright Chromium(`channel: 'chromium'`, 기본 headless, `HEADED=1` 이면 창이 보인다)에 확장을 올린다. 기존 E2E(`tests/e2e/run.mjs`)와 같은 브라우저다. 앱 탭을 연 뒤, 사이드 패널을 팝업 창(`sidepanel.html?tab=<탭 id>&opfs=1`)으로 연다.

준비 완료: `launch()` 가 돌아오면 패널이 열려 있다. `connect()` 뒤 `.cat.current` 가 보이면 담을 수 있다. 앱 페이지의 툴바(`pinproof-overlay .tb`)는 패널이 열려 있을 때만 뜬다.

종료: 여정의 `finally` 에서 `close()` 를 부른다(아래 Cleanup).

## Doctor

`node .claude/skills/verify-pinproof/scripts/doctor.mjs` 는 읽기 전용이다. 처음 돌리기 전, 이상한 일이 생긴 뒤, 여정이 실패한 뒤에 돌린다.

- 필수(하나라도 실패하면 exit 1): Node 18 이상, wxt 설치(`npm ci`), fixture 파일, Playwright Chromium(없으면 `npx playwright install chromium`, `%LOCALAPPDATA%\ms-playwright` 에 약 150MB)
- 경고: E2E 빌드 상태(없음 · `<all_urls>` 없음 · 소스보다 오래됨), 빌드 잠금, 남은 임시 폴더, 임시 폴더를 쓰는 프로세스, `tests/e2e/run.mjs` 실행 중 여부

## Drive

`scripts/journeys/_template.mjs` 를 복사해 여정을 만든다. 기능별 조작 순서와 선택자는 `features/` 의 기능 파일을 따르고, 더 많은 예는 기존 E2E 의 같은 구역(`tests/e2e/run.mjs` 의 `// ---------- <구역> ----------`)에 있다. 선택자는 data 속성 · ARIA 역할과 이름을 클래스보다 먼저 쓴다.

`launch()` 가 돌려주는 손잡이:

| 손잡이 | 쓰임 |
|---|---|
| `app` · `panel` | Playwright 페이지(앱 탭 · 사이드 패널) |
| `base` | 앱 주소(`http://localhost:<포트>`) |
| `connect({ gitRepo })` | [프로젝트 폴더 연결]을 누른다. `gitRepo: true` 면 `.git/info/exclude` · `.gitignore` 를 먼저 둔다 |
| `toolbar.element` · `.text` · `.region` · `.network` · `.markers` · `.root` | 페이지 툴바 버튼(`[data-mode="element"]`, `[data-act="network"]` 등) |
| `popover` · `confirmPopover(메모)` | 고른 자리에 뜬 팝오버, 메모를 쓰고 Enter 로 담기 |
| `rows()` | 지금 담는 카테고리 상자의 항목 줄(`.cat.current .ev`) |
| `pins()` | 지금 페이지에 보이는 마커 번호 |
| `readOpfs(경로)` · `waitOpfs(경로, 조건)` | 저장 파일 읽기(경로가 `/` 로 끝나면 이름 목록) · 조건을 채울 때까지 기다리기 |
| `writeOpfs(경로, 내용)` | 에이전트가 항목 md 를 고친 것처럼 파일을 직접 쓴다(대역) |
| `exportOpfs(폴더)` | 저장 파일을 증거 폴더 `opfs/` 로 내보낸다. `close()` 가 `.pinproof` 를 자동으로 내보낸다 |
| `dialogs` | 확인 창 기록(`dialogs.messages`). 기본은 수락, `dialogs.answer = false` 면 취소 |
| `notices()` · `clipboard()` | 패널 알림 모음 · 프롬프트 복사로 쓴 내용 |
| `snap(이름)` · `log(문장)` | 앱 · 패널 스크린샷 · 단계 기록 |

검사는 `checker(h.log)` 의 `check(조건, 설명)` 으로 하고, 끝에 `process.exitCode` 로 알린다. `process.exit` 를 부르면 정리가 건너뛰어진다.

## Evidence

증거는 `test-results/verify/<실행 ID>/` 에 남는다. gitignore 대상이고, `close()` 와 `cleanup.mjs` 는 이 폴더를 지우지 않는다.

- `steps.log`: 단계와 검사(✔ · ✘) 기록
- `NN-<이름>-app.png` · `NN-<이름>-panel.png`: 순번을 붙인 앱 · 패널 스크린샷
- `opfs/.pinproof/…`: `close()` 가 내보낸 저장 파일(항목 md · 스크린샷 asset · WORKFLOW.md)

증명 기준:

- 사용자 경로로 조작한다. 툴바 버튼 · 페이지 · 팝오버 · 패널 버튼을 누른다. 익스텐션 내부 함수를 부르거나 OPFS 에 항목을 직접 써서 "담긴 것처럼" 만들지 않는다. `writeOpfs` 는 에이전트의 처리를 흉내 낼 때만 쓴다.
- 조작 전과 후를 모두 남긴다(`snap`).
- 부수 효과는 두 번째 경로로 확인한다. 패널 줄을 봤으면 저장 파일도 `waitOpfs` 로 읽는다.
- `notices()` 에 "저장 실패" 가 없는지 본다.
- 결과를 보고할 때는 증거 폴더 경로와, 아래 대역 중 그 확인에 걸린 것을 함께 적는다.

## Cleanup

- `close()`: OPFS 의 `.pinproof` 를 증거로 내보낸 뒤 브라우저와 fixture 서버를 닫고, 실행별 임시 폴더를 지운다. 지우기는 재시도하고, 실패해도 실행 결과는 바꾸지 않는다. Ctrl+C 로 끊어도 `close()` 를 탄다.
- 강제 종료(도구 시간 초과 등)로 `close()` 를 못 탔으면 doctor 로 남은 것을 보고, 돌고 있는 여정이 없을 때 `node .claude/skills/verify-pinproof/scripts/cleanup.mjs` 를 돌린다. 이 스크립트는 프로세스를 이름으로 끄지 않고, 명령줄에 `pinproof-verify-` 토큰이 든 것(여정이 띄운 것)만 끈다. 그다음 남은 임시 폴더와 빌드 잠금을 지운다. 증거 폴더는 건드리지 않는다.
- 강제 종료된 실행에는 OPFS 내보내기가 없어 `steps.log` 와 그때까지의 스크린샷만 남는다. 오래 걸리는 여정은 중간에 `exportOpfs()` 를 불러 둔다.
- Bash 도구로 여정을 돌릴 때는 `timeout` 을 넉넉히(예: 300000) 준다.

## Helpers

| 스크립트 | 실행 |
|---|---|
| `scripts/doctor.mjs` | `node .claude/skills/verify-pinproof/scripts/doctor.mjs` |
| `scripts/cleanup.mjs` | `node .claude/skills/verify-pinproof/scripts/cleanup.mjs` |
| `scripts/journeys/network-capture.mjs` | `node .claude/skills/verify-pinproof/scripts/journeys/network-capture.mjs` (exit 0 = 통과) |
| `scripts/journeys/_template.mjs` | 복사해서 새 여정을 만든다 |
| `scripts/harness.mjs` | 여정이 import 하는 라이브러리(`launch` · `checker` · `listProcesses`) |

## 전체 회귀(tests/e2e/run.mjs)

기존 E2E 는 196개 검사로 거의 모든 기능을 끝까지 돈다. Git Bash 에서 아래처럼 돌린다.

```bash
PINPROOF_E2E=1 npx wxt build && node tests/e2e/run.mjs
```

- Windows 에서 `npm run test:e2e` 는 cmd 가 `PINPROOF_E2E=1` 문법을 몰라 바로 실패한다(`'PINPROOF_E2E' is not recognized`).
- run.mjs 머리 주석의 `npm run build && node tests/e2e/run.mjs` 는 `.output` 을 만들어서 맞지 않다. 위 명령을 쓴다.
- 포트 5199 와 `.e2e-profile` 이 고정이라 두 개를 동시에 돌릴 수 없다. 또 run.mjs 는 `.output-e2e` 원본을 올리므로, 여정과 동시에 돌리면 여정의 빌드가 그 폴더를 지운다. 여정과 run.mjs 는 번갈아 돌린다.

## 대역과 범위 밖

이 스킬로 확인한 결과는 아래 대역 위에서 나온 것이다.

| 대역 | 실제 | 그래서 확인하지 못하는 것 |
|---|---|---|
| OPFS(`?opfs=1`) | 사용자가 고른 프로젝트 폴더 | 폴더 선택 창, 실제 디스크의 `.pinproof/` · `.claude/skills/`, 예전 `.bugnotes/` 옮기기 확인 창(OPFS 모드는 건너뛴다), 연결 알림의 폴더 이름(OPFS 는 빈 이름이라 `"" 폴더에 연결했습니다` 로 나온다) |
| 팝업 창으로 연 `sidepanel.html` | Chrome 사이드 패널 | 사이드 패널을 열고 닫는 흐름, 닫을 때 연결이 끊기는 동작 |
| E2E 빌드의 `<all_urls>` | `activeTab`(툴바 아이콘으로 패널을 연 탭만 캡처 허용) | 아이콘 · `Alt+Shift+B` 로 연 탭에서만 스크린샷이 되는 권한 흐름 |
| Playwright Chromium(headless) | 사용자의 Chrome | Chrome 정책, 다른 확장과의 충돌 |
| fixture 페이지 | 개발 중인 실제 앱 | 프레임워크 어댑터(React 컴포넌트 · 소스 위치). `launch({ url })` 로 실제 앱을 쓰면 일부 확인할 수 있다 |
| `clipboard()` 가로채기 | 실제 클립보드 | 다른 곳에 붙여 넣은 결과 |
| `writeOpfs` 로 고친 md | 에이전트가 `/pinproof` 로 처리 | 실제 에이전트의 처리 |

범위 밖: 배포 주소에서 사이트별로 켜기(run.mjs 의 배포 주소 구역), React 19 어댑터(run.mjs 의 heureum 구역), 실제 사이드 패널과 `activeTab`. 실제 사이드 패널은 사람이 Chrome 에서 확인한다(`todo/plan-vibe-style-ui.md` 10번의 남은 항목).

## 유지

앱의 화면이나 흐름이 바뀌면 `/maintain-verification-skill` 로 기능 지도와 헬퍼를 맞춘다. 기능 지도의 정본은 `features/` 다.
