# 네트워크 담기

사용자가 페이지 툴바의 [네트워크]를 누르면, 지금 route 에 들어온 뒤 보낸 API 호출 목록(상태 · 시간 · 크기 · 응답 앞 500자)이 지금 카테고리의 항목 하나로 담긴다. 페이지 위 마커가 없는 항목이라 패널의 번호 원은 테두리만 있다.

## Sub-features

- `network-capture`: [네트워크]로 지금 방문의 호출 목록을 항목으로 담는다
- `network-status`: 200 응답은 본문 앞부분을, 403 같은 실패 응답은 상태를 기록한다
- `network-no-marker`: 패널의 번호 원이 테두리만 있다(페이지 마커 없음)
- `network-visit`: 경로 · 쿼리 · 해시 중 하나라도 바뀌면 새 방문이다. 같은 화면에 다시 들어오면 앞선 방문의 호출은 빠지고, `?tab=one` 과 `?tab=two` 의 호출은 따로 담긴다(여정이 아직 다루지 않음)

## How to get to it (user POV)

- 페이지 툴바의 [네트워크] 버튼
- 페이지에서 `Alt+Shift+N`
- 요소 · 텍스트 · 영역 모드 중 안내 띠의 모드 이름을 눌러 연 메뉴에서 네트워크

## Driving it with verify-pinproof harness

Preconditions:

- `launch()` 직후 `connect()` 로 폴더가 연결되어 있다.
- 담을 페이지의 요청이 모두 응답을 받았다. fixture 의 `/nodes` 는 로드할 때 `/api/nodes`(200)와 `/api/forbidden`(403)을 보낸다.

- **페이지 열기.** `/nodes` 로 가면서 두 응답을 기다린다. `const res = Promise.all([h.app.waitForResponse((r) => new URL(r.url()).pathname === '/api/nodes'), h.app.waitForResponse((r) => new URL(r.url()).pathname === '/api/forbidden')]); await h.app.goto(\`${h.base}/nodes\`); await res;` 노드 표(`#node-table`)와 툴바(`h.toolbar.root`)가 보인다.
- **담기.** [네트워크]를 누른다. `await h.toolbar.network.click()`. 패널에 `.cat.current .ev.network` 줄이 생기고, 그 줄의 `.num` 에 항목 번호가 있으며 `.num.outline` 이다.
- **저장 확인.** 번호로 파일을 기다린다. `await h.waitOpfs(\`.pinproof/items/${num.padStart(3, '0')}.md\`, (t) => t.includes('## 네트워크') && t.includes('node-a') && t.includes('→ 403'))`. md 에 `kind: 네트워크`, `status: 대기`, 두 호출이 있다.
- **경고 없음.** `(await h.notices()).filter((t) => t.includes('저장 실패'))` 가 비어 있다.
- **증거.** 담기 전과 후에 `h.snap()` 을 찍는다. `close()` 가 `opfs/.pinproof/items/<번호>.md` 를 남긴다.

이 순서는 `scripts/journeys/network-capture.mjs` 에 그대로 있고, 그 여정은 통과했다.

## Gotchas

- 응답이 끝난 요청만 담긴다. 페이지가 기다리지 않는 요청(fixture 의 403)도 있으므로, 표가 보였다고 바로 누르지 말고 두 응답을 먼저 기다린다.
- md 저장은 패널 줄이 생긴 뒤에 끝난다. 줄을 본 직후 `readOpfs` 하면 비어 있을 수 있어 `waitOpfs` 를 쓴다.
- 항목 번호는 폴더 전체에서 이어진다. 파일 이름은 고정하지 말고 그 줄의 `.num` 에서 읽는다.
- 요청 헤더와 쿠키는 기록하지 않는다. 그것이 없다고 실패로 보지 않는다.
- `network-visit`(같은 route 재진입)은 fixture 에 SPA 이동이 없어 이 여정으로는 볼 수 없다. 확인하려면 `h.app.evaluate(() => history.pushState(null, '', '/x'))` 로 이동을 만든 여정을 따로 쓴다.
