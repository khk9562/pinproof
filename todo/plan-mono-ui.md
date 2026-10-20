# 무채색 UI 개편 방안

> 2026-10-20 · 근거: `heureum/design-system/DESIGN.md`(흐름의 무채색 디자인 시스템)
> 상태: **구현함** (2026-10-20, 결정 5개 모두 추천안대로)

## 목표

pinproof의 사이드 패널·페이지 위 오버레이(툴바·팝오버·마커)·연결 탭·아이콘을 잉크(ink)와 종이(paper) 두 색의 농도로만 그린다.
지금의 하늘색·남색(라이트)과 딥 네이비·시안(다크)을 걷어내고, 색을 `--paper-rgb` `--surface-rgb` `--ink-rgb` 세 축에서만 파생시킨다.

완료 기준
- 패널·오버레이·연결 탭의 CSS에 hex 색이 축 변수 정의 말고는 없다
- 시스템 → 라이트 → 다크 테마 버튼(`lib/theme.ts`)은 그대로 동작하고, 세 축 값만 바뀐다
- 밝은 호스트 페이지와 어두운 호스트 페이지 모두에서 하이라이트·마커가 보인다
- 기능·md 출력 형식·단축키는 바뀌지 않는다

## 현재 상태 (코드 확인)

| 위치 | 색 정의 방식 | 비고 |
|---|---|---|
| `entrypoints/sidepanel/style.css` | `:root` 변수 21개 + 다크 블록 2벌(미디어쿼리·`data-theme`) | 규칙에서 `var(--…)` 100회 사용. hex 직접 사용은 거의 없음 |
| `entrypoints/picker.content/style.ts` | `:host` 변수, 같은 값을 한 벌 더 복사 | 패널과 값이 중복돼 따로 고쳐야 함 |
| `entrypoints/connect/index.html` | 인라인 hex(`#1e3a8a` 등) + 다크 미디어쿼리 | |
| `entrypoints/picker.content/icons.ts:11`, `entrypoints/sidepanel/App.tsx:100` | 로고 그라데이션 `#38bdf8` | |
| `entrypoints/picker.content/index.ts:604` | 스크린샷 강조 테두리 `#1e3a8a` | md 첨부 이미지에 그려짐 |
| `assets/icon/pin.svg`·`pin-16.svg`, `public/icon/*.png` | 하늘색→남색 그라데이션 압정 | |
| `tests/e2e/run.mjs:631-642` | 패널 배경 `rgb(8, 20, 48)` / `rgb(255, 255, 255)` 검사 | 값 갱신 필요 |

변수 이름이 이미 역할 중심(`--bg` `--surface` `--text-2` …)이라, 규칙(셀렉터)은 대부분 그대로 두고 **토큰 층만 바꾸면** 된다.

## 방안

### 1. 토큰 한 곳으로 모으기
- 새 파일 `lib/tokens.css`에 DESIGN.md 2.1의 축 변수(다크·라이트·시스템) + 8장의 역할 토큰을 둔다. 셀렉터는 `:root, :host`로 써서 패널과 Shadow DOM 둘 다에 맞게.
  - 테마 선택자: 패널은 `html[data-theme]`, 오버레이는 `:host([data-theme])` — 지금 구조(`applyTheme`) 그대로.
- 패널은 `style.css`에서 `@import`, 오버레이는 `import TOKENS_CSS from '@/lib/tokens.css?raw'`로(`?inline`은 content script 빌드에서 실패) 문자열을 받아 `OVERLAY_CSS` 앞에 붙인다. 값 중복(지금 2벌 × 라이트·다크) 제거.
- 기존 이름 → 역할 토큰 대응 (규칙은 그대로, 이름만 일괄 치환)

