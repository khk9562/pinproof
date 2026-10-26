# PinProof (구 BugNotes) — 화면 버그 기록 → Claude 전달 크롬 익스텐션

> 2026-10-16 이름 변경: BugNotes → **PinProof**. 데이터 폴더 `.bugnotes/` → `.pinproof/`, 커맨드 `/bugnotes` → `/pinproof`. 아래 본문의 옛 이름은 당시 기록이라 그대로 둠.

## Context
- 개발 중인 웹(프레임워크 무관, localhost)에서 화면 버그·데이터 정합성 문제를 찾을 때, 지금은 메모장에 자유 텍스트로 적어 Claude Code에 붙여넣음.
- 문제: Claude가 어떤 요소/값인지 다시 찾아야 함 / 페이지를 넘나드는 증거(대시보드 총합 vs 목록)를 구조적으로 남길 수 없음 / 기록이 쌓이지 않음.
- 목표: 요소·텍스트·영역·네트워크를 증거로 집어 "기록 건"에 모으고, 프로젝트 폴더에 md로 쌓아 Claude Code가 `/bugnotes 12`로 건별 처리.

## 레퍼런스에서 가져온 것
| 출처 | 반영 |
|---|---|
| Agentation | 요소 + 텍스트 선택 병행, selector·컴포넌트 트리·소스 경로를 출력에 포함 |
| React Grab | React fiber에서 컴포넌트명 + `file:line` 추출 (main world) |
| Vibe Annotations | route 이동해도 한 세션 유지, viewport 폭 기록 |
| Drawbridge | 프로젝트 폴더에 파일 저장 + 슬래시 커맨드 처리, 영역(rect) 보조 모드 |
| onUI | 앱 코드 수정 없는 익스텐션 |
| Jam / BrowserTools | 네트워크를 증거로 첨부 |
| Hypothesis | 텍스트 선택을 exact + prefix/suffix로 저장 |
| DevTools Elements | `↑`/`↓`로 부모·자식 이동 선택 |

## 확정된 결정 (grilling 결과)
1. 전달: **파일 기반**. MCP 없음.
2. 선택: **요소 선택 기본**, 영역 드래그 보조, 스크린샷 자동 첨부.
3. 용어: **기록 건** = 메모장의 `1.` 한 덩어리. 외부 트래커와 무관.
4. 수집: **작성 중인 건에 계속 담기**. 작성 중인 건이 없으면 **미분류**에 두었다가 옮김.
5. 값: **원본만 기록**. 파싱·집계·비교 안 함, 판단은 Claude.
6. 목록 전체 행 수집 없음 → **`↑`/`↓` 부모·자식 이동**으로 테이블/컨테이너를 집어 단서만 남김.
7. 네트워크: **버튼으로 현재 route의 API 목록 첨부** (자동 첨부 X).
8. 전달 장치: **`/bugnotes` 커맨드 + 복사 버튼**, 둘 다 `.bugnotes/WORKFLOW.md`를 따름.
9. 위치: **`.bugnotes/`** (프로젝트 루트).
10. git: 폴더 연결 시 **`.bugnotes/`, `.claude/commands/bugnotes.md`를 `.gitignore`에 자동 추가**.
11. 메모: **자유 메모 + 최소 항목**(제목 / 유형: 버그·수정 요청·확인 요청 / 연관: 자유 텍스트) + 증거별 한 줄 메모(선택).
12. 상태 필드 **없음**. 끝난 건은 익스텐션에서 **보관 → `.bugnotes/archive/`로 이동**. `/bugnotes`는 보관 안 된 건만 표시.
13. 파일: **기록 1건 = md 1개** (frontmatter + 메모 + 증거), 스크린샷은 `assets/<id>/`.
14. 화면: **사이드 패널**(목록·작성 중·메모) + **페이지 위 선택 도구**(하이라이트만).
15. 범위: **localhost / 127.0.0.1만**.

16. **프레임워크 무관.** 핵심 증거(selector·텍스트·HTML·스크린샷·네트워크)는 DOM과 브라우저 API만 사용해 어떤 웹이든 동작. 컴포넌트명·소스 위치는 **자동 감지 어댑터로 가능할 때만 덧붙이는 보강 정보**이고, 감지되지 않으면 생략. MVP 어댑터는 React(16~19)만, Vue·Svelte 등은 이후 추가.
17. **selector는 클래스명에 의존하지 않음.** StyleX·Tailwind·CSS Modules처럼 클래스가 해시/원자 단위인 경우가 흔하므로 우선순위: `data-testid` > `id` > `aria-label`/role + 텍스트 > 구조 경로(`nth-of-type`). 사람이 읽을 수 있는 클래스만 보조로 사용.

