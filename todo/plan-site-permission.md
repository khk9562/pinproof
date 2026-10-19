# 배포 주소에서도 쓰기 (사이트별 켜기) 계획

> 2026-10-19 · 브랜치 `feat/site-permission` · 사용자 결정: "B(사이트별 켜기)로, 배포본을 원하는 로컬 프로젝트에 매핑"

## 목표

`http://192.168.0.92:20100/` 같은 배포 주소에서도 PinProof를 쓰고, 기록은 로컬 프로젝트 폴더(예: `sc-cloud-ocp`)에 쌓아 로컬 에이전트가 처리하게 한다. 스토어 배포 없이 개발자 모드 그대로.

완료 기준
- localhost 가 아닌 http/https 탭에서 패널을 열면 **[이 사이트에서 PinProof 켜기]** 가 보이고, 누르면 Chrome 권한 확인 → 허용하면 그 탭을 새로고침해 툴바·마커·네트워크 기록이 동작한다
- 그 주소를 로컬 폴더에 연결할 수 있고 패널에 `192.168.0.92:20100 → sc-cloud-ocp` 로 보인다
- 패널에서 그 사이트를 끌 수 있다(권한 회수 + 새로고침)
- 배포 주소에서 담은 기록 md 에 `env: deployed`, 처리 절차(WORKFLOW v4)는 배포 기록의 주의점을 안내한다
- localhost 동작은 그대로(스크립트가 두 번 들어가지 않음)

## 작업

- [x] `wxt.config.ts`: `optional_host_permissions: ['http://*/*', 'https://*/*']`, `scripting` 권한
- [x] `entrypoints/background.ts`: 켜진 사이트(권한이 있는 origin)에 선택 도구·네트워크 기록 스크립트를 `chrome.scripting.registerContentScripts` 로 등록. 시작할 때와 권한이 바뀔 때 다시 맞춤. localhost·127.0.0.1 은 manifest 에 이미 있으니 `excludeMatches` 로 제외
- [x] `lib/connect.ts`: 로컬 판단은 기존 `isSupportedUrl` 그대로, 고정 주소 목록 `LOCAL_PATTERNS`와 사이트 권한 패턴 `sitePattern(url)` 추가
- [x] `entrypoints/sidepanel/usePinProof.ts`·`App.tsx`: 지원 판단 = 로컬이거나 켜진 사이트. 켜기(권한 요청 + 새로고침)·끄기(권한 회수 + 새로고침)
- [x] `lib/markdown.ts`: frontmatter `env: local | deployed`. `lib/templates.ts`: WORKFLOW v4 — 배포 기록이면 소스 위치 대신 화면 글자·selector 로 찾고, 배포 버전과 로컬 코드가 다를 수 있음을 먼저 확인
- [x] E2E: `--host-resolver-rules` 로 `deploy.test` → 127.0.0.1 을 만들어 비로컬 주소에서 툴바·담기·`env: deployed` 확인, localhost 에서 스크립트가 한 번만 들어가는지 확인
- [x] README·설계 문서

## 주의사항

- 권한 요청(`chrome.permissions.request`)은 사용자 클릭 안에서만 된다 → 패널 버튼에서 바로 부른다
- 네트워크 기록 스크립트는 `document_start` 에 들어가야 첫 API 호출부터 잡힌다 → 켠 직후 탭을 새로고침
- 배포 빌드는 소스맵·React 개발 정보가 없어 소스 위치·컴포넌트 이름이 비거나 압축될 수 있다(요소·텍스트·스크린샷·네트워크는 동작)
- 편집용 원본(IndexedDB)은 앱 주소별이라, 배포 주소에서 만든 기록은 배포 주소 탭에서 다시 열어 편집한다
- E2E 빌드는 `<all_urls>` 권한이 있어 켜기 버튼(권한 확인 창) 자체는 자동화하지 못한다 → 버튼은 화면 확인으로

## 검증 (2026-10-19)

- 단위 36 · E2E 83 · 빌드 통과. E2E 는 `deploy.test`(→127.0.0.1)로 비로컬 주소에서 툴바·폴더 연결·담기·네트워크·`env: deployed` 확인
- **미확인**: 실제 Chrome 에서 [켜기] 버튼의 권한 확인 창 → 허용 → 새로고침 흐름, 실제 배포 주소(192.168.0.92:20100)