| 지금 | 새 토큰 | 값 |
|---|---|---|
| `--bg` | `--color-bg` | paper |
| `--surface` | `--color-surface` | surface |
| `--surface-2` | `--color-wash` | ink 0.07 |
| `--border` | `--color-line` | ink 0.18 |
| `--text` | `--color-ink` | ink |
| `--text-2` | `--color-ink-soft` | ink 0.66 |
| `--text-3` | `--color-ink-faint` | ink 0.44 |
| `--navy` (주 버튼·포커스·선택 테두리) | `--color-ink` | ink |
| `--navy-strong` (hover) | 없앰 → 주 버튼 hover는 투명도 0.88 | |
| `--navy-soft` (선택 바탕·포커스 링) | `--color-wash` / 포커스 링은 없앰(아래 4) | |
| `--sky` (번호 배지·마커 채움) | `--color-ink` | |
| `--sky-soft` (하이라이트 채움·기록 칩) | `--color-wash-strong` | ink 0.13 |
| `--on-sky` `--on-navy` | `--color-inverse` | paper |
| `--gray-dot` (미분류) | `--color-ink-faint` | |
| `--red` `--amber` | 결정 1 참고 | |

### 2. 화면별 바꿀 점
- **사이드 패널**
  - 주 버튼: ink 바탕 + inverse 글자, 화면당 하나. 나머지 `.btn`은 테두리 `line` → hover `wash`.
  - 담는 중인 카테고리(`.cat.current`): 남색 테두리+글로우 → `1.5px ink` 테두리 + `surface` 바탕, 글로우 없음.
  - 번호 배지 `.num`: ink 채움 + inverse 글자. `.num.outline`(페이지 마커 없는 증거)은 `lineStrong` 테두리만.
  - 꼬리표 `.tag.sent`·`.badge-draft`: `washStrong` 바탕 + ink 글자로 농도 차이만.
  - 연결 상태 점: 허용 = ink 채운 원, 확인 필요 = 테두리만 있는 원(색 대신 모양).
- **페이지 위 오버레이** — 호스트 페이지 바탕을 모르므로 **두 겹 선**을 쓴다
  - 고르는 중 하이라이트·선택 상자: `2px ink` 테두리 + 바깥 `1px paper` 링(box-shadow) + 채움 `ink 0.07`. 밝은·어두운 페이지 모두에서 보임.
  - 마커: ink 원 + inverse 글자 + `2px paper` 링 + 그림자. 임시 마커는 paper 원 + `1.5px ink` 테두리, 미분류는 `inkFaint` 점.
  - 툴바·팝오버·메뉴: `surface` 바탕 + `1px line` + DESIGN 그림자(`0 30px 70px -30px rgb(0 0 0 / .6)`), 카드 radius 10.
  - 기록 칩 `.rec`, 팝오버 머리 `.p-to`: `washStrong` 바탕.
- **연결 탭** `connect/index.html`: `lib/tokens.css`를 링크하고 버튼을 주 버튼 규칙으로.
- **스크린샷 강조 테두리** (`index.ts:604`): 남색 단색 → 검정 2px 안 + 흰 1px 바깥 두 겹. 이후 md 첨부 이미지 색이 바뀜(의도된 변경).
- **아이콘**: 압정 실루엣은 그대로, 채움을 그라데이션 → 단색 ink(`#111112`) + 흰 테두리(크롬 다크 툴바용). 패널·툴바 로고는 `fill: currentColor`로 테마를 따라감. PNG 4종 다시 뽑기.

### 3. 움직임 (DESIGN 5)
- `--t: .15s ease` → `--dur-tap: 140ms` + `--ease-out`.
- 팝오버·메뉴 등장 0.2s → `quick` 260ms, 툴바 모드 변신 폭 0.3s → `quick`, 마커 꽂힘 0.32s → `quick` + `ease-spring`.
- 모드 중 로고 숨쉬기: 지금 1.2s alternate → DESIGN의 "진행 중" 표시 규칙(1.2초, 투명도 1 → 0.3 → 1)으로.
- 눌림: 버튼 `scale(.96)`, 아이콘 버튼 `scale(.92)`, 주 버튼 `scale(.97)` 추가.
- `prefers-reduced-motion`은 지금처럼 끔(DESIGN은 0.01ms — 같은 효과라 지금 방식 유지).

### 4. 포커스·모서리
- 포커스: `:focus-visible`에서만 `2px solid ink`(안쪽 -2px, 주 버튼 +3px). 입력칸 focus의 남색 글로우(`box-shadow 0 0 0 3px navy-soft`)는 없애고 테두리만 ink.
- 모서리: `--radius-l 12px` → `10px`(카드), `--radius 8px` 유지(입력), `--radius-s 6px` → 표·셀 성격은 `3px`, 작은 버튼은 pill.

### 5. 글자·크기 (결정 2·3 참고)

