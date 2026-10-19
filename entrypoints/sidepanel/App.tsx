import { useEffect, useRef, useState } from 'react';
import { formatSize, padId, pagePath } from '@/lib/markdown';
import { Evidence, KIND_LABEL, RECORD_TYPES, RecordSummary } from '@/lib/types';
import { PinProof, usePinProof } from './usePinProof';

export function App() {
  const bn = usePinProof();

  if (!bn.origin) {
    return (
      <div className="panel">
        <Brand />
        <div className="empty">
          <p className="empty-title">localhost 페이지에서 동작합니다</p>
          <p className="muted">개발 중인 앱 탭(http://localhost:포트 또는 127.0.0.1)을 열면 여기에 기록 도구가 나타납니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <Brand />
      <ConnectionBar bn={bn} />
      {bn.connection === 'granted' && (
        <>
          {bn.draft ? <DraftCard bn={bn} /> : <NoDraft bn={bn} />}
          <InboxSection bn={bn} />
          <RecordList bn={bn} />
        </>
      )}
      {bn.notice && <div className={`notice ${bn.notice.kind}`}>{bn.notice.text}</div>}
      <PanelPaste bn={bn} />
    </div>
  );
}

/** 입력칸 밖에서 ⌘V 하면(패널에 포커스가 있을 때) 바로 증거로 담는다 */
function PanelPaste({ bn }: { bn: PinProof }) {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!e.clipboardData || bn.connection !== 'granted') return;
      if (t && (t.closest('input, textarea, [contenteditable="true"], .paste-zone') || t.isContentEditable)) return;
      e.preventDefault();
      bn.addPasted(e.clipboardData);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [bn]);
  return null;
}

/** 익스텐션 아이콘과 같은 압정(assets/icon/pin.svg). 머리(하늘색) → 받침(남색) 그라데이션 */
function PinLogo({ size = 18 }: { size?: number }) {
  return (
    <svg className="pin-logo" viewBox="2.5 1.9 123.6 123.6" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="pp-grad" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="74">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <g transform="translate(64 64) rotate(45) scale(.9) translate(-64 -64)">
        <path className="pp-needle" d="M64 70V121" />
        <path className="pp-body" fill="url(#pp-grad)" d="M46 6H82A10 10 0 0 1 82 26H80L77 54H92A10 10 0 0 1 92 74H36A10 10 0 0 1 36 54H51L48 26H46A10 10 0 0 1 46 6Z" />
      </g>
    </svg>
  );
}

function Brand() {
  return (
    <header className="brand">
      <PinLogo />
      <span>PinProof</span>
    </header>
  );
}