## 구조

### 기술 스택
- Chrome MV3, **WXT + React + TypeScript** (side panel / content script / background 엔트리 구성이 간단).
- 권한: `sidePanel`, `scripting`, `storage`, `unlimitedStorage`, host_permissions `http://localhost/*`, `http://127.0.0.1/*`.

### 구성 요소
| 컴포넌트 | 역할 |
|---|---|
| `sidepanel/` (React) | 앱 등록(localhost 포트 → 프로젝트 폴더), 작성 중인 건, 미분류, 기록 목록, 보관, 복사 |
| `content/picker` (isolated world) | hover 하이라이트(Shadow DOM 오버레이), `↑`/`↓`/Esc/클릭, 텍스트 선택, 영역 드래그 |
| `content/main-world` (MAIN world, `document_start`) | ① fetch/XHR 후킹 → route별 링버퍼 ② 프레임워크 어댑터(자동 감지, 선택): React fiber에서 컴포넌트 체인 + 소스 위치 |
| `background` | `captureVisibleTab`, 메시지 중계 |
| `lib/fs` | File System Access API: 폴더 핸들을 IndexedDB에 보관, 파일 읽기/쓰기/이동 |
| `lib/markdown` | 기록 모델 ↔ md 직렬화 |

- isolated ↔ main world 통신: `window.postMessage`(고유 채널 키). side panel ↔ content: `chrome.tabs.sendMessage`.

### 증거 종류와 저장 내용
| 종류 | 저장 내용 |
|---|---|
| 요소 | URL·route, selector(결정 17 우선순위), 텍스트 원문, 컴포넌트 체인 + 소스 위치(어댑터가 감지한 경우만), outerHTML 앞 2KB, viewport 폭, 스크린샷(요소 crop + 하이라이트) |
| 컨테이너 | 위 항목 + 테이블 헤더(`thead th`, `[role=columnheader]`), 보이는 행 수(`tbody tr`, `[role=row]`), innerText 앞 300자(“총 23건” 등 포함) |
| 텍스트 | 선택 텍스트(exact), 앞뒤 32자, 감싸는 요소의 selector·컴포넌트 |
| 영역 | 드래그 사각형 좌표, crop 스크린샷, 영역 안에 완전히 들어간 최상위 요소 최대 10개(selector·텍스트) |
| 네트워크 | 현재 route의 호출: method, URL, status, 소요 시간, 응답 크기, 응답 앞 500자. **요청 헤더·쿠키·Authorization은 저장 안 함**. `/_next/`, HMR, `?_rsc=` 제외 |

### UI 설계 (레퍼런스 조사 반영)

**조사한 레퍼런스와 가져온 점**
| 레퍼런스 | 확인 방법 | 가져온 점 |
|---|---|---|
| Agentation | 사이트에서 툴바 직접 실행 + Features 문서 | 얇은 파란 outline + 사람이 읽는 라벨(버튼·링크는 텍스트로 이름 붙임) / 담은 요소에 번호 마커(단일=파랑, 영역·다중=초록) / 마커 hover 시 메모 미리보기, 클릭 시 편집 / 입력란에 포커스가 있으면 단축키 비활성 / 애니메이션 일시정지(P) |
| React Grab | 사이트 데모 | 한 줄 참조 형식 `<h1> in GrabDemo (grab-demo.tsx:361:13)` → 증거 카드의 요약 줄로 사용 |
| VisBug | README + 키보드 목록 | 키보드 DOM 이동: 형제(Tab/Shift+Tab), 자식으로(Enter), 부모로(Shift+Enter) → 우리는 화살표 4방향으로 단순화 |
| Vibe Annotations | 사이트 데모 | 페이지 위 메모 카드 헤더 `</> .stats-card · @1440w` / 사이드 큐 목록 `1 .stats-card · tighten padding` / 증거 카드에 COMPONENT · SELECTOR · ELEMENT 구분 / 영역 자동 스크린샷 |
| Drawbridge | 저장소 + V2 변경 기록 | v1의 페이지 주입 사이드바를 **Chrome Side Panel로 이전**(우리 결정 14와 일치) / 라이트·다크 테마 토큰 / 패널에 스크린샷 썸네일 / ⚠️ "side panel은 페이지 범위 파일 핸들에 직접 접근 불가해서 파일 작업을 content script에 둠" → 0단계 검증 항목에 추가 |
| Chrome DevTools inspect | 기존 지식 (이번에 재확인 안 함) | hover 툴팁에 태그·크기 표시 |
| Hypothesis | 기존 지식 (이번에 재확인 안 함) | 텍스트를 드래그하면 선택 영역 근처에 작은 버튼이 뜨는 방식 |