## 결정 (2026-10-20, 다섯 개 모두 추천안대로)

1. **빨강·주황까지 없앨지** — 지금 HTTP 오류 배지(`.code-bad`)·네트워크 실패(`.net-row .bad`)·삭제 hover·경고 토스트·권한 확인 점이 빨강/주황.
   - 추천: **없앤다**(DESIGN 원칙 1·6장 "빨간색을 쓰지 않는다"). 오류 배지는 ink 반전(검정 바탕 흰 글자), 실패 줄은 ink 600, 경고 토스트는 반전 토스트 + `role="alert"`, 삭제 hover는 `washStrong`.
2. **글자 크기** — DESIGN은 body 15 / small 12.5 / label 10.5 / title 22, pinproof 패널은 13 / 12 / 11 촘촘한 구성.
   - 추천: **역할 토큰은 들이되 패널 본문은 13 유지**. 사이드 패널 폭(약 360px)에서 15px는 한 줄 목록이 많이 잘림. small 12.5·label 10.5(섹션 머리)·tabular-nums는 그대로 적용.
3. **누르는 크기 44px** — DESIGN은 휴대폰 앱 기준. pinproof는 마우스로 쓰는 데스크톱 익스텐션이고 목록 줄이 32px.
   - 추천: **주 버튼·툴바 버튼만 36px로 키우고, 목록 줄·링크형 버튼은 지금 높이 유지**.
4. **폰트(Paperlogy)** — 패널은 확장 안에 woff2를 넣어 쓸 수 있지만, 오버레이는 Shadow DOM 안에서 `@font-face`가 안 먹어 호스트 문서에 등록해야 함(페이지 오염·`web_accessible_resources` 필요).
   - 추천: **패널·연결 탭만 Paperlogy(사용 글자 범위만 `unicode-range`로 번들), 오버레이는 `'Pretendard', system-ui …` 대체 스택**. 원격 CDN은 쓰지 않음(오프라인·개인정보).
5. **기본 테마** — DESIGN은 다크 기본, pinproof는 시스템 설정 기본.
   - 추천: **시스템 설정 기본 유지**(지금 테마 버튼과 E2E 흐름 그대로).

## 단계별 작업 (결정 뒤)

- [x] 1. `lib/tokens.css` 추가, 패널 `style.css`·오버레이 `style.ts`의 변수 블록을 이것으로 교체, 이름 일괄 치환
- [x] 2. 패널 규칙 손보기(주 버튼·현재 카테고리·배지·꼬리표·연결 점·포커스)
- [x] 3. 오버레이 규칙 손보기(두 겹 하이라이트·마커·툴바·팝오버·칩)
- [x] 4. 하드코딩 색 정리: `connect/index.html`, `icons.ts`, `App.tsx` 로고, `index.ts:604` 스크린샷 테두리
- [x] 5. 아이콘 SVG 단색화 + PNG 16·32·48·128 다시 뽑기
- [x] 6. 움직임 토큰·눌림 효과
- [x] 7. (결정 4에 따라) 폰트
- [x] 8. 검증: `npm test` · `npm run compile` · `npm run build` · E2E(패널 배경 값 `run.mjs:631-642` 갱신) + 밝은·어두운 호스트 페이지에서 라이트·다크 오버레이 스크린샷 4장 확인
- [x] 9. 문서: `todo/pinproof-design.md`에 "메인 색 하늘색·남색"(191줄)·"다크 모드 딥 네이비+시안"(192줄) 결정을 뒤집는다고 기록, README 색 설명

## 주의사항

- **오버레이 대비**: 오버레이 테마는 사용자 설정을 따르고 호스트 페이지 색과 무관 → 단색 선 하나는 같은 계열 바탕에서 사라짐. 하이라이트·마커는 반드시 ink + paper 두 겹.
- **반투명 채움**: 하이라이트 채움을 너무 진하게 하면 고르는 요소의 색을 덮어 확인이 어려움 → `ink 0.07` 이하.
- **md 형식 불변**: 색 변경은 화면과 스크린샷 테두리에만. `lib/markdown.ts`는 건드리지 않음.
- **회귀 범위**: 셀렉터·클래스 이름은 그대로 두므로 E2E의 클래스 검사는 영향 없음. 색 값 검사(631-642줄)만 갱신.
