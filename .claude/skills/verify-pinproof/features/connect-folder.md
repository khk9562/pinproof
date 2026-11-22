# 프로젝트 폴더 연결

사용자가 패널의 [프로젝트 폴더 연결]로 저장소 루트를 고르면 확인 창 없이 바로 연결되고, 익스텐션이 `.pinproof/WORKFLOW.md` 를 만들며, git 저장소면 `.git/info/exclude` 에 `.pinproof/` 를 넣는다. 팀이 함께 쓰는 `.gitignore` 와 프로젝트의 `.claude/commands/` 는 건드리지 않는다. 연결 버튼 아래 체크박스를 켜면 데이터 정합성 점검 스킬(`.claude/skills/trace-screen-data/`)도 함께 설치한다. 처리 절차나 점검 스킬의 새 버전이 있으면 패널에 [업데이트]가 뜬다.

## Sub-features

- `connect-workflow`: 연결하면 버전 표시가 붙은 `.pinproof/WORKFLOW.md` 가 생긴다
- `connect-exclude`: git 저장소면 `.git/info/exclude` 끝에 `# PinProof` 블록이 붙고, `.gitignore` 는 그대로다
- `connect-no-command`: 프로젝트에 `.claude/commands/pinproof.md` 를 만들지 않는다
- `connect-skill`: 체크박스를 켜고 연결하면 `.claude/skills/trace-screen-data/SKILL.md` 가 생기고 exclude 에 그 폴더가 들어간다(기본 꺼짐). 연결 뒤에는 패널의 [이 프로젝트에 설치]로 설치한다
- `workflow-update`: 옛 버전의 WORKFLOW.md 가 있으면 [업데이트]가 뜨고, 누르면 최신으로 바뀐다

## How to get to it (user POV)

- 패널의 [프로젝트 폴더 연결] 버튼과 그 아래 "점검 스킬 … 도 설치 (선택)" 체크박스(처음 열었을 때)
- 패널 연결 줄 아래의 "선택: 데이터 정합성 점검 스킬 … 이 프로젝트에 설치"(연결한 뒤)
- 패널 위쪽의 "처리 절차 새 버전 · [업데이트]" · "점검 스킬 새 버전 · [업데이트]"(옛 버전이 있을 때)

## Driving it with verify-pinproof harness

Preconditions:

- `launch()` 직후, 아직 연결하지 않았다.

- **git 저장소처럼 연결.** `await h.connect({ gitRepo: true })`. 연결 전에 `.git/info/exclude` 와 `.gitignore` 를 두고 [프로젝트 폴더 연결]을 누른다. `.cat.current` 가 보인다.
- **WORKFLOW 확인.** `await h.readOpfs('.pinproof/WORKFLOW.md')` 가 `<!-- pinproof-workflow v` 로 시작하고 `# PinProof 처리 절차` 를 담는다.
- **무시 설정 확인.** `await h.readOpfs('.git/info/exclude')` 가 `'# git ls-files --others\n*~\n\n# PinProof\n.pinproof/\n'` 이고, `await h.readOpfs('.gitignore')` 는 `'node_modules\n'` 그대로다.
- **커맨드 없음.** `await h.readOpfs('.claude/commands/pinproof.md')` 가 `null` 이다.
- **점검 스킬 함께 설치.** `connect()` 를 부르기 전에 `await h.panel.getByRole('checkbox', { name: /점검 스킬 .*도 설치/ }).check()` 로 켠다(기본 꺼짐). 연결 뒤 `await h.readOpfs('.claude/skills/trace-screen-data/SKILL.md')` 에 `name: trace-screen-data` 줄이 있다.
- **연결 뒤 설치.** 스킬이 없으면 `.skill-offer` 가 뜬다(최대 8초). `await h.panel.locator('.skill-offer').getByRole('button', { name: '이 프로젝트에 설치' }).click()`. 확인 창은 `dialogs` 가 수락하고, `.skill-offer` 가 사라지며 SKILL.md 가 생긴다.
- **업데이트.** 옛 버전으로 바꿔 둔다. `await h.writeOpfs('.pinproof/WORKFLOW.md', '# PinProof 처리 절차 (옛 버전)\n')`. `await h.panel.locator('.wf-update').waitFor({ timeout: 8000 })` 로 안내가 뜨면 `await h.panel.locator('.wf-update').getByRole('button', { name: '업데이트' }).click()`. 확인 창은 `dialogs` 가 수락한다. 다시 읽은 WORKFLOW.md 에 `재처리` 가 있고 `.wf-update` 는 사라진다.
- **증거.** 연결 전후 `h.snap()`, `close()` 가 내보낸 `opfs/.pinproof/WORKFLOW.md`.

헬퍼 여정으로는 `connect()` 까지만 돌렸다(`journeys/network-capture.mjs`). 나머지 단계는 run.mjs 의 `// ---------- 연결 ----------` · `// ---------- 선택 스킬 (/trace-screen-data) ----------` 구역에서 통과한 조작이다.

## Gotchas

- OPFS 대역에서는 폴더 선택 창이 없다. 실제 폴더에서는 사용자가 저장소 루트를 직접 고른다. 연결 자체에는 확인 창이 없고, 예전 `.bugnotes/` 가 있을 때만 옮길지 묻는다(OPFS 모드는 이것도 건너뛴다).
- 점검 스킬 체크박스는 연결한 뒤에는 보이지 않는다. 연결 전에 켜야 한다.
- 연결 알림은 `"" 폴더에 연결했습니다.` 처럼 폴더 이름이 비어 나온다. OPFS 루트에 이름이 없어서 그렇고, 버그로 보고하지 않는다.
- `gitRepo: true` 없이 연결하면 `.git` 이 없어 exclude 단계가 생략된다. 무시 설정을 볼 때는 반드시 켠다.
- git 워크트리(`.git` 이 파일)에서는 무시 설정을 쓸 수 없다. 이 대역으로는 그 경우를 만들 수 없다.
- [업데이트] 안내는 주기 확인 뒤에 뜬다. 고정 대기 대신 `.wf-update` 를 최대 8초 기다린다.
