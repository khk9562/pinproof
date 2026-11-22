# 넘기기와 보관

사용자는 카테고리 상자의 [프롬프트 복사 (새 n)]로 아직 넘기지 않은 대기 항목만 에이전트에게 넘기고, 넘긴 항목에는 넘김 표시가 남는다. 에이전트가 항목 md 의 `status` 를 `완료` 로 바꾸면 패널이 5초 주기로 이를 알아채 보관함(`items/archive/`)으로 옮긴다. 덜 고쳐졌으면 보관함에서 되돌린다.

## Sub-features

- `handoff-category`: 카테고리째 복사는 넘기지 않은 대기 항목의 파일만 하나하나 적는다
- `handoff-sent`: 넘긴 항목의 md 에 `sent:` 시각이, 패널 줄에 넘김 표시가 생긴다
- `handoff-item`: 펼친 항목의 [프롬프트 복사]는 그 항목만 적는다
- `archive-auto`: `status: 완료` 가 된 항목은 md 와 스크린샷째 `items/archive/` 로 옮겨진다
- `archive-restore`: 보관함의 [되돌리기]는 대기로 돌리고 처리 기록은 남긴다

## How to get to it (user POV)

- 카테고리 상자 머리의 [프롬프트 복사 (새 n)] · [프롬프트 다시 복사]
- 항목을 펼친 뒤의 [프롬프트 복사]
- 에이전트가 `/pinproof` 로 처리하며 md 를 고침(패널이 자동으로 보관)
- 패널 아래 보관함 구역의 [되돌리기] · 삭제

## Driving it with verify-pinproof harness

Preconditions:

- `connect()` 뒤 지금 카테고리에 대기 항목이 하나 이상 있다(예: `network-capture.md` 의 담기 단계를 먼저 한다).

- **카테고리째 복사.** `const copy = h.panel.locator('.cat.current .cat-copy')`. 글자가 `프롬프트 복사 (새 1)` 이다. `await copy.click()` 뒤 `await h.clipboard()` 에 `` `.pinproof/items/001.md` `` 가 있다.
- **넘김 표시.** `await h.waitOpfs('.pinproof/items/001.md', (t) => /^sent: \d{4}-/m.test(t))` 가 돌아오고, `h.panel.locator('.cat.current .tag.sent')` 가 1개이며, 버튼 글자는 `프롬프트 다시 복사` 다.
- **항목 하나만.** 줄의 `.ev-head` 를 눌러 펼치고 `.ev-body` 안의 `getByRole('button', { name: '프롬프트 복사' })` 를 누른다. `h.clipboard()` 에 그 항목 파일만 있다.
- **에이전트 처리(대역).** md 를 읽어 `status: 대기` 를 `status: 완료` 로 바꾸고 끝에 `\n## 처리 기록\n- 원인: 에이전트가 처리\n` 를 붙여 `h.writeOpfs` 로 쓴다.
- **자동 보관.** `await h.waitOpfs('.pinproof/items/archive/001.md', (t) => t.includes('status: 완료'), 8000)` 가 돌아오고, `readOpfs('.pinproof/items/001.md')` 는 `null` 이다. `h.notices()` 에 `보관함` 이 들어간 알림이 있다.
- **되돌리기.** `const archive = h.panel.locator('.section.archive'); await archive.locator('.section-head').click(); await archive.locator('.ev').first().locator('.ev-head').click(); await archive.getByRole('button', { name: '되돌리기' }).click()`. `items/001.md` 가 다시 생기고 `status: 대기` 와 처리 기록이 함께 있다.

이 기능은 아직 헬퍼 여정이 없다. 위 조작은 run.mjs 의 `// ---------- 프롬프트: … ----------` 와 `// ---------- 완료 → 자동 보관 → 되돌리기 ----------` 구역에서 통과한 것이다.

## Gotchas

- 클립보드는 `clipboard()` 가로채기 대역이다. 실제로 다른 곳에 붙여 넣은 결과는 확인하지 못한다.
- 에이전트 처리는 `writeOpfs` 대역이다. 실제 `/pinproof` 처리 결과를 증명한 것으로 보고하지 않는다.
- 자동 보관은 5초 주기 확인이라 바로 일어나지 않는다. 고정 대기 대신 `waitOpfs` 에 8초 정도를 준다.
- 되돌린 항목은 다시 자동 보관되지 않는다. 같은 항목으로 보관을 두 번 보려면 새 항목을 담는다.
- 보관함 삭제와 [정리]는 확인 창을 띄우고 md 와 스크린샷을 지운다. 되돌릴 수 없으므로 검사 순서의 마지막에 둔다.
