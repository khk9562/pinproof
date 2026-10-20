import { ReactNode, useEffect, useRef, useState } from 'react';
import { formatSize, padId, pagePath } from '@/lib/markdown';
import { applyTheme, loadTheme, nextTheme, onThemeChange, THEME_KEY, THEME_LABEL, ThemePref } from '@/lib/theme';
import { Evidence, KIND_LABEL, RECORD_TYPES, RecordSummary } from '@/lib/types';
import { PinProof, usePinProof } from './usePinProof';

/** 테마 설정(시스템·라이트·다크). 페이지 위 오버레이도 같은 값을 따른다 */
function useThemePref(): [ThemePref, () => void] {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => {
    loadTheme().then(setPref);
    return onThemeChange(setPref);
  }, []);
  useEffect(() => applyTheme(document.documentElement, pref), [pref]);
  const cycle = () => {
    const next = nextTheme(pref);
    setPref(next);
    chrome.storage.local.set({ [THEME_KEY]: next }).catch(() => {});
  };
  return [pref, cycle];
}

export function App() {
  const bn = usePinProof();
  const theme = useThemePref();

  if (!bn.origin) {
    return (
      <div className="panel">
        <Brand theme={theme} />
        {bn.sitePattern ? (
          <div className="empty">
            <p className="empty-title">이 사이트에서는 꺼져 있습니다</p>
            <p className="muted">
              <span className="mono">{new URL(bn.tabUrl).host}</span> 같은 배포 주소는 사이트별로 켭니다. 켜면 이 탭을 새로고침하고,
              연결한 로컬 프로젝트 폴더에 기록을 쌓습니다.
            </p>
            <button className="btn primary block" onClick={bn.enableSite}>
              이 사이트에서 PinProof 켜기
            </button>
          </div>
        ) : (
          <div className="empty">
            <p className="empty-title">localhost 페이지에서 동작합니다</p>
            <p className="muted">개발 중인 앱 탭(http://localhost:포트 또는 127.0.0.1)을 열면 여기에 기록 도구가 나타납니다. 배포 주소는 그 탭에서 이 패널을 열어 켤 수 있습니다.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <ConnectionBar bn={bn} theme={theme} />
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
          <stop offset="1" style={{ stopColor: 'var(--pin-bottom)' }} />
        </linearGradient>
      </defs>
      <g transform="translate(64 64) rotate(45) scale(.9) translate(-64 -64)">
        <path className="pp-needle" d="M64 70V121" />
        <path className="pp-body" fill="url(#pp-grad)" d="M46 6H82A10 10 0 0 1 82 26H80L77 54H92A10 10 0 0 1 92 74H36A10 10 0 0 1 36 54H51L48 26H46A10 10 0 0 1 46 6Z" />
      </g>
    </svg>
  );
}

/** 제목 글자는 Chrome 사이드 패널 머리가 이미 보여주므로 아이콘만 둔다 */
function Brand({ theme }: { theme: [ThemePref, () => void] }) {
  return (
    <header className="brand">
      <PinLogo />
      <ThemeButton theme={theme} />
    </header>
  );
}

const THEME_ICON: Record<ThemePref, ReactNode> = {
  system: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1.3" />
      <path d="M6 13.5h4M8 11v2.5" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  dark: <path d="M13 9.6A5.6 5.6 0 1 1 6.4 3a4.6 4.6 0 0 0 6.6 6.6z" />,
};

/** 테마 전환: 시스템 설정 → 라이트 → 다크 */
function ThemeButton({ theme: [pref, cycle] }: { theme: [ThemePref, () => void] }) {
  const label = `테마: ${THEME_LABEL[pref]} · 누르면 ${THEME_LABEL[nextTheme(pref)]}`;
  return (
    <button className="theme-btn" onClick={cycle} title={label} aria-label={label} data-theme-pref={pref}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {THEME_ICON[pref]}
      </svg>
    </button>
  );
}

function ConnectionBar({ bn, theme }: { bn: PinProof; theme: [ThemePref, () => void] }) {
  const host = bn.origin!.replace(/^https?:\/\//, '');
  return (
    <section className="conn">
      <div className="conn-row">
        <PinLogo size={16} />
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
        <ThemeButton theme={theme} />
      </div>
      {bn.sitePattern && (
        <p className="site-on muted small">
          직접 켠 사이트입니다 ·{' '}
          <button className="link" onClick={bn.disableSite} title="이 사이트에서 PinProof 를 끄고 탭을 새로고침합니다">
            끄기
          </button>
        </p>
      )}
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

/**
 * 증거 줄은 한 구역에서 하나만 펼친다. 방금 담은 증거는 새로 들어올 때 한 번 펼친다
 * (사용자가 접은 뒤 다른 변화로 다시 열리지 않게 이미 처리한 freshUid 는 기억한다)
 */
function useOneOpen(freshUid: string | null, uids: string[]): [string | null, (uid: string) => void] {
  const [openUid, setOpenUid] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const hasFresh = !!freshUid && uids.includes(freshUid);
  useEffect(() => {
    if (hasFresh && freshUid !== handled.current) {
      handled.current = freshUid;
      setOpenUid(freshUid);
    }
  }, [hasFresh, freshUid]);
  return [openUid, (uid) => setOpenUid((cur) => (cur === uid ? null : uid))];
}

function DraftCard({ bn }: { bn: PinProof }) {
  const d = bn.draft!;
  const [openUid, toggle] = useOneOpen(bn.freshUid, d.evidence.map((e) => e.uid));
  return (
    <section className="draft">
      <div className="draft-head">
        <span className="badge-draft">작성 중</span>
        <span className="mono strong">#{padId(d.id)}</span>
        <button className="draft-fold" onClick={bn.finishDraft} title="이슈 접기 — 저장하고 목록으로" aria-label="이슈 접기">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
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
          className="memo-area"
          rows={2}
          value={d.memo}
          placeholder="현상 · 기대(기준 문서) · 제약(예: 로컬에서만)"
          onChange={(e) => bn.updateDraft({ memo: e.target.value })}
        />
      </label>

      {/* 본문(위)과 이 이슈에 담은 증거(아래)를 상자로 나눈다. 붙여넣기 칸은 증거를 담는 입구라 상자 안에 */}
      <div className="ev-block">
        <div className="ev-block-head">
          증거 <span className="count">{d.evidence.length}</span>
        </div>
        <PasteZone bn={bn} />
        <div className="ev-list">
        {d.evidence.length === 0 && (
          <p className="muted small">페이지 아래 가운데 툴바의 요소·텍스트·영역·네트워크로 담으세요. 페이지를 옮겨도 이 기록에 계속 쌓입니다.</p>
        )}
        {d.evidence.map((e) => (
          <EvidenceRow
            key={e.uid}
            ev={e}
            fresh={bn.freshUid === e.uid}
            open={openUid === e.uid}
            onToggle={() => toggle(e.uid)}
            onNote={(note) => bn.updateEvidence(e.uid, { note })}
            onLocate={() => bn.locate(e)}
            onGo={() => bn.goTo(e)}
            moves={[{ value: 'inbox', label: '미분류' }, ...recordMoves(bn)]}
            onMoveTo={(to) => moveEvidence(bn, e.uid, to)}
            onDelete={() => bn.removeEvidence(e.uid)}
          />
        ))}
        </div>
      </div>

      <div className="draft-actions">
        <button className="btn" onClick={bn.finishDraft} title="저장하고 목록으로">
          이슈 접기
        </button>
        <button className="btn ghost danger-text" onClick={() => bn.removeRecord(d.id, d.title, false)} title="이 기록을 파일째 삭제">
          삭제
        </button>
        <button className="btn primary" onClick={bn.copyDraft} title="Claude Code 등에 붙여넣을 프롬프트 복사">
          프롬프트 복사
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

type MoveOption = { value: string; label: string };

/** 증거를 옮길 수 있는 기록: 지금 주소에서 만든(또는 주소 없는 옛) 보관 안 한 기록 중 작성 중인 것 말고 */
function recordMoves(bn: PinProof): MoveOption[] {
  return bn.records
    .filter((r) => !r.archived && (!r.app || r.app === bn.origin) && r.id !== bn.draft?.id)
    .map((r) => ({ value: String(r.id), label: `#${padId(r.id)} ${r.title || '(제목 없음)'}` }));
}

/** 옮길 곳: inbox(미분류) · draft(작성 중 기록) · 기록 번호 */
function moveEvidence(bn: PinProof, uid: string, to: string) {
  if (to === 'inbox') bn.evidenceToInbox(uid);
  else if (to === 'draft') bn.inboxToDraft(uid);
  else bn.moveToRecord(uid, Number(to));
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
  /** 이 구역에서 펼친 줄인지(한 번에 하나) */
  open: boolean;
  onToggle: () => void;
  onNote: (note: string) => void;
  onLocate: () => void;
  onGo: () => void;
  /** 옮길 수 있는 곳(첫 항목이 기본값: 작성 중 기록의 증거는 미분류, 미분류 증거는 작성 중 기록) */
  moves: MoveOption[];
  onMoveTo: (to: string) => void;
  onDelete: () => void;
}) {
  const { ev } = props;
  /** 사용자가 직접 펼치거나 접은 상태. 정하지 않았으면 방금 담은 줄만 펼친다 */
  const open = props.open;
  const [shot, setShot] = useState(false);
  /** 고른 옮길 곳. 목록이 바뀌어 없어졌으면 첫 항목(기본값)으로 */
  const [picked, setMoveTo] = useState<string | null>(null);
  const moveTo = picked && props.moves.some((m) => m.value === picked) ? picked : (props.moves[0]?.value ?? '');
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
            props.onToggle();
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
          <textarea
            className="ev-note"
            rows={2}
            value={ev.note}
            placeholder="메모 (선택)"
            onKeyDown={(e) => {
              // 기록 md 에 한 줄로 들어가는 메모라 Enter 로 줄을 나누지 않는다(긴 글은 칸 안에서 자동 줄바꿈)
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
            }}
            onChange={(e) => props.onNote(e.target.value.replace(/\s*\n\s*/g, ' '))}
          />
          <div className="ev-actions">
            {ev.selector && (
              <button className="go-page" onClick={props.onGo} title="이 증거를 담은 화면으로 가서 그 요소를 찾아 반짝입니다">
                해당 페이지로 이동
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4.5 2.5h5v5M9.5 2.5L3 9" />
                </svg>
              </button>
            )}
            {props.moves.length > 0 && (
              <span className="move">
                <select className="move-to" value={moveTo} aria-label="옮길 곳" onChange={(e) => setMoveTo(e.target.value)}>
                  {props.moves.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button className="move-go" onClick={() => props.onMoveTo(moveTo)}>
                  이동
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxSection({ bn }: { bn: PinProof }) {
  const [open, setOpen] = useState(true);
  const [openUid, toggle] = useOneOpen(bn.freshUid, bn.inbox.map((e) => e.uid));
  if (bn.inbox.length === 0) return null;
  return (
    <section className="section inbox">
      <button className="section-head" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 미분류 <span className="count">{bn.inbox.length}</span>
      </button>
      {open &&
        bn.inbox.map((e) => (
          <EvidenceRow
            key={e.uid}
            ev={e}
            fresh={bn.freshUid === e.uid}
            open={openUid === e.uid}
            onToggle={() => toggle(e.uid)}
            onNote={(note) => bn.setInboxNote(e.uid, note)}
            onLocate={() => bn.locate(e)}
            onGo={() => bn.goTo(e)}
            moves={[...(bn.draft ? [{ value: 'draft', label: `작성 중 기록 #${padId(bn.draft.id)}` }] : []), ...recordMoves(bn)]}
            onMoveTo={(to) => moveEvidence(bn, e.uid, to)}
            onDelete={() => bn.removeInbox(e.uid)}
          />
        ))}
    </section>
  );
}

function RecordList({ bn }: { bn: PinProof }) {
  const [showArchived, setShowArchived] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const inView = bn.records.filter((r) => r.archived === showArchived);
  // 같은 폴더에 여러 주소(localhost·배포 주소)를 연결할 수 있어, 지금 주소에서 만든 기록만 기본으로 보인다.
  // 주소가 없는 옛 기록은 어느 쪽인지 몰라 함께 보인다. 다른 주소의 기록은 그 주소 탭에서만 다시 열어 편집된다
  const list = inView.filter((r) => !r.app || r.app === bn.origin);
  const others = inView.filter((r) => r.app && r.app !== bn.origin);
  return (
    <section className="section records">
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
      {others.length > 0 && (
        <div className="others">
          <button className="link others-toggle" onClick={() => setShowOthers(!showOthers)}>
            {showOthers ? '다른 주소 기록 접기' : `다른 주소 기록 ${others.length}건 보기`}
          </button>
          {showOthers &&
            others.map((r) => (
              <RecordRow key={`${r.archived}-${r.id}`} r={r} bn={bn} />
            ))}
        </div>
      )}
    </section>
  );
}

function RecordRow({ r, bn }: { r: RecordSummary; bn: PinProof }) {
  const editing = bn.draft?.id === r.id;
  /** 다른 주소에서 만든 기록: 그 주소 탭에서만 다시 열어 편집된다 */
  const other = !!r.app && r.app !== bn.origin;
  const otherHost = other ? r.app!.replace(/^https?:\/\//, '') : '';
  return (
    <div className={`rec ${editing ? 'editing' : ''} ${other ? 'other' : ''}`}>
      <button
        className="rec-main"
        onClick={() => bn.openRecord(r)}
        disabled={r.archived || editing || other}
        title={other ? `${otherHost} 에서 만든 기록입니다. 그 주소 탭에서 열면 편집할 수 있습니다.` : r.archived ? '' : '다시 열어 증거 추가·수정'}
      >
        <span className="mono strong">#{padId(r.id)}</span>
        <span className="rec-title">{r.title || '(제목 없음)'}</span>
        <span className="rec-meta">
          {r.type} · 증거 {r.evidenceCount}
          {r.hasResult && <span className="done"> · 처리 기록 있음</span>}
          {other && <span className="mono"> · {otherHost}</span>}
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
