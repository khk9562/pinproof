# 요소 · 텍스트 · 영역 담기

사용자가 페이지 툴바에서 모드를 고르고 요소를 클릭하거나, 글자를 드래그하거나, 사각형을 그리면 그 자리에 팝오버가 뜬다. 한 줄 메모를 쓰고 Enter 를 누르면 지금 카테고리에 번호 붙은 항목으로 담기고, 요소 위에 그 번호 마커가 꽂힌다.

## Sub-features

- `capture-element`: [요소] 모드에서 클릭하면 팝오버가 뜨고, Enter 로 담긴다
- `capture-keyboard`: 요소 모드에서 `↑` 부모, `↓` 자식으로 옮겨 고른다
- `capture-text`: [텍스트] 모드에서 글자를 드래그해 담는다
- `capture-region`: [영역] 모드에서 사각형을 그려 담는다
- `capture-marker`: 담은 요소 위에 번호 마커가 보이고, 쿼리만 바뀐 화면에서는 숨는다
- `capture-delete`: 패널 줄의 ✕ 로 항목과 md 를 지운다(확인 창)

## How to get to it (user POV)

- 페이지 툴바의 [요소] · [텍스트] · [영역] 버튼
- 페이지에서 `Alt+Shift+E` · `Alt+Shift+T` · `Alt+Shift+R`, 모드 끝내기는 `Esc`
- 모드 중 안내 띠의 모드 이름을 눌러 연 메뉴에서 다른 모드로 바꾸기
- 패널 항목 줄 오른쪽의 ✕(삭제)

## Driving it with verify-pinproof harness

Preconditions:

- `connect()` 로 폴더가 연결되어 있고 `/dashboard` 에 있다(launch 의 기본 시작 경로).

- **요소 담기.** `await h.toolbar.element.click(); await h.app.hover('#help'); await h.app.click('#help'); await h.confirmPopover('메모')`. `h.rows()` 가 1개가 되고, `await h.pins()` 가 `['1']` 이다. 팝오버는 실제 마우스 클릭이어야 뜬다.
- **키보드로 고르기.** `await h.app.hover('[data-testid="summary-total"]'); await h.app.keyboard.press('ArrowUp'); await h.app.keyboard.press('ArrowDown'); await h.app.keyboard.press('Enter')`. 팝오버 머리(`h.popover.locator('.p-name')`)에 `<strong>` 이 보인다. `confirmPopover('총합이 다름')` 뒤 패널의 `.ev.fresh` 줄에 `.target-name` 이 `<strong>`, `.target-sel` 이 `[data-testid="summary-total"]`, `.memo` 가 메모다.
- **텍스트 담기.** `await h.toolbar.text.click()` 뒤 글자를 드래그한다. run.mjs 는 `#help` 의 앞 20자에 Range 를 걸고 `mouseup` 을 보내는 대역으로 조작한다(`// ---------- 텍스트 ----------`). `confirmPopover()` 뒤 줄이 하나 늘고, `Esc` 로 모드를 끝낸다.
- **영역 담기.** `await h.toolbar.region.click(); await h.app.mouse.move(20, 60); await h.app.mouse.down(); await h.app.mouse.move(400, 200, { steps: 5 }); await h.app.mouse.up(); await h.confirmPopover()`. 줄이 하나 는다.
- **마커 숨김.** `await h.app.evaluate(() => history.pushState(null, '', '/dashboard?tab=other'))` 뒤 `await h.pins()` 가 빈 배열이고, `/dashboard` 로 돌아오면 다시 보인다.
- **삭제.** `await h.panel.locator('.ev.fresh .ev-del').click()`. `h.dialogs.messages` 에 확인 문구가 하나 생기고, 줄이 하나 줄며, 그 번호의 md 를 `readOpfs` 하면 `null` 이다.
- **저장 확인.** 담은 번호의 md 를 `waitOpfs` 로 읽어 메모가 들어 있는지 본다. 네트워크 항목의 md 처럼 frontmatter 에 `note:` 줄이 있는 것으로 보인다(요소 항목에서는 직접 확인하지 않았다).

이 기능은 아직 헬퍼 여정이 없다. 위 조작은 run.mjs 의 `// ---------- 요소 ----------` · `텍스트` · `영역` 구역에서 통과한 것이다.

## Gotchas

- 담으려면 폴더가 연결되어 있어야 한다. 연결 전에는 팝오버에서 담기지 않는다.
- 담은 뒤에도 모드는 계속된다. 다른 툴바 버튼을 누르기 전에 `Esc` 로 끝낸다.
- 같은 요소를 다시 고르면 새로 담지 않고 그 마커의 편집 팝오버가 열린다. 새 항목을 기대하는 검사는 다른 요소를 고른다.
- 마커는 담은 화면과 주소가 같을 때만 보인다. 쿼리만 바뀌어도 숨으므로, 마커 검사 전에 주소를 확인한다.
- 텍스트 담기의 run.mjs 조작은 합성 이벤트라 실제 드래그와 다를 수 있다. 실제 드래그로 보려면 `h.app.mouse` 로 글자 위를 끌어 본다.