function ConnectionBar({ bn }: { bn: PinProof }) {
  const host = bn.origin!.replace(/^https?:\/\//, '');
  return (
    <section className="conn">
      <div className="conn-row">
        <span className="mono">{host}</span>
        <span className="arrow">→</span>
        {bn.connection === 'none' ? (
          <span className="muted">프로젝트 폴더 미연결</span>
        ) : (
          <span className="folder" title="연결된 프로젝트 폴더">
            {bn.folderName || '(연결된 폴더)'}
          </span>
        )}
        <span className={`dot ${bn.connection}`} title={bn.connection === 'granted' ? '연결됨' : '권한 필요'} />
      </div>
      {bn.connection === 'none' && (
        <button className="btn primary block" onClick={bn.connect}>
          프로젝트 폴더 연결
        </button>
      )}
      {bn.connection === 'prompt' && (
        <div className="conn-actions">
          <button className="btn primary" onClick={bn.reconnect}>
            폴더 다시 연결
          </button>
          <button className="btn ghost" onClick={bn.disconnect}>
            다른 폴더
          </button>
        </div>
      )}
      {bn.connection === 'granted' && bn.legacy && (
        <div className="wf-update">
          <span>
            이전 이름의 폴더 <code>.bugnotes/</code>가 있습니다. <code>.pinproof/</code>로 옮길까요?
          </span>
          <button className="btn primary" onClick={bn.moveLegacy}>
            옮기기
          </button>
        </div>
      )}
      {bn.connection === 'granted' && bn.workflow && (
        <div className="wf-update">
          <span>
            처리 절차(<code>WORKFLOW.md</code>) 새 버전 v{bn.workflow.latest}이 있습니다 · 현재 v{bn.workflow.current}
          </span>
          <button className="btn primary" onClick={bn.upgradeWorkflow}>
            업데이트
          </button>
        </div>
      )}
      {bn.connection === 'none' && (
        <p className="muted small">
          고른 폴더에 <code>.pinproof/</code>를 만들고, git 저장소면 <code>.git/info/exclude</code>에 추가합니다(팀{' '}
          <code>.gitignore</code>는 건드리지 않음). 만들기 전에 목록을 보여드립니다.
        </p>
      )}
    </section>
  );
}

function NoDraft({ bn }: { bn: PinProof }) {
  return (
    <section className="nodraft">
      <p className="muted">작성 중인 기록이 없습니다. 지금 담는 증거는 미분류로 갑니다.</p>
      <button className="btn primary block" onClick={bn.newRecord}>
        + 새 기록
      </button>
    </section>
  );
}

function DraftCard({ bn }: { bn: PinProof }) {
  const d = bn.draft!;
  return (
    <section className="draft">
      <div className="draft-head">
        <span className="badge-draft">작성 중</span>
        <span className="mono strong">#{padId(d.id)}</span>
      </div>
      <label className="field">
        <span>제목</span>
        <input
          value={d.title}
          placeholder="예: 대시보드 총합 불일치"
          onChange={(e) => bn.updateDraft({ title: e.target.value })}
          autoFocus={!d.title}
        />
      </label>
      <div className="field">
        <span>유형</span>
        <div className="seg">
          {RECORD_TYPES.map((t) => (
            <button key={t} className={d.type === t ? 'on' : ''} onClick={() => bn.updateDraft({ type: t })}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>연관</span>
        <input value={d.related} placeholder="예: #589" onChange={(e) => bn.updateDraft({ related: e.target.value })} />
      </label>
      <label className="field">
        <span>메모</span>
        <textarea
          rows={4}
          value={d.memo}
          placeholder={'현상: 무엇이 보였나\n기대: 어떻게 되어야 하나 (요구사항·기준 문서가 있으면 함께)\n제약: 예) 로컬에서만, 다른 화면은 건드리지 말 것'}
          onChange={(e) => bn.updateDraft({ memo: e.target.value })}
        />
      </label>

      <PasteZone bn={bn} />
      <div className="ev-list">
        {d.evidence.length === 0 && (
          <p className="muted small">페이지 오른쪽 위 툴바의 요소·텍스트·영역·네트워크로 담으세요. 페이지를 옮겨도 이 기록에 계속 쌓입니다.</p>
        )}
        {d.evidence.map((e) => (
          <EvidenceRow
            key={e.uid}
            ev={e}
            fresh={bn.freshUid === e.uid}
            onNote={(note) => bn.updateEvidence(e.uid, { note })}
            onLocate={() => bn.locate(e)}
            onGo={() => bn.goTo(e)}
            onMove={() => bn.evidenceToInbox(e.uid)}
            moveLabel="미분류로"
            onDelete={() => bn.removeEvidence(e.uid)}
          />
        ))}
      </div>

      <div className="draft-actions">
        <button className="btn" onClick={bn.finishDraft}>
          작성 종료
        </button>
        <button className="btn ghost danger-text" onClick={() => bn.removeRecord(d.id, d.title, false)} title="이 기록을 파일째 삭제">
          기록 삭제
        </button>
        <button className="btn primary" onClick={bn.copyDraft} title="Claude Code 등에 붙여넣을 프롬프트 복사">
          복사
        </button>
      </div>
    </section>
  );
}

/** 클립보드 이미지·텍스트를 ⌘V로 붙여넣거나 파일을 끌어다 놓아 증거로 담는 곳 */
function PasteZone({ bn }: { bn: PinProof }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`paste-zone ${over ? 'over' : ''}`}
      tabIndex={0}
      role="button"
      aria-label="클립보드 자료 붙여넣기"
      onPaste={(e) => {
        e.preventDefault();
        e.stopPropagation();
        bn.addPasted(e.clipboardData);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        bn.addPasted(e.dataTransfer);
      }}
    >
      여기를 클릭하고 <kbd>⌘V</kbd> 로 스크린샷·텍스트 붙여넣기 · 이미지 끌어다 놓기
    </div>
  );
}

function evidenceSummary(e: Evidence): string {
  if (e.kind === 'paste') return e.pastedText ? `"${e.pastedText.replace(/\s+/g, ' ').slice(0, 80)}"` : e.screenshot ? '이미지' : '';
  if (e.kind === 'network') {
    const reqs = e.requests ?? [];
    const fail = reqs.filter((r) => r.status === 0 || r.status >= 400).length;
    return `호출 ${reqs.length}건${fail ? ` · 실패 ${fail}` : ''}`;
  }
  if (e.kind === 'text') return `"${e.quote?.exact.trim().slice(0, 80) ?? ''}"`;
  if (e.kind === 'region') return '';
  if (e.table) return `헤더 ${e.table.headers.length}개 · 보이는 행 ${e.table.visibleRows}`;
  return e.text ? `"${e.text.slice(0, 80)}"` : '(텍스트 없음)';
}

function componentLine(ev: Evidence): string | null {
  const c = ev.component;
  if (!c) return null;
  const chain = c.chain.length ? `in ${c.chain.slice(0, 3).join(' › ')}` : '';
  const src = c.source ? `${c.source}${c.sourceApprox ? ' 근처' : ''}` : '';
  return [chain, src].filter(Boolean).join(' · ') || null;
}

function PageLine({ ev }: { ev: Evidence }) {
  return (
    <div className="target-page" title={ev.url}>
      <span className="target-page-label">페이지</span>
      <span className="mono">{pagePath(ev.url)}</span>
      {ev.pageTitle && <span className="target-page-title">· {ev.pageTitle}</span>}
    </div>
  );
}

/** 담은 대상이 무엇인지: 페이지 경로·제목, 요소 이름(태그 + 글자/aria-label), 컴포넌트·소스 위치, selector */
function Target({ ev }: { ev: Evidence }) {
  if (ev.kind === 'paste') {
    return (
      <div className="target">
        <PageLine ev={ev} />
        {ev.screenshot && <img className="paste-img" src={ev.screenshot} alt="붙여넣은 이미지" />}
        {ev.pastedText && <pre className="paste-text">{ev.pastedText.slice(0, 600)}</pre>}
      </div>
    );
  }
  if (ev.kind === 'network') {
    return (
      <div className="target">
        <PageLine ev={ev} />
      </div>
    );
  }
  if (ev.kind === 'region') {
    return (
      <div className="target">
        <PageLine ev={ev} />
        <div className="target-name">
          {ev.rect?.width}×{ev.rect?.height} 영역 · 안쪽 요소 {ev.children?.length ?? 0}개
        </div>
        {ev.regionTexts && ev.regionTexts.length > 0 && (
          <div className="target-texts" title={ev.regionTexts.join(' · ')}>
            {ev.regionTexts.join(' · ')}
          </div>
        )}
        {ev.children?.slice(0, 3).map((c, i) => (
          <div key={i} className="target-sel mono">
            &lt;{c.tag}&gt; {c.text}
          </div>
        ))}
      </div>
    );
  }
  const comp = componentLine(ev);
  return (
    <div className="target">
      <PageLine ev={ev} />
      <div className="target-name mono">&lt;{ev.label ?? ev.tag}&gt;</div>
      {comp && <div className="target-comp mono">{comp}</div>}
      {ev.selector && (
        <div className="target-sel mono" title={ev.selector}>
          {ev.selector}
        </div>
      )}
    </div>
  );
}

/** 한 줄 목록에 보일 "무엇을 담았나" */
function rowWhat(e: Evidence): { text: string; bad?: number } {
  if (e.kind === 'network') {
    const reqs = e.requests ?? [];
    const failed = reqs.find((r) => r.status === 0 || r.status >= 400);
    const first = failed ?? reqs[0];
    const path = first ? new URL(first.url).pathname : '';
    return { text: `${first?.method ?? ''} ${path}${reqs.length > 1 ? ` 외 ${reqs.length - 1}건` : ''}`, bad: failed ? failed.status || 0 : undefined };
  }
  if (e.kind === 'paste') return { text: e.pastedText ? `"${e.pastedText.replace(/\s+/g, ' ').slice(0, 60)}"` : '이미지' };
  if (e.kind === 'text') return { text: `"${e.quote?.exact.replace(/\s+/g, ' ').trim().slice(0, 60) ?? ''}"` };
  if (e.kind === 'region') return { text: `영역 ${e.rect?.width}×${e.rect?.height}` };
  const name = `<${e.label ?? e.tag}>`;
  return { text: e.text ? `${name} "${e.text.replace(/\s+/g, ' ').slice(0, 40)}"` : name };
}

/** 문자 원: 페이지에 마커가 있는 증거는 하늘색으로 채우고, 마커가 없는 증거(네트워크·붙여넣기)는 테두리만 */
function Letter({ ev }: { ev: Evidence }) {
  if (!ev.letter) return <span className="dot-loose" title="미분류" />;
  const onPage = ev.kind !== 'network' && ev.kind !== 'paste';
  return (
    <span className={`letter ${onPage ? '' : 'outline'}`} title={onPage ? '페이지에 마커가 있는 증거' : '페이지 마커 없음'}>
      {ev.letter}
    </span>
  );
}

function EvidenceRow(props: {
  ev: Evidence;
  fresh: boolean;
  onNote: (note: string) => void;
  onLocate: () => void;
  onGo: () => void;
  onMove: () => void;
  moveLabel: string;
  onDelete: () => void;
}) {
  const { ev } = props;
  /** 사용자가 직접 펼치거나 접은 상태. 정하지 않았으면 방금 담은 줄만 펼친다 */
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? props.fresh;
  const setOpen = setUserOpen;
  const [shot, setShot] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.fresh) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [props.fresh]);
  const what = rowWhat(ev);
  return (
    <div ref={rowRef} className={`ev ${ev.kind} ${props.fresh ? 'fresh' : ''} ${open ? 'open' : ''}`}>
      <div className="ev-row">
        <button
          className="ev-head"
          aria-expanded={open}
          onClick={() => {
            if (!open) props.onLocate();
            setOpen(!open);
          }}
          title={open ? '접기' : '펼치기 · 이 페이지에 있으면 마커를 반짝입니다'}
        >
          <Letter ev={ev} />
          <span className="what mono" title={what.text}>
            {what.bad !== undefined && <span className="code-bad">{what.bad || 'ERR'}</span>}
            {what.text}
          </span>
          <span className={`memo ${ev.note ? '' : 'none'}`}>{ev.note || '메모 없음'}</span>
        </button>
        <button className="ev-del" onClick={props.onDelete} title="이 증거 삭제" aria-label="이 증거 삭제">
          ✕
        </button>
      </div>
      {open && (
        <div className="ev-body">
          <Target ev={ev} />
          {ev.kind !== 'paste' && evidenceSummary(ev) && <div className="sum">{evidenceSummary(ev)}</div>}
          {ev.kind === 'network' && (
            <details className="net">
              <summary>호출 목록</summary>
              {(ev.requests ?? []).map((r, i) => (
                <div key={i} className="net-row mono">
                  <span className={r.status === 0 || r.status >= 400 ? 'bad' : ''}>{r.status || 'ERR'}</span> {r.method}{' '}
                  {new URL(r.url).pathname} · {formatSize(r.size)}
                </div>
              ))}
            </details>
          )}
          {ev.screenshot && ev.kind !== 'paste' && (
            <img className={shot ? 'shot' : 'thumb'} src={ev.screenshot} alt="스크린샷" onClick={() => setShot(!shot)} title={shot ? '작게 보기' : '스크린샷 크게 보기'} />
          )}
          <input className="ev-note" value={ev.note} placeholder="한 줄 메모 (선택)" onChange={(e) => props.onNote(e.target.value)} />
          <div className="ev-actions">
            {ev.selector && <button onClick={props.onGo}>페이지로 이동</button>}
            <button onClick={props.onMove}>{props.moveLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InboxSection({ bn }: { bn: PinProof }) {
  const [open, setOpen] = useState(true);
  if (bn.inbox.length === 0) return null;
  return (
    <section className="section">
      <button className="section-head" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 미분류 <span className="count">{bn.inbox.length}</span>
      </button>
      {open &&
        bn.inbox.map((e) => (
          <EvidenceRow
            key={e.uid}
            ev={e}
            fresh={bn.freshUid === e.uid}
            onNote={(note) => bn.setInboxNote(e.uid, note)}
            onLocate={() => bn.locate(e)}
            onGo={() => bn.goTo(e)}
            onMove={() => bn.inboxToDraft(e.uid)}
            moveLabel="작성 중인 기록에 넣기"
            onDelete={() => bn.removeInbox(e.uid)}
          />
        ))}
    </section>
  );
}

function RecordList({ bn }: { bn: PinProof }) {
  const [showArchived, setShowArchived] = useState(false);
  const list = bn.records.filter((r) => r.archived === showArchived);
  return (
    <section className="section">
      <div className="section-head static">
        <span>
          {showArchived ? '보관함' : '기록'} <span className="count">{list.length}</span>
        </span>
        <button className="link" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? '기록 보기' : '보관함 보기'}
        </button>
      </div>
      {list.length === 0 && <p className="muted small">{showArchived ? '보관한 기록이 없습니다.' : '아직 기록이 없습니다.'}</p>}
      {list.map((r) => (
        <RecordRow key={`${r.archived}-${r.id}`} r={r} bn={bn} />
      ))}
    </section>
  );
}

function RecordRow({ r, bn }: { r: RecordSummary; bn: PinProof }) {
  const editing = bn.draft?.id === r.id;
  return (
    <div className={`rec ${editing ? 'editing' : ''}`}>
      <button className="rec-main" onClick={() => bn.openRecord(r)} disabled={r.archived || editing} title={r.archived ? '' : '다시 열어 증거 추가·수정'}>
        <span className="mono strong">#{padId(r.id)}</span>
        <span className="rec-title">{r.title || '(제목 없음)'}</span>
        <span className="rec-meta">
          {r.type} · 증거 {r.evidenceCount}
          {r.hasResult && <span className="done"> · 처리 기록 있음</span>}
        </span>
      </button>
      <div className="rec-actions">
        <button onClick={() => bn.copyRecord(r.fileName, r.archived)} title="프롬프트 복사">
          복사
        </button>
        <button onClick={() => bn.archive(r)}>{r.archived ? '되돌리기' : '보관'}</button>
        <button className="danger" onClick={() => bn.removeRecord(r.id, r.title, r.archived)}>
          삭제
        </button>
      </div>
    </div>
  );
}
