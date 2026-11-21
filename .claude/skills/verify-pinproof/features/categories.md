# 카테고리

사용자는 패널 위쪽의 [담을 곳] 드롭다운에서 카테고리를 고르거나 새로 만들고, 이름을 바꾸거나 지운다. 고른 카테고리에 새 항목이 쌓이고, 목록은 `.pinproof/categories.json` 에 저장된다. 항목을 펼쳐 다른 카테고리로 옮길 수도 있다.

## Sub-features

- `cat-default`: 처음 담을 곳은 `미분류` 이고, 미분류에는 연필 · 휴지통이 없다
- `cat-add`: 드롭다운 맨 아래 [새 카테고리]로 만들면 그곳에 담기 시작한다
- `cat-pick`: 드롭다운에서 고르거나, 상자 머리의 [여기에 담기]로 담을 곳을 바꾼다
- `cat-rename`: 연필로 이름을 바꾸면 목록과 그 카테고리의 항목 md 가 함께 바뀐다
- `cat-delete`: 빈 카테고리는 바로 지우고, 대기 항목이 있으면 한 번 묻는다
- `cat-move`: 항목을 펼쳐 카테고리를 골라 [이동]으로 옮긴다

## How to get to it (user POV)

- 패널 위쪽 바구니 아이콘 옆 [담을 곳] 드롭다운(`.cat-trigger`)
- 드롭다운의 줄마다 있는 연필(이름 바꾸기) · 휴지통(삭제), 맨 아래 [새 카테고리]
- 카테고리 상자 머리의 [여기에 담기]
- 펼친 항목의 카테고리 선택과 [이동]

## Driving it with verify-pinproof harness

Preconditions:

- `connect()` 로 폴더가 연결되어 있다.

- **처음 상태.** `await h.panel.locator('.cat-trigger').getAttribute('data-value')` 가 `미분류` 다.
- **드롭다운 열기.** `await h.panel.locator('.cat-trigger').click(); await h.panel.locator('.cat-menu').waitFor()`. 미분류 줄에는 `.cat-opt-icon` 이 없다.
- **새 카테고리.** `await h.panel.locator('.cat-menu').getByRole('button', { name: '새 카테고리' }).click(); await h.panel.getByLabel('새 카테고리 이름').fill('데이터 정합성'); await h.panel.locator('.cat-menu').getByRole('button', { name: '만들기', exact: true }).click()`. `.cat-trigger` 의 `data-value` 가 새 이름이고 드롭다운은 닫힌다. `JSON.parse(await h.readOpfs('.pinproof/categories.json'))` 에 두 이름이 있다.
- **고르기.** 드롭다운에서 `.cat-opt-pick` 중 `.cat-opt-name` 이 그 이름인 것을 누른다. 또는 `h.panel.locator('.cat', { has: h.panel.locator('.cat-name', { hasText: '이름' }) }).getByRole('button', { name: '여기에 담기' })`.
- **이름 바꾸기.** 드롭다운을 열고 `getByRole('button', { name: '"버그" 이름 바꾸기' })` → `h.panel.getByLabel('바꿀 이름').fill('UI 버그')` → `getByRole('button', { name: '바꾸기', exact: true })`. 그 카테고리 항목 md 에 `category: "UI 버그"` 가 있다.
- **삭제.** 드롭다운에서 `getByRole('button', { name: '"UI 버그" 삭제' })`. 대기 항목이 있으면 `h.dialogs.messages` 에 `"UI 버그" 카테고리와 대기 항목 1개를 삭제할까요?` 가 남는다. 취소를 볼 때는 `h.dialogs.answer = false` 로 누른 뒤 `true` 로 되돌린다.
- **옮기기.** 항목 줄의 `.ev-head` 를 눌러 펼치고 `.move-to` 에서 `selectOption('버그')` 뒤 `.move-go` 를 누른다.

이 기능은 아직 헬퍼 여정이 없다. 위 조작은 run.mjs 의 `// ---------- 카테고리 ----------` 와 `// ---------- 카테고리 옮기기 · 여기에 담기 · 이름 바꾸기 · 삭제 ----------` 구역에서 통과한 것이다.

## Gotchas

- 드롭다운은 열려 있으면 다시 누를 때 닫힌다. 열기 전에 `.cat-trigger` 의 `aria-expanded` 를 본다.
- 삭제는 확인 창이 떠야 진행된다. `dialogs` 없이 Playwright 기본값이면 자동으로 취소된다(헬퍼는 기본 수락).
- 빈 카테고리를 지우면 담을 곳이 `미분류` 로 돌아간다. 다음 검사의 전제를 다시 확인한다.
- 이름 바꾸기와 옮기기는 항목 md 를 다시 쓴다. md 의 `## 처리 기록` 아래는 남아야 하므로, 처리 기록을 둔 항목으로 확인하면 보존 여부도 함께 본다.
