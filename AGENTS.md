# PinProof

개발 중인 웹 화면에서 AI 에이전트가 놓친 UI·UX 디테일, 데이터 정합성, 버그를 증거(요소·영역·텍스트·네트워크·스크린샷)와 함께 카테고리별로 기록하고, AI 에이전트가 이슈 단위로 묶어 처리한 뒤 아카이빙하는 도구입니다.

## 저장소 구성

모노레포(npm workspaces)로 Chrome 확장프로그램과 웹사이트를 함께 관리합니다.

| 경로 | 역할 |
| --- | --- |
| `apps/extension` | WXT + React 19 + TypeScript 기반 PinProof Chrome 확장프로그램 |
| `apps/web` | PinProof 온보딩 페이지 및 아카이브 히스토리 대시보드·관리 웹사이트 (React 19 · Vite · TanStack Router/Query · Tailwind CSS v4 · FSD) |
| `packages/shared` | `.pinproof/` 도메인 타입, 마크다운 파서·렌더러, 무채색 디자인 토큰(`tokens.css`), `Paperlogy` 폰트 자산 |

## 실행과 검증

```bash
npm install                   # 전체 워크스페이스 의존성 설치
npm run dev:web               # 웹사이트 개발 서버 (Vite)
npm run dev:ext               # 크롬 확장프로그램 개발 모드 (WXT)
npm run build:web             # 웹사이트 프로덕션 빌드
npm run build:ext             # 크롬 확장프로그램 빌드
npm run compile               # 전체 타입 검사
npm test                      # 전체 단위 테스트 (Vitest)
```

<!-- webapp@dev-goraebap:start -->
## 개발 지침

이 프로젝트는 Webapp 플러그인(0.15.3 이상)의 지침을 따릅니다. 작업을 시작할 때 goraebap-mode를 읽고, 바꾸는 영역의 지침(frontend·ui-ux·backend·api·database·architecture)을 함께 읽습니다. 아래 프로젝트 규칙이 지침과 다르면 프로젝트 규칙을 따릅니다. Webapp 지침을 읽을 수 없거나 설치된 버전이 위 버전보다 낮으면 추측으로 진행하지 않습니다. 작업 상태를 이어받기 문서로 남기고, 플러그인 설치·갱신 방법과 새 세션에서 읽을 문서 경로를 사용자에게 알립니다.

- Webapp 어댑터: cowork
<!-- webapp@dev-goraebap:end -->

## 프로젝트 규칙

| 지침 | 지침의 기준 | 이 프로젝트 | 이유 |
| --- | --- | --- | --- |
| ui-ux (글꼴) | 고딕(Pretendard)·고정폭(JetBrains Mono) | `Paperlogy`(오프라인 woff2 포함)를 기본 산세리프 글꼴로 사용 | 확장프로그램과 웹사이트의 브랜드 타이포그래피 일관성 유지 |
| ui-ux (테마와 색상) | 기본 시맨틱 팔레트 | `packages/shared/tokens.css` 기반 무채색 잉크(`--ink-rgb`)·종이(`--paper-rgb`)·면(`--surface-rgb`) 축만 사용 | PinProof의 흑백 티켓 미학과 라이트·다크 대비 원칙 유지 |
| ui-ux (면과 경계) | 컴포넌트별 둥근 모서리 | 모든 카드·버튼·입력·배지 모서리를 `2px` 티켓 감각으로 통일 | 확장프로그램 사이드 패널의 티켓 UI 정체성 계승 |
| ui-ux (모션·배경) | 장식 배경 지양 | 온보딩 페이지 배경에 불투명(matte/frosted) 질감의 살아 움직이는 무채색 배경 그래픽을 허용 (`prefers-reduced-motion` 존중) | 제품 소개 페이지의 시각적 몰입감과 브랜드 개성 표현 |
| architecture (데이터 소유) | 백엔드 API + DB | `apps/web`은 별도 백엔드 없이 순수 SPA + File System Access API로 로컬 `.pinproof/` 폴더를 직접 읽고 관리 (샘플 데이터 체험 모드 병행) | 외부로 데이터를 전송하지 않는 PinProof의 로컬 퍼스트 철학 유지 |