**A. 페이지 위 선택 도구** (Shadow DOM, 최상위 z-index, 오버레이는 `pointer-events: none`)
- hover: 1px accent outline + 옅은 채움, 요소 위에 라벨 칩 `<td> NodeRow › NodeListTable · 120×32` (어댑터 없으면 `<td> · 120×32`). 버튼·링크는 텍스트로 이름 표시.
- 키: `↑` 부모 / `↓` 자식(내려왔던 경로를 기억해 되돌아감) / `←` `→` 형제 / 클릭·Enter = 담기 / Esc = 종료.
- **연속 모드**: 담아도 선택 도구가 꺼지지 않음(여러 증거를 연달아 수집). 담는 순간 짧은 플래시 + 마커 표시.
- 마커: 담은 요소에 **증거 문자(A, B, C…)** 표시 = 사이드 패널·md 파일과 같은 문자. 단일 요소=파랑, 텍스트·영역=초록. hover 시 한 줄 메모 미리보기, `H`로 숨기기.
- 텍스트 모드: 드래그 후 선택 영역 근처에 `+ 담기` 칩.
- 영역 모드: 십자 커서 드래그, 점선 사각형 + 크기 라벨.
- 메모 입력은 페이지 위가 아니라 **사이드 패널**에서 함(앱 화면을 가리지 않음).

**B. 사이드 패널**
```
┌ BugNotes ─────────────────────────┐
│ localhost:5173 → heureum   ● 연결됨 │  ← 끊기면 [폴더 다시 연결]
│ [요소 E] [텍스트 T] [영역 R] [네트워크 N] │
├───────────────────────────────────┤
│ ✏️ 작성 중  #012                     │  ← 상단 고정, accent 테두리
│ 제목 [대시보드 총합 불일치        ]   │
│ 유형 (버그)(수정 요청)(확인 요청)      │
│ 연관 [#589]                          │
│ 메모 [                            ]  │
│ ┌ A 요소  /dashboard ──────── [썸] ┐ │
│ │ <div> in SummaryCard (…:42)      │ │
│ │ "10"   메모: 총합 카드           │ │
│ └ [페이지로 이동] [옮기기] [삭제] ──┘ │
│ ┌ B 컨테이너  /nodes ──────── [썸] ┐ │
│ │ <table> in NodeListTable · 23행  │ │
│ └──────────────────────────────────┘ │
│ [작성 종료]               [복사]     │
├───────────────────────────────────┤
│ ▸ 미분류 (2)                          │
│ ▾ 기록 (5)              [보관함 보기] │
│   #013 VM Agent 조회 실패 문구 · 확인 · 1 │
│   #007 노드 목록 무한 스켈레톤 · 버그 · 2 │
└───────────────────────────────────┘
```
- 증거 카드: 문자 배지 + 종류 + route 칩 + 한 줄 참조(React Grab 형식) + 텍스트 원문 + 썸네일 + 한 줄 메모(선택).
- **[페이지로 이동]**: 증거가 있던 route로 이동한 뒤 selector로 요소를 다시 찾아 스크롤 + 플래시. 페이지 간 증거를 다시 확인할 때 사용.
- 기록 목록의 건을 클릭하면 다시 "작성 중"으로 열어 증거를 추가할 수 있음.
- 라이트·다크 테마 토큰.

### 파일 레이아웃
```
프로젝트/
├ .bugnotes/
│  ├ WORKFLOW.md                       # 공통 처리 절차 (단일 원본)
│  ├ 012-대시보드-총합-불일치.md
│  ├ assets/012/A.png
│  └ archive/                          # 보관된 건 (md + assets 함께 이동)
└ .claude/commands/bugnotes.md         # "WORKFLOW.md를 따르라" + $ARGUMENTS
```
- 번호: `.bugnotes/`와 `archive/`의 최대 id + 1, 3자리.
- md 본문: frontmatter(`id, title, type, related, created, app`) → `## 메모` → `## 증거`(`### A. 요소 — /dashboard` …). 이전 질문에서 보여준 예시 형식대로.
- **`## 처리 기록` 이후는 익스텐션이 절대 덮어쓰지 않음.** 익스텐션은 IndexedDB의 기록 모델로 그 앞부분만 다시 생성. Claude는 처리 후 파일 끝에 `## 처리 기록`(원인 / 수정 파일 / 확인 방법)을 덧붙임.
- 미분류 증거: 파일로 쓰지 않고 IndexedDB(스크린샷 blob 포함)에 보관 → 기록 건으로 옮길 때 파일화.

