/** WORKFLOW.md 내용이 바뀌면 올린다. 파일 첫 줄의 버전과 비교해 갱신 여부를 정한다 */
export const WORKFLOW_VERSION = 2;
export const WORKFLOW_MARKER = (v: number) => `<!-- pinproof-workflow v${v} -->`;

export const WORKFLOW_MD = `${WORKFLOW_MARKER(WORKFLOW_VERSION)}
# PinProof 처리 절차

이 폴더(\`.pinproof/\`)에는 사용자가 브라우저 화면에서 직접 모은 버그·수정 요청·확인 요청이 "기록 건" 단위로 쌓입니다.
기록 건 1개 = md 파일 1개(\`012-제목.md\`), 스크린샷은 \`assets/012/\`에 있습니다. \`archive/\`는 사용자가 끝났다고 보관한 건이므로 따로 지시가 없으면 보지 않습니다.

프로젝트별 추가 규칙이 \`.pinproof/WORKFLOW.local.md\`에 있으면 그 내용도 함께 따릅니다(이 파일과 충돌하면 local이 우선).

## 인자가 없을 때: 목록
\`.pinproof/*.md\`(WORKFLOW.md, archive/ 제외)의 frontmatter를 읽어 아래 형식으로만 보여주고 멈춥니다.

\`\`\`
#012 대시보드 총합 불일치 · 버그 · 증거 3
#013 VM Agent 조회 실패 문구 · 확인 요청 · 증거 1 · (처리 기록 있음)
\`\`\`

## 번호가 주어졌을 때: 그 건 처리
1. \`.pinproof/<번호 3자리>-*.md\`를 끝까지 읽습니다. 메모는 사용자가 자유롭게 쓴 글이라 현상·기대·추정·제약이 섞여 있을 수 있습니다. 제약(예: "로컬 기준으로만")은 반드시 지킵니다.
   - 이미 \`## 처리 기록\`이 있으면 **재처리**입니다. 이전 기록을 먼저 읽고, frontmatter의 \`updated\`가 마지막 처리 일시보다 늦으면 그 사이 메모·증거가 바뀐 것이니 바뀐 부분을 중심으로 다시 확인합니다. 이전 결론을 그대로 반복하지 말고, 새로 확인한 것과 달라진 결론만 적습니다.
2. 증거마다 연결된 스크린샷·이미지를 열어 사용자가 본 화면을 확인합니다. \`붙여넣기\` 증거는 사용자가 다른 곳(메신저, 메일, 로그 등)에서 가져온 자료입니다. 영역 증거의 "영역 안에 보이던 글자"로 어떤 화면이었는지 특정할 수 있습니다.
3. 코드 위치를 찾습니다.
   - \`참조\`에 소스 위치가 있으면 그 파일부터 봅니다. "근처"라고 표시된 줄 번호는 변환된 코드 기준이라 몇 줄 어긋날 수 있습니다.
   - 소스 위치가 없으면 컴포넌트 이름, 화면 텍스트, selector의 \`data-testid\`·\`id\`·\`aria-label\`로 코드를 검색합니다.
4. 증거들을 서로 대조합니다. 값은 화면에 보인 원문 그대로 기록되어 있으며 익스텐션이 계산하지 않았습니다. 합계·개수·일치 여부는 직접 계산하고, 각 값을 만드는 API와 집계 로직을 끝까지 추적합니다. 컨테이너 증거의 "화면에 보이는 행"은 가상 스크롤 때문에 전체가 아닐 수 있으니 데이터 출처(API, 쿼리)로 확인합니다.
5. 네트워크 증거가 있으면 응답 내용과 화면 표시를 대조합니다. 응답은 앞부분만 기록되어 있습니다.
6. 판단 기준을 정합니다. 메모의 \`기대:\`가 기준입니다. 기대가 없는데 "요구사항이 맞나" 같은 판단이 필요하면 README·설계 문서에서 기준을 찾고, 문서끼리 또는 문서와 코드가 어긋나면 어느 쪽인지 단정하지 말고 어긋난 지점을 보여주며 사용자에게 묻습니다.
7. 원인을 먼저 설명합니다.
   - 유형이 \`버그\` 또는 \`수정 요청\`이면 수정합니다.
   - 유형이 \`확인 요청\`이면 코드를 고치지 말고 확인 결과만 보고합니다.
   - 원인이 불확실하거나 수정 범위가 크면 수정 전에 사용자에게 물어봅니다.
8. 끝나면 그 md 파일 맨 끝에 아래 형식으로 덧붙입니다. \`## 처리 기록\` 위쪽 내용은 고치지 않습니다(익스텐션이 다시 쓰는 영역입니다).
   - 처음 처리: \`## 처리 기록\` 섹션을 만들고 그 아래에 \`### <일시>\` 항목을 씁니다.
   - 재처리: 기존 \`## 처리 기록\` 섹션 맨 아래에 \`### <일시> (재처리)\` 항목만 추가합니다. 섹션 제목을 새로 만들지 않습니다.

\`\`\`
## 처리 기록

### 2026-10-16 15:20
- 원인: …
- 수정한 파일: …
- 화면에서 확인할 방법: …
\`\`\`

9. 파일을 \`archive/\`로 옮기지 않습니다. 보관은 사용자가 화면에서 확인한 뒤 익스텐션에서 직접 합니다.
`;

/** WORKFLOW.md 첫 줄의 버전. 표시가 없으면 버전 표시 이전(v1)으로 본다 */
export function workflowVersionOf(text: string): number {
  const m = text.match(/^<!-- pinproof-workflow v(\d+) -->/);
  return m ? Number(m[1]) : 1;
}

/** .git/info/exclude 에 붙이는 블록. 내 컴퓨터에만 적용되고 모든 워크트리가 함께 쓴다(팀 .gitignore 는 건드리지 않음) */
export const EXCLUDE_BLOCK = `# PinProof
.pinproof/
`;

const EXCLUDE_LINES = ['.pinproof', '.pinproof/', '/.pinproof', '/.pinproof/'];

/** exclude 에 .pinproof 줄이 이미 있으면 null, 없으면 블록을 붙인 전체 내용 */
export function appendExclude(existing: string | null): string | null {
  if (existing?.split('\n').some((l) => EXCLUDE_LINES.includes(l.trim()))) return null;
  if (!existing) return EXCLUDE_BLOCK;
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${EXCLUDE_BLOCK}`;
}