### WORKFLOW.md 절차 (요지)
- 인자 없음: `.bugnotes/*.md`(archive 제외)를 읽어 `#id 제목 · 유형 · 증거 수` 목록 출력.
- `<id>`: 해당 md 읽기 → 스크린샷 확인 → 증거의 컴포넌트 `file:line`/selector로 코드 추적 → 증거 간 값 비교·네트워크 응답 대조 → 원인 설명 → 유형이 버그·수정 요청이면 수정, 확인 요청이면 확인 결과만 보고 → 파일 끝에 `## 처리 기록` 추가. archive 이동은 하지 않음(사용자가 함).

### 폴더 연결 흐름 (사이드 패널)
1. 앱 추가: localhost 포트 입력 → `showDirectoryPicker()`로 프로젝트 폴더 선택.
2. 동의 다이얼로그에서 생성할 파일 목록 표시 → `.bugnotes/WORKFLOW.md`, `.claude/commands/bugnotes.md` 생성, `.gitignore`에 블록 추가(이미 있으면 생략).
3. 브라우저 재시작 후 권한이 `prompt`로 돌아가면 패널에 "폴더 다시 연결" 버튼(사용자 클릭 → `requestPermission`).

## 구현 순서
0. **기술 검증 (먼저)**
   - side panel에서 `showDirectoryPicker` + IndexedDB 핸들 유지 + 재시작 후 재권한 흐름
     (Drawbridge는 side panel에서 파일 핸들 접근이 막혀 파일 작업을 content script로 옮김 → 안 되면 같은 방식으로 대체)
   - React 어댑터: React 16~18은 fiber `_debugSource`, React 19는 `_debugSource`가 없어 `_debugStack` 스택 + Vite 소스맵으로 파일 경로·줄 복원 가능한지 heureum(React 19 + Vite)에서 확인. 안 되면 컴포넌트명 + 파일 경로만
   - `captureVisibleTab` + devicePixelRatio crop
1. WXT 골격, 사이드 패널, 앱 등록·폴더 연결, WORKFLOW/커맨드/gitignore 생성
2. 선택 도구: hover 오버레이, `↑`/`↓`, 요소·컨테이너 정보 추출, 스크린샷
3. 기록 건: 새 기록/작성 중/미분류, md 쓰기, 번호, 보관, 복사 버튼
4. 텍스트 선택, 영역 드래그, 네트워크 후킹·첨부
5. 실사용 검증 (아래)

## 검증
- `npm run dev`(WXT)로 익스텐션 로드, 1차 대상 앱 heureum(`~/Documents/Project/heureum`, React 19 + Vite + StyleX)을 `npm run dev`로 실행.
- 프레임워크 무관 확인: React가 없는 정적 HTML 페이지에서도 요소·텍스트·영역·네트워크 증거가 정상 기록되고 컴포넌트 항목만 빠지는지.
- 예전 메모장 사례를 그대로 재현:
  - #7 `/nodes` 무한 스켈레톤: 스켈레톤 요소 + 네트워크 첨부 → md에 `GET /api/nodes 200 {"items":[]}` 기록되는지
  - #12 대시보드 총합 vs 목록: 작성 중 상태로 route 이동하며 요소 A + 테이블 컨테이너 B 수집 → 헤더·보이는 행 수·컴포넌트 정보 확인
  - VM Agent 문구: 텍스트 드래그 → exact·prefix/suffix 기록
- 생성된 `.bugnotes/*.md`를 직접 열어 형식 확인, `git status`에 `.bugnotes/`가 안 잡히는지 확인.
- 대상 프로젝트에서 Claude Code `/bugnotes` → 목록, `/bugnotes 12` → 처리 후 `## 처리 기록` 추가, 이후 익스텐션에서 그 건을 수정해도 처리 기록이 보존되는지 확인.
- 보관 → md·assets가 `archive/`로 이동하고 `/bugnotes` 목록에서 빠지는지 확인.

## 남은 확인 사항 (구현 착수 시)
- (해결) 프로젝트 폴더: `~/Documents/Project/bugnotes`, 플랜은 `todo/bugnotes-design.md`.
- (해결) 1차 대상 앱: heureum.

## 구현 메모 (2026-10-16, 설계와 달라진 점)
- **스크린샷 권한**: `captureVisibleTab`은 localhost 사이트 권한만으로는 동작하지 않고 `activeTab` 또는 `<all_urls>`가 필요함을 확인. 범위(결정 15)를 지키기 위해 `activeTab` 사용 → 툴바 아이콘/`Alt+Shift+B`로 패널을 열면 그 탭에서 캡처 허용. 권한이 없으면 스크린샷 없이 담고 안내 토스트. E2E 빌드(`BUGNOTES_E2E=1`)에만 `<all_urls>`.
- **React 19 소스 위치**: `_debugStack`의 변환 코드 위치 → 모듈 인라인 소스맵으로 원본 줄 복원(`lib/sourcemap.ts`). heureum처럼 플러그인(StyleX)이 소스맵을 잇지 않으면 맵의 원본이 실제 파일과 달라 ~40줄 어긋남 → Vite `?raw`로 실제 파일과 대조, 다르면 요소의 식별 속성(aria-label, data-testid, 텍스트…)으로 `<tag` 시작 줄을 다시 찾음. 못 찾으면 "근처" 표시. heureum에서 `src/App.tsx:238`(실제 `<button` 줄) 확인.
- **네트워크 단축키**: 페이지에서 `Alt+Shift+N`으로도 바로 첨부.
- **폴더 연결 대체 경로**: 사이드 패널에서 `showDirectoryPicker`가 실패하면 `connect.html` 탭에서 고름(같은 익스텐션 origin이라 IndexedDB 핸들 공유). 실제 Chrome 사이드 패널에서의 동작은 수동 확인 필요.
- **검증**: 단위 테스트 31개(vitest), E2E 24개 체크(Playwright Chromium + 익스텐션 로드, fixture 페이지 + heureum) 통과.
- **담은 결과 표시 위치 변경 (사용자 요청)**: 페이지 위 문자 마커·"담았습니다" 토스트·모드 안내 토스트를 없애고 **사이드 패널에만** 표시. 페이지에는 고르는 동안의 hover 하이라이트·라벨과 경고(패널 미열림, 스크린샷 권한)만 남김. 패널 카드에 "선택한 요소" 박스(요소 이름 `<button "흐름">`, 컴포넌트·소스 위치, selector)와 오른쪽 위 ✕ 삭제 버튼, 방금 담은 카드 강조. 모드 안내는 패널 모드 버튼 아래에 표시. (UI 설계 A의 "마커" 항목은 폐기)
- **기록 삭제 추가 (사용자 요청)**: 목록(기록·보관함)의 [삭제], 작성 중 카드의 [기록 삭제]. 확인 창 후 md + `assets/<id>/` 삭제, IndexedDB 편집 원본도 삭제. 결정 12(보관은 이동, 삭제 안 함)는 유지하고 삭제는 별도 동작으로 둠.
- **버그 수정**: 요소 모드에서 클릭으로 담기가 동작하지 않던 문제. 앱 클릭을 막는 capture 리스너의 `stopImmediatePropagation`이 같은 단계의 담기 리스너까지 막았음 → 막는 핸들러 안에서 click 시 담도록 통합. E2E가 Enter로만 담고 "미분류" 글자 매칭이 안내문에 걸려 놓쳤던 것도 실제 클릭·카드 개수 확인으로 수정.
- **중복 담기 방지**: 같은 기록(또는 미분류)에 같은 route·selector의 요소(요소↔컨테이너 동일 취급), 같은 문구의 텍스트를 다시 담으면 추가하지 않고 기존 카드를 강조 + 안내.
- **카드에 페이지 표시**: "선택한 요소" 박스 위에 `페이지 /path?query#hash · 페이지 제목`. md에 `- 페이지 제목:` 추가.
- **붙여넣기 증거(kind: paste)**: 작성 중 카드의 붙여넣기 칸 ⌘V / 끌어다 놓기 / 패널 전역 ⌘V. 이미지는 폭 1600px 이하 PNG로 `assets/<id>/<문자>.png`, 텍스트는 5000자까지 코드 블록. clipboardRead 권한 없이 paste 이벤트만 사용.
- **#002 리허설(맥락 없는 에이전트) 결과 반영**: 영역 안에 보이던 글자 기록(`regionTexts`, 비밀번호 칸은 값 없이 표시), WORKFLOW 재처리 규칙(`### <일시> (재처리)`), frontmatter `updated:`, 증거 삭제·이동 시 A부터 다시 매기기, 메모 안내문 `현상/기대/제약`, WORKFLOW에 "기대가 판단 기준, 없으면 문서에서 찾고 어긋나면 사용자에게 묻기".
- **WORKFLOW 버전 관리 (사용자 선택: 갱신 버튼)**: WORKFLOW.md 첫 줄 `<!-- bugnotes-workflow vN -->`. 프로젝트 파일 버전이 낮으면 패널에 [업데이트] 버튼, 눌러야만 교체(확인 창). 폴더 재연결 시에도 기존 WORKFLOW.md는 덮어쓰지 않음. 프로젝트별 규칙은 `WORKFLOW.local.md`(익스텐션 불간섭).
- **이름 변경 BugNotes → PinProof (사용자 요청)**: 표시명·package·README·코드 식별자·데이터 폴더 `.pinproof/`·커맨드 `/pinproof`·WORKFLOW 마커 `pinproof-workflow`. 기존 `.bugnotes/`는 폴더 연결 시(확인 목록에 표시) 또는 패널 배너 [옮기기]로 `.pinproof/`에 복사(덮어쓰지 않음, 번호 겹치는 기록은 남기고 알림) → 모두 옮기면 `.bugnotes/`·옛 커맨드 삭제, `.gitignore` 블록 교체. manifest `key`로 확장 ID 고정(`cjhefepniacmcgnhmfheajiiehbbiclo`) — 폴더를 옮겨도 연결·작성 중 기록 유지. 웹스토어 업로드 시 key 제거 필요. 프로젝트 폴더 `~/Documents/Project/bugnotes` → `~/Documents/Project/pinproof`.
- **팀 저장소에 흔적 남기지 않기 (사용자 요청, 2026-10-19)**: 폴더 연결·옮기기 때 `.gitignore` 대신 `.git/info/exclude`에 `.pinproof/` 추가(공통 git 디렉터리라 모든 워크트리에 적용, `.pinproof` 줄이 이미 있으면 생략). 프로젝트에 `.claude/commands/pinproof.md`를 만들지 않고 `~/.claude/commands/`에 사용자가 한 번 설치(README). 이유: 팀 `.gitignore`에 `!.claude/commands/**` 같은 반전 규칙이 있으면 exclude로는 커맨드 파일을 숨길 수 없음. `.git`이 파일(워크트리)이면 exclude를 쓰지 않고 확인 목록에 안내. 옛 `.gitignore` 블록·프로젝트 커맨드는 팀 파일일 수 있어 지우지 않음.
- **Vibe Annotations 스타일 페이지 위 UI (사용자 요청, 2026-10-19)**: 179줄의 "담은 결과는 사이드 패널에만" 결정을 **뒤집음**. 사이드 패널이 열려 있는 동안 페이지 오른쪽 위에 드래그 가능한 플로팅 툴바(요소·텍스트·영역·네트워크·마커 숨기기·기록 칩, 위치는 origin별 `chrome.storage.local`), 고르면 그 자리에 메모 팝오버(Enter 담기·Esc 취소), 담은 증거는 요소 위 테두리에 연두 A·B·C 마커(미분류는 회색 점, hover 메모 툴팁은 위로, 클릭은 편집 팝오버). 패널과 content script는 `chrome.tabs.connect` 포트로 이어 패널이 닫히면 툴바·마커를 거둠. 패널의 모드 버튼은 툴바로 옮기고 증거 카드는 한 줄 목록+펼치기. 화이트 바탕 + 그린·연두만, 다크 모드 제거. 모션은 순간마다 1회(핀 꽂힘·로고 튐·칩 숫자 밀림·목록 클릭 펄스), 계속 도는 것은 모드 중 핀 로고 숨쉬기 하나. 익스텐션 아이콘(그린 핀+연두 원+체크) 추가. 계획·결정 기록: [plan-vibe-style-ui.md](plan-vibe-style-ui.md)
- **아이콘을 압정으로 (사용자 요청, 2026-10-19)**: 지도 핀(GPS 위치 표시처럼 보임) → 메모를 꽂는 압정. 그린 머리·받침 + 연두 몸통 + 짙은 바늘, 45° 기울임. 익스텐션 아이콘·툴바 로고·패널 로고 모두 같은 모양, 모드 중 숨쉬기는 연두 몸통.
- **메인 색을 하늘색·남색으로 (사용자 요청, 2026-10-19)**: 화이트 + 남색(#1e3a8a, 주 버튼·선택·하이라이트 테두리·라벨) + 하늘색(#38bdf8, 마커·채움·기록 칩, 위 글자 #0b1b3f). 초록·연두는 쓰지 않음. 빨강·주황은 오류·경고에만. CSS 변수 이름도 --navy/--sky 로. 압정 아이콘은 머리·몸통·받침을 한 실루엣으로 합치고 머리(하늘색) → 받침(남색) 은은한 그라데이션(사용자 요청), 모드 중 숨쉬기는 실루엣 전체.
- **다크 모드 (사용자 요청, 2026-10-19)**: grilling 결정 2("화이트 고정")를 바꿈. 기본은 시스템 설정(prefers-color-scheme), 패널 머리 줄의 테마 버튼으로 시스템 → 라이트 → 다크(`chrome.storage.local` `theme`, `lib/theme.ts`). 패널은 `html[data-theme]`, 페이지 오버레이는 host 의 `data-theme`. 다크 토큰(사용자 선택 "딥 네이비 + 시안", 처음 안이 탁하다는 피드백 반영): 바탕 #081430, 면 #0d1d40, 주색 #2f7bff(남색 위 글자는 `--on-navy` 흰색), 하늘색 #4cc9ff, 하늘색 옅은 바탕 위 글자 `--on-sky-soft` #8fdcff(라이트는 #0b1b3f), 압정 받침 `--pin-bottom` #2f7bff·바늘 `--pin-needle` #a9c0e4.
- **배포 주소에서 쓰기 (사용자 요청, 2026-10-19)**: 스토어 없이 사이트별로 켠다. `optional_host_permissions`(http/https 전체) + 패널의 [이 사이트에서 켜기]로 그 사이트 패턴(`http://호스트/*`, 포트 무관)만 권한 요청 → 백그라운드가 켠 사이트에 선택 도구·네트워크 기록 스크립트를 `scripting.registerContentScripts`로 등록(localhost 는 manifest 고정이라 `excludeMatches`로 제외) → 탭 새로고침. 배포 주소도 로컬 폴더에 연결(origin → 폴더). 기록 md `env: local | deployed`, WORKFLOW v4 에 배포 기록 규칙. 계획: [plan-site-permission.md](plan-site-permission.md)
- **이슈 → 카테고리 + 항목별 완료 (사용자 요청, 2026-10-20)**: "기록 1건 = 이슈(증거 A·B·C)"를 "카테고리 안에 번호 붙은 항목이 쌓이고, 항목마다 완료 여부를 갖는" 구조로 바꿈. 항목 1개 = md 1개(`.pinproof/items/013.md`, 스크린샷 `items/assets/013.png`), 카테고리는 frontmatter `category`와 `categories.json`, 상태는 `status: 대기|완료`, 프롬프트로 넘긴 시각은 `sent`. 번호는 옛 기록까지 포함한 폴더 전체의 최대값 + 1, 마커·패널은 숫자 알약. 에이전트가 `status: 완료`로 바꾸면 패널이 5초 주기 확인에서 `items/archive/`로 바로 옮기고, 보관함 [되돌리기]는 `대기`로 되돌림. 카테고리째 [프롬프트 복사]는 아직 넘기지 않은 대기 항목 파일만 하나하나 적어 "어디까지 넘겼는지" 기억할 필요를 없앰. 유형(버그·수정 요청·확인 요청)은 사용 내역(5·1·0)상 의미가 없어 항목에서 제거, 미분류는 기본 카테고리로 합침(브라우저에만 있던 미분류 증거는 처음 열 때 미분류 항목으로 이전). 옛 기록은 "이전 기록"에서 읽기 전용(복사·보관·삭제), WORKFLOW v5 는 항목·카테고리 처리와 옛 형식을 모두 다룸. 계획: [plan-category-items.md](plan-category-items.md)
- **무채색 UI (사용자 요청, 2026-10-20)**: "메인 색 하늘색·남색"과 "다크 모드 딥 네이비 + 시안"의 색 결정을 **뒤집음**(다크 모드 자체·테마 버튼은 유지). `heureum/design-system/DESIGN.md`를 따라 색을 `--paper-rgb`·`--surface-rgb`·`--ink-rgb` 세 축에서만 파생(`lib/tokens.css`, 패널·연결 탭은 `:root`, 오버레이는 `?raw`로 받아 `:host`). 빨강·주황도 없앰: HTTP 오류는 반전 배지, 경고는 굵은 글자 + "!"(`role="alert"`), 삭제 hover는 밑줄·진한 바탕, 권한 확인 점은 테두리만 있는 원. 호스트 페이지 바탕을 모르므로 하이라이트·마커·스크린샷 강조 테두리는 잉크 + 종이 두 겹. 글자는 본문 13px 유지(DESIGN은 15px — 패널 폭 때문), 주 버튼·툴바 버튼만 36px(DESIGN은 44px — 마우스 UI라서). 폰트는 패널·연결 탭만 Paperlogy(400–800, `public/fonts`, 사용 글자 범위만 `FontFace` 등록), 오버레이는 Shadow DOM이라 Pretendard·시스템 대체 폰트. 아이콘은 같은 압정 실루엣을 잉크 단색(#111112) + 흰 테두리로. 계획: [plan-mono-ui.md](plan-mono-ui.md)
- **티켓 디자인 시험 (사용자 요청, 2026-10-20)**: 모서리를 전부 2px(`lib/tokens.css`의 radius 토큰 네 개, DESIGN 원래 값은 주석에). 카테고리 상자를 티켓으로 — 머리(카테고리 이름 15px 800, "담는 중"은 테두리 도장)가 잘려 나가는 윗부분, 점선 절취선 양 끝에 반원 홈, 아래 항목 목록이 몸통. 아코디언 세모(▸▾)와 `<details>` 기본 세모는 chevron(접힘=아래, 펼침=위로 회전), 카테고리 선택 앞 "담을 곳" 글자는 바구니 아이콘(`aria-label`·`title`은 "담을 곳" 유지). 아이콘 모양은 Lucide(ISC).
- **카테고리 드롭다운 (사용자 요청, 2026-10-20)**: 네이티브 `<select>`와 바 오른쪽 "이름 바꾸기·삭제" 링크를 직접 만든 드롭다운 하나로. 줄마다 고르기(✓ 표시) · 연필(이름 바꾸기) · 휴지통(삭제, 확인 창 없음 — 대기 항목이 있으면 지우지 않고 안내), 맨 아래 + 새 카테고리. 이름 바꾸기·새로 만들기는 목록 안에서 그 줄이 입력칸으로 바뀜. ↑↓·Esc(닫으면 드롭다운 버튼으로 포커스)·바깥 클릭으로 닫힘. 항목이 없는 카테고리의 프롬프트 복사는 꺼짐 — 꺼진 버튼은 채움 없이 옅은 테두리, hover·눌림 효과 없음. 붙여넣기 칸 문구는 "여기를 클릭하고 / 스크린샷·텍스트 [Cmd] + [V] / · / 이미지 드래그 앤 드롭"(키는 키 모양 상자).
- **삭제 확인 (사용자 요청, 2026-10-20)**: 카테고리 휴지통 — 빈 카테고리는 묻지 않고 지움, 대기 항목이 있으면(다른 주소에서 담은 것 포함) "카테고리와 대기 항목 N개를 삭제할까요?" 한 번 묻고 확인하면 그 항목(md·스크린샷·편집용 원본)까지 지움. 보관함 항목은 남김. 앞의 "대기 항목이 있으면 지우지 않음"을 바꿈. 패널 목록의 ✕(대기 항목)도 한 번 확인(보관함 항목은 원래 확인). 페이지 위 편집 팝오버의 삭제는 확인 창이 패널에 떠 흐름이 끊겨 묻지 않음.
- **전체 삭제 · 카테고리 삭제 늘 확인 (사용자 요청, 2026-10-26)**: 보관함이 끝없이 쌓여 이력 관리가 어려워, 펼친 보관함 안에 [보관함 비우기], 이전 기록 안에 [이전 기록 모두 삭제](보관한 기록 포함)를 둠. 둘 다 구역 머리 오른쪽 끝의 버튼(`.btn`, 접혀 있어도 보임)이고 개수를 넣어 한 번 묻는다. 접힌 구역 세 개(보관함 · 다른 주소 항목 · 이전 기록) 모두 개수는 제목 바로 오른쪽. 카테고리 휴지통은 빈 카테고리도 "카테고리를 삭제할까요?" 한 번 묻도록 바꿈(앞의 "빈 카테고리는 묻지 않음"을 바꿈). 모두 지우면 다음 번호가 남은 것 중 최대값 + 1 로 내려간다(한 건 삭제와 같은 동작)
