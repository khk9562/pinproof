import { Fragment, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { formatSize, padId, pagePath } from '@/lib/markdown';
import { applyTheme, loadTheme, nextTheme, onThemeChange, THEME_KEY, THEME_LABEL, ThemePref } from '@/lib/theme';
import { DEFAULT_CATEGORY, Evidence, EvidenceKind, ItemSummary, KIND_LABEL, RecordSummary } from '@/lib/types';
import { ItemView, PinProof, usePinProof } from './usePinProof';

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

  const cleanable = bn.connection === 'granted' && (bn.archivedItems.length > 0 || bn.records.length > 0);
  return (
    <div className="panel">
      <ConnectionBar bn={bn} theme={theme} />
      {bn.pendingSaves.length > 0 && (
        <section className="pending-saves" aria-label="저장 대기 항목">
          <h2>저장 대기 {bn.pendingSaves.length}개</h2>
          <p className="muted small">자료는 이 브라우저에 보관되어 있습니다. 프로젝트 파일 저장을 다시 시도하세요.</p>
          {bn.pendingSaves.map((save) => (
            <div className="pending-save" key={save.item.evidence.uid}>
              <strong>#{padId(save.item.id)} · {save.item.category}</strong>
              <p>{save.item.evidence.note || save.item.evidence.label || '메모 없음'}</p>
              {save.error && <p className="muted small" role="alert">{save.error}</p>}
              <button className="btn primary" disabled={bn.savingUids.has(save.item.evidence.uid)} onClick={() => bn.retrySave(save.item.evidence.uid)}>
                {bn.savingUids.has(save.item.evidence.uid) ? '저장 중' : '저장 다시 시도'}
              </button>
            </div>
          ))}
        </section>
      )}
      {bn.connection === 'granted' && (
        <>
          <CategoryBar bn={bn} />
          <CategoryList bn={bn} />
          <Archive bn={bn} />
          <Folded title="다른 주소 항목" count={bn.otherItems.length} className="others-items">
            <p className="muted small">같은 폴더에 연결한 다른 주소에서 만든 대기 항목입니다. 그 주소 탭에서 열면 고칠 수 있습니다.</p>
            <ItemGroup bn={bn} groups={[{ day: null, list: bn.otherItems }]} mode="other" />
          </Folded>
          <OldRecords bn={bn} />
        </>
      )}
      {/* 바닥: [정리] 버튼 위, 알림 띠 아래 — 알림이 뜨면 버튼이 그 위로 비켜난다 */}
      {(cleanable || bn.notice) && (
        <div className="panel-foot">
          {cleanable && <Cleanup bn={bn} />}
          {bn.notice && (
            <div className={`notice ${bn.notice.kind}`} role={bn.notice.kind === 'warn' ? 'alert' : 'status'}>
              {bn.notice.text}
            </div>
          )}
        </div>
      )}
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

/** 익스텐션 아이콘과 같은 압정(assets/icon/pin.svg). 잉크 단색(currentColor), 바탕색 테두리로 바늘과 몸통을 가른다 */
function PinLogo({ size = 18 }: { size?: number }) {
  return (
    <svg className="pin-logo" viewBox="2.5 1.9 123.6 123.6" width={size} height={size} aria-hidden="true">
      <g transform="translate(64 64) rotate(45) scale(.9) translate(-64 -64)">
        <path className="pp-needle" d="M64 70V121" />
        <path className="pp-body" fill="currentColor" d="M46 6H82A10 10 0 0 1 82 26H80L77 54H92A10 10 0 0 1 92 74H36A10 10 0 0 1 36 54H51L48 26H46A10 10 0 0 1 46 6Z" />
      </g>
    </svg>
  );
}

/** 선 아이콘(24 격자, Lucide 모양). 색은 currentColor */
const ICON_PATHS = {
  chevron: ['m6 9 6 6 6-6'],
  basket: ['m15 11-1 9', 'm19 11-4-7', 'M2 11h20', 'm3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4', 'M4.5 15.5h15', 'm5 11 4-7', 'm9 11 1 9'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  check: ['M20 6 9 17l-5-5'],
  plus: ['M5 12h14', 'M12 5v14'],
};

function Icon({ name, size = 16, className }: { name: keyof typeof ICON_PATHS; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** 접고 펼치는 곳의 화살표. 접혀 있으면 아래, 펼치면 위(CSS 가 돌린다) */
function Chevron() {
  return <Icon name="chevron" size={14} className="chev" />;
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

/**
 * 지금 담을 카테고리. 바구니 아이콘 + 직접 만든 드롭다운:
 * 줄마다 고르기 · 이름 바꾸기(연필) · 삭제(휴지통), 맨 아래 + 새 카테고리. 미분류는 바꾸거나 지울 수 없다.
 * 이름 바꾸기·새로 만들기는 목록 안에서 그 줄이 입력칸으로 바뀐다.
 */
function CategoryBar({ bn }: { bn: PinProof }) {
  const [open, setOpen] = useState(false);
  /** 입력 중인 줄: 새 카테고리(add) 또는 이름을 바꿀 카테고리 */
  const [edit, setEdit] = useState<null | { kind: 'add' } | { kind: 'rename'; from: string }>(null);
  const [name, setName] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const names = bn.categories.includes(bn.category) ? bn.categories : [...bn.categories, bn.category];

  const close = (focusTrigger = false) => {
    setOpen(false);
    setEdit(null);
    if (focusTrigger) trigger.current?.focus();
  };
  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const startEdit = (next: { kind: 'add' } | { kind: 'rename'; from: string }) => {
    setEdit(next);
    setName(next.kind === 'rename' ? next.from : '');
  };
  const submit = async () => {
    if (!edit || !name.trim()) return;
    if (edit.kind === 'add') await bn.addCategory(name);
    else await bn.renameCategory(edit.from, name);
    close(true);
  };
  const pick = (c: string) => {
    bn.setCategory(c);
    close(true);
  };
  /** 열려 있을 때 ↑↓ 로 줄 사이를 옮기고, Esc 는 입력 중이면 입력만, 아니면 목록을 닫는다(드롭다운 버튼에 포커스가 있어도) */
  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (edit) setEdit(null);
      else close(true);
      return;
    }
    if (edit || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('.cat-menu .cat-opt-pick, .cat-menu .cat-add') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const editor = (label: string, action: string) => (
    <form
      className="cat-edit"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input className="cat-input" autoFocus value={name} placeholder={edit?.kind === 'add' ? '예: 데이터 정합성' : ''} aria-label={label} onChange={(e) => setName(e.target.value)} />
      <button className="btn primary" type="submit" disabled={!name.trim()}>
        {action}
      </button>
    </form>
  );

  return (
    <div className="cat-bar" ref={root} onKeyDown={onMenuKey}>
      <Icon name="basket" className="basket" />
      <button
        ref={trigger}
        className="cat-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`담을 곳: ${bn.category}`}
        title="담을 곳"
        data-value={bn.category}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.cat-opt.current .cat-opt-pick')?.focus());
          }
        }}
      >
        <span className="cat-trigger-name">{bn.category}</span>
        <Chevron />
      </button>
      {open && (
        <div className="cat-menu">
          <ul>
            {names.map((c) =>
              edit?.kind === 'rename' && edit.from === c ? (
                <li key={c} className="cat-opt editing">
                  {editor('바꿀 이름', '바꾸기')}
                </li>
              ) : (
                <li key={c} className={`cat-opt ${c === bn.category ? 'current' : ''}`}>
                  <button className="cat-opt-pick" aria-current={c === bn.category ? 'true' : undefined} onClick={() => pick(c)}>
                    <span className="cat-opt-check">{c === bn.category && <Icon name="check" size={14} />}</span>
                    <span className="cat-opt-name">{c}</span>
                  </button>
                  {c !== DEFAULT_CATEGORY && (
                    <>
                      <button className="cat-opt-icon" aria-label={`"${c}" 이름 바꾸기`} title="이름 바꾸기" onClick={() => startEdit({ kind: 'rename', from: c })}>
                        <Icon name="pencil" size={14} />
                      </button>
                      <button className="cat-opt-icon danger" aria-label={`"${c}" 삭제`} title="삭제 — 한 번 묻고, 대기 항목이 있으면 함께 지웁니다" onClick={() => bn.deleteCategory(c)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </li>
              ),
            )}
          </ul>
          <div className="cat-menu-foot">
            {edit?.kind === 'add' ? (
              editor('새 카테고리 이름', '만들기')
            ) : (
              <button className="cat-add" onClick={() => startEdit({ kind: 'add' })}>
                <Icon name="plus" size={14} />새 카테고리
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 펼친 줄은 목록 전체에서 하나만. 방금 담은 항목은 새로 들어올 때 한 번 펼친다
 * (사용자가 접은 뒤 다른 변화로 다시 열리지 않게 이미 처리한 항목은 기억한다)
 */
function useOneOpen(fresh: number | null, ids: number[]): [number | null, (id: number) => void] {
  const [openId, setOpenId] = useState<number | null>(null);
  const handled = useRef<number | null>(null);
  const hasFresh = fresh !== null && ids.includes(fresh);
  useEffect(() => {
    if (hasFresh && fresh !== handled.current) {
      handled.current = fresh;
      setOpenId(fresh);
    }
  }, [hasFresh, fresh]);
  return [openId, (id) => setOpenId((cur) => (cur === id ? null : id))];
}

/** 이 주소의 대기 항목을 카테고리별로. 담는 중인 카테고리가 맨 위, 나머지는 항목이 있는 것만 */
function CategoryList({ bn }: { bn: PinProof }) {
  const byCat = new Map<string, ItemView[]>();
  for (const v of [...bn.items].sort((a, b) => a.summary.id - b.summary.id)) {
    const list = byCat.get(v.summary.category) ?? [];
    list.push(v);
    byCat.set(v.summary.category, list);
  }
  // 목록에 없는 카테고리(지운 뒤 되돌린 항목 등)도 항목이 있으면 보인다
  const names = [...new Set([bn.category, ...bn.categories, ...byCat.keys()])].filter((n) => n === bn.category || byCat.has(n));
  const freshId = bn.items.find((v) => v.item && v.item.evidence.uid === bn.freshUid)?.summary.id ?? null;
  const [openId, toggle] = useOneOpen(
    freshId,
    bn.items.map((v) => v.summary.id),
  );
  return (
    <>
      {names.map((n) => (
        <CategorySection key={n} bn={bn} name={n} views={byCat.get(n) ?? []} openId={openId} toggle={toggle} />
      ))}
    </>
  );
}

function CategorySection(props: { bn: PinProof; name: string; views: ItemView[]; openId: number | null; toggle: (id: number) => void }) {
  const { bn, name, views } = props;
  const current = name === bn.category;
  const fresh = views.filter((v) => !v.summary.sent).length;
  return (
    <section className={`cat ${current ? 'current' : ''}`}>
      <div className="cat-head">
        {current && <span className="badge-draft">담는 중</span>}
        <span className="cat-name">{name}</span>
        <span className="count">{views.length}</span>
        {!current && (
          <button className="link" onClick={() => bn.setCategory(name)} title="페이지에서 담는 항목이 이 카테고리로 갑니다">
            여기에 담기
          </button>
        )}
        <button
          className={`btn cat-copy ${current ? 'primary' : ''}`}
          disabled={views.length === 0}
          onClick={() => bn.copyCategory(name)}
          title={
            views.length === 0
              ? '담은 항목이 없어 복사할 것이 없습니다'
              : fresh > 0
                ? '아직 넘기지 않은 항목만 담아 복사합니다'
                : '모두 넘긴 항목입니다. 대기 항목 전부를 다시 복사합니다'
          }
        >
          {fresh > 0 || views.length === 0 ? `프롬프트 복사${fresh > 0 ? ` (새 ${fresh})` : ''}` : '프롬프트 다시 복사'}
        </button>
      </div>
      {current && <PasteZone bn={bn} />}
      {views.length === 0 ? (
        current && <p className="muted small">페이지 아래 가운데 툴바의 요소·텍스트·영역·네트워크로 담으세요. 담을 때마다 번호가 붙은 항목으로 이 카테고리에 쌓입니다.</p>
      ) : (
        <div className="ev-list">
          {views.map((v) => (
            <ItemRow
              key={v.summary.id}
              bn={bn}
              view={v}
              mode="mine"
              open={props.openId === v.summary.id}
              onToggle={() => props.toggle(v.summary.id)}
            />
          ))}
        </div>
      )}
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
      여기를 클릭하고
      <br />
      스크린샷·텍스트 <kbd>Cmd</kbd> + <kbd>V</kbd>
      <br />
      ·
      <br />
      이미지 드래그 앤 드롭
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

/** 번호 배지: 페이지에 마커가 있는 항목은 하늘색으로 채우고, 마커가 없는 항목(네트워크·붙여넣기)은 테두리만 */
function Num({ id, kind }: { id: number; kind?: EvidenceKind }) {
  const onPage = kind !== 'network' && kind !== 'paste';
  return (
    <span className={`num ${onPage ? '' : 'outline'}`} title={`#${padId(id)} · ${onPage ? '페이지에 마커가 있는 항목' : '페이지 마커 없음'}`}>
      {id}
    </span>
  );
}

/** 편집용 원본이 없을 때(다른 주소·다른 브라우저에서 만든 항목) 파일 요약으로 보여줄 "무엇을 담았나" */
function summaryWhat(s: ItemSummary): string {
  const label = s.kind ? KIND_LABEL[s.kind] : '항목';
  return s.page ? `${label} ${s.page}` : label;
}

function hostOf(app?: string): string {
  return app ? app.replace(/^https?:\/\//, '') : '';
}

/**
 * 항목 한 줄. 머리는 파일 요약으로 늘 그리고, 펼친 내용은 이 브라우저에 편집용 원본이 있을 때만 자세히.
 * mine: 이 주소의 대기 항목(메모·옮기기·복사·삭제) / other: 다른 주소의 대기 항목(읽기 전용) / archived: 보관함(되돌리기·삭제)
 */
function ItemRow(props: { bn: PinProof; view: ItemView; mode: 'mine' | 'other' | 'archived'; open: boolean; onToggle: () => void }) {
  const { bn, mode, open } = props;
  const { summary: s, item } = props.view;
  const ev = item?.evidence ?? null;
  const fresh = !!ev && ev.uid === bn.freshUid;
  const [shot, setShot] = useState(false);
  /** 옮길 카테고리. 목록이 바뀌어 없어졌으면 첫 항목으로 */
  const moves = bn.categories.filter((c) => c !== s.category);
  const [picked, setMoveTo] = useState<string | null>(null);
  const moveTo = picked && moves.includes(picked) ? picked : (moves[0] ?? '');
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fresh) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [fresh]);
  const what = ev ? rowWhat(ev) : { text: summaryWhat(s) };
  const note = ev ? ev.note : s.note;
  const editable = mode === 'mine' && !!item;
  return (
    <div ref={rowRef} className={`ev item ${s.kind ?? ''} ${fresh ? 'fresh' : ''} ${open ? 'open' : ''}`}>
      <div className="ev-row">
        <button
          className="ev-head"
          aria-expanded={open}
          onClick={() => {
            if (!open && ev && mode === 'mine') bn.locate(ev);
            props.onToggle();
          }}
          title={open ? '접기' : '펼치기 · 이 페이지에 있으면 마커를 반짝입니다'}
        >
          <Num id={s.id} kind={s.kind} />
          <span className="what mono" title={what.text}>
            {what.bad !== undefined && <span className="code-bad">{what.bad || 'ERR'}</span>}
            {what.text}
          </span>
          <span className={`memo ${note ? '' : 'none'}`}>{note || '메모 없음'}</span>
          {mode !== 'mine' ? (
            <span className="tag">{s.category}</span>
          ) : (
            s.sent && (
              <span className="tag sent" title={`${s.sent.replace('T', ' ')}에 프롬프트로 넘김`}>
                넘김
              </span>
            )
          )}
        </button>
        {mode === 'mine' && (
          <button className="ev-del" onClick={() => bn.removeItem(s.id, false)} title="이 항목 삭제" aria-label="이 항목 삭제">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="ev-body">
          <div className="ev-dates">
            발견 {s.created ? shortStamp(s.created) : '—'} · {s.sent ? `넘김 ${shortStamp(s.sent)}` : '넘기기 전'}
          </div>
          {ev ? (
            <>
              <Target ev={ev} />
              {ev.kind !== 'paste' && evidenceSummary(ev) && <div className="sum">{evidenceSummary(ev)}</div>}
              {ev.kind === 'network' && (
                <details className="net">
                  <summary>
                    <Chevron />
                    호출 목록
                  </summary>
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
            </>
          ) : (
            <div className="target">
              {s.page && (
                <div className="target-page">
                  <span className="target-page-label">페이지</span>
                  <span className="mono">{s.page}</span>
                </div>
              )}
              <p className="muted small">
                {mode === 'other'
                  ? `${hostOf(s.app)} 에서 만든 항목입니다. 그 주소 탭에서 열면 고칠 수 있습니다.`
                  : `자세한 내용은 .pinproof/items/${mode === 'archived' ? 'archive/' : ''}${s.fileName} 에 있습니다.`}
              </p>
            </div>
          )}
          {editable ? (
            <textarea
              className="ev-note"
              rows={2}
              value={ev!.note}
              placeholder="메모 (선택)"
              onKeyDown={(e) => {
                // 항목 md 에 한 줄로 들어가는 메모라 Enter 로 줄을 나누지 않는다(긴 글은 칸 안에서 자동 줄바꿈)
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
              }}
              onChange={(e) => bn.updateNote(s.id, e.target.value.replace(/\s*\n\s*/g, ' '))}
            />
          ) : (
            note && ev && <div className="sum">메모 · {note}</div>
          )}
          <div className="ev-actions">
            {mode === 'mine' && ev?.selector && (
              <button className="go-page" onClick={() => bn.goTo(ev)} title="이 항목을 담은 화면으로 가서 그 요소를 찾아 반짝입니다">
                해당 페이지로 이동
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4.5 2.5h5v5M9.5 2.5L3 9" />
                </svg>
              </button>
            )}
            {mode !== 'archived' && (
              <button onClick={() => bn.copyItem(s.id)} title="이 항목만 넘기는 프롬프트 복사">
                프롬프트 복사
              </button>
            )}
            {mode === 'archived' && (
              <>
                <button onClick={() => bn.restoreItem(s.id)} title="다시 대기 항목으로">
                  되돌리기
                </button>
                <button className="danger" onClick={() => bn.removeItem(s.id, true)}>
                  삭제
                </button>
              </>
            )}
            {editable && moves.length > 0 && (
              <span className="move">
                <select className="move-to" value={moveTo} aria-label="옮길 카테고리" onChange={(e) => setMoveTo(e.target.value)}>
                  {moves.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button className="move-go" onClick={() => bn.moveItemTo(s.id, moveTo)}>
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

/**
 * 아래쪽 접힌 구역(보관함 · 다른 주소 항목 · 이전 기록). 비어 있으면 그리지 않는다.
 * 머리: [화살표 제목 개수] 가 접고 펴는 버튼, action(전체 삭제 등)은 접혀 있어도 오른쪽 끝에 보인다
 */
function Folded(props: { title: string; count: number; className?: string; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (props.count === 0) return null;
  return (
    <section className={`section ${props.className ?? ''}`}>
      <div className={`section-bar ${open ? 'open' : ''}`}>
        <button className="section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="section-title">
            <Chevron />
            {props.title}
          </span>
          <span className="count">{props.count}</span>
        </button>
        {props.action}
      </div>
      {open && props.children}
    </section>
  );
}

// ---------- 날짜 (frontmatter 의 'YYYY-MM-DDTHH:MM') ----------

/** 시각 문자열의 날짜(YYYY-MM-DD). 형식이 아니거나 없으면 null */
function dayOf(stamp?: string): string | null {
  return stamp?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const thisYear = () => String(new Date().getFullYear());

/** 펼친 줄에 보일 시각: 올해면 10/24 14:05, 아니면 2025/10/24 14:05 */
function shortStamp(stamp: string): string {
  const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!m) return stamp;
  const date = `${m[1] === thisYear() ? '' : `${m[1]}/`}${m[2]}/${m[3]}`;
  return m[4] ? `${date} ${m[4]}` : date;
}

/** 묶음 제목: 10월 26일(올해가 아니면 연도도) */
function dayLabel(day: string): string {
  const [y, mo, d] = day.split('-');
  return `${y === thisYear() ? '' : `${y}년 `}${Number(mo)}월 ${Number(d)}일`;
}

type Period = 'all' | 'today' | '7d' | '30d';
const PERIODS: [Period, string][] = [
  ['all', '전체 기간'],
  ['today', '오늘'],
  ['7d', '최근 7일'],
  ['30d', '최근 30일'],
];
const PERIOD_LABEL = Object.fromEntries(PERIODS) as Record<Period, string>;

/** 기간 안에 드는 날짜인지(오늘 포함 N일). 날짜가 없으면 기간을 고른 때는 빠진다 */
function inPeriod(day: string | null, p: Period): boolean {
  if (p === 'all') return true;
  const start = new Date();
  start.setDate(start.getDate() - (p === 'today' ? 0 : p === '7d' ? 6 : 29));
  return !!day && day >= localDay(start);
}

interface DayGroup<T> {
  /** null = 날짜 없음(넘기지 않음 등) */
  day: string | null;
  list: T[];
}

/** 날짜별로 묶는다. 최근 날짜부터, 날짜가 없는 것은 맨 뒤 하나로 */
function byDay<T>(list: T[], day: (t: T) => string | null): DayGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const t of list) {
    const k = day(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b.localeCompare(a)))
    .map(([day, list]) => ({ day, list }));
}

function DayHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="day-head">
      {label}
      <span className="count">{count}</span>
    </div>
  );
}

/** 필터 하나(작은 선택 칸). 기본값이 아니면 진하게 보여 걸려 있음을 알린다 */
function FilterSelect<T extends string>(props: { label: string; value: T; init: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select
      className={`filter-select ${props.value !== props.init ? 'on' : ''}`}
      aria-label={props.label}
      title={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
    >
      {props.options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** 필터에 맞는 것이 없을 때: 걸린 조건과 [조건 지우기] */
function FilterEmpty({ conds, onClear }: { conds: string[]; onClear: () => void }) {
  return (
    <p className="muted small filter-empty">
      {conds.join(' · ')}에 맞는 항목이 없습니다.{' '}
      <button className="link" onClick={onClear}>
        조건 지우기
      </button>
    </p>
  );
}

type Basis = 'sent' | 'created';
const BASIS_LABEL: Record<Basis, string> = { sent: '넘김일', created: '발견일' };

/**
 * 보관함: 카테고리 × 기간을 함께 거르고(교집합) 남은 항목을 날짜별로 묶는다.
 * 기간과 묶음은 같은 기준 날짜(넘김일·발견일)를 쓴다. 필터는 패널이 열려 있는 동안 유지(구역을 접어도)
 */
function Archive({ bn }: { bn: PinProof }) {
  const [cat, setCat] = useState('');
  const [basis, setBasis] = useState<Basis>('sent');
  const [period, setPeriod] = useState<Period>('all');
  const views = bn.archivedItems;
  // 보관함에 실제로 있는 카테고리만(목록 순서 먼저). 고른 카테고리의 항목이 없어지면 전체로 본다
  const cats = [...new Set([...bn.categories, ...views.map((v) => v.summary.category)])].filter((c) => views.some((v) => v.summary.category === c));
  const picked = cats.includes(cat) ? cat : '';
  const dayOfView = (v: ItemView) => dayOf(basis === 'sent' ? v.summary.sent : v.summary.created);
  const shown = views.filter((v) => (!picked || v.summary.category === picked) && inPeriod(dayOfView(v), period));
  const clear = () => {
    setCat('');
    setPeriod('all');
  };
  return (
    <Folded
      title="보관함"
      count={views.length}
      className="archive"
      action={
        <button className="btn" onClick={bn.clearArchive} title="보관함 항목을 모두 지웁니다 — 한 번 묻습니다">
          보관함 비우기
        </button>
      }
    >
      <div className="filters">
        <FilterSelect label="카테고리" value={picked} init="" options={[['', '모든 카테고리'], ...cats.map((c): [string, string] => [c, c])]} onChange={setCat} />
        <FilterSelect label="기준 날짜" value={basis} init="sent" options={Object.entries(BASIS_LABEL) as [Basis, string][]} onChange={setBasis} />
        <FilterSelect label="기간" value={period} init="all" options={PERIODS} onChange={setPeriod} />
      </div>
      <p className="muted small">
        처리 완료된 항목이 여기로 옮겨집니다. 되돌리면 다시 대기 항목이 되고, 삭제하기 전까지 <code>.pinproof/items/archive/</code>에 남습니다.
      </p>
      {shown.length === 0 ? (
        <FilterEmpty conds={[picked, period !== 'all' && `${BASIS_LABEL[basis]} ${PERIOD_LABEL[period]}`].filter((c): c is string => !!c)} onClear={clear} />
      ) : (
        <ItemGroup bn={bn} groups={byDay(shown, dayOfView)} mode="archived" empty={basis === 'sent' ? '넘기지 않음' : '날짜 없음'} />
      )}
    </Folded>
  );
}

type CleanTarget = 'archive' | 'records';

/**
 * 오른쪽 아래 [정리]: 보관함 · 이전 기록을 지운다(대기 항목은 대상이 아님).
 * 기간(시작일 ~ 종료일, 양 끝 포함)은 고를 수도 있다: 비우면 전부, 한쪽만 고르면 그날부터 / 그날까지.
 * 보관함은 넘김일·발견일, 이전 기록은 만든 날짜 기준. 날짜를 하나라도 고르면 날짜가 없는 항목은 빠진다.
 * 종료일이 시작일보다 앞서면 경고하고 지우지 않는다.
 * 보관함은 카테고리를 여러 개 고를 수 있다(처음엔 모두 켜짐, 끈 것만 빠짐).
 * 바깥 클릭·Esc 로 닫고(Esc 는 버튼으로 포커스), 지우면 닫는다(확인을 취소하면 그대로). 닫으면 기간도 비운다
 */
function Cleanup({ bn }: { bn: PinProof }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CleanTarget>('archive');
  const [basis, setBasis] = useState<Basis>('sent');
  /** 지울 기간(YYYY-MM-DD). 비우면 그쪽 끝이 열린다 */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** 끈 카테고리(보관함). 새로 생긴 카테고리는 기본으로 포함되게 켠 것이 아니라 끈 것을 기억한다 */
  const [off, setOff] = useState<Set<string>>(new Set());
  /** 지우는 중에는 삭제 버튼을 꺼서 두 번 지우지 않게 */
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (focusTrigger = false) => {
    setOpen(false);
    setFrom('');
    setTo('');
    setOff(new Set());
    if (focusTrigger) trigger.current?.focus();
  };
  // 바깥을 누르면 닫고, Esc 는 포커스가 어디 있든 닫는다(버튼으로 포커스)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const targets: [CleanTarget, string][] = [];
  if (bn.archivedItems.length) targets.push(['archive', '보관함']);
  if (bn.records.length) targets.push(['records', '이전 기록']);
  // 고른 곳이 비면 남은 곳으로
  const cur = targets.some(([t]) => t === target) ? target : targets[0][0];
  const archived = bn.archivedItems.map((v) => v.summary);
  // 보관함에 실제로 있는 카테고리(목록 순서 먼저)
  const cats = [...new Set([...bn.categories, ...archived.map((s) => s.category)])].filter((c) => archived.some((s) => s.category === c));
  const onCats = cats.filter((c) => !off.has(c));
  const toggleCat = (c: string) =>
    setOff((o) => {
      const n = new Set(o);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const dayOfItem = (s: ItemSummary) => dayOf(basis === 'sent' ? s.sent : s.created);
  const ranged = !!from || !!to;
  /** 종료일이 시작일보다 앞섬(같은 날은 그 하루) */
  const reversed = !!from && !!to && to < from;
  const inRange = (day: string | null) => !reversed && (!ranged || (!!day && (!from || day >= from) && (!to || day <= to)));
  const inCats = archived.filter((s) => !off.has(s.category));
  const items = cur === 'archive' ? inCats.filter((s) => inRange(dayOfItem(s))) : [];
  const recs = cur === 'records' ? bn.records.filter((r) => inRange(dayOf(r.created))) : [];
  const count = items.length + recs.length;
  const undated = cur === 'archive' ? inCats.filter((s) => !dayOfItem(s)).length : bn.records.filter((r) => !dayOf(r.created)).length;
  const span =
    from && to ? `${dayLabel(from)} ~ ${dayLabel(to)}` : from ? `${dayLabel(from)}부터` : to ? `${dayLabel(to)}까지` : '';
  /** 확인 창 앞머리: 넘김일 기준 9월 1일 ~ 10월 26일 / 전체 기간 */
  const scope = ranged ? `${cur === 'archive' ? BASIS_LABEL[basis] : '만든 날짜'} 기준 ${span}` : '전체 기간';

  const remove = async () => {
    setBusy(true);
    const done =
      cur === 'archive'
        ? await bn.removeArchived(
            items,
            `${scope} 보관함 항목 ${count}개${onCats.length < cats.length ? `(${onCats.join(', ')})` : ''}를 삭제할까요?`,
          )
        : await bn.removeRecords(recs, `${scope} 이전 기록 ${count}개를 삭제할까요?`);
    setBusy(false);
    if (done) close(true);
  };

  return (
    <div className="cleanup" ref={root}>
      <button
        ref={trigger}
        className="cleanup-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="보관함 · 이전 기록을 지웁니다(기간 · 카테고리로 좁힐 수 있음)"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="trash" size={14} />
        정리
      </button>
      {/* 버튼 뒤에 두어 Tab 이 버튼에서 창으로 이어진다(화면에서는 버튼 위에 뜸) */}
      {open && (
        <div className="cleanup-pop" role="dialog" aria-label="기간으로 정리">
          <div className="cleanup-title">기간으로 정리</div>
          <div className="filters">
            <FilterSelect label="정리할 곳" value={cur} init={cur} options={targets} onChange={setTarget} />
            {cur === 'archive' ? (
              <FilterSelect label="기준 날짜" value={basis} init={basis} options={Object.entries(BASIS_LABEL) as [Basis, string][]} onChange={setBasis} />
            ) : (
              <span className="filter-label">만든 날짜 기준</span>
            )}
          </div>
          {cur === 'archive' && cats.length > 1 && (
            <div className="cleanup-cats" role="group" aria-label="카테고리">
              {cats.map((c) => (
                <button key={c} className="chip" aria-pressed={!off.has(c)} title={c} onClick={() => toggleCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="cleanup-range">
            <input type="date" className="filter-select" aria-label="시작일 (선택)" aria-invalid={reversed} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="filter-label">~</span>
            <input type="date" className="filter-select" aria-label="종료일 (선택)" aria-invalid={reversed} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {reversed ? (
            <p className="cleanup-warn" role="alert">
              종료일이 시작일보다 앞섭니다. 기간을 다시 고르세요
            </p>
          ) : (
            <p className="cleanup-note" role="status">
              {cur === 'archive' && onCats.length === 0
                ? '카테고리를 하나 이상 고르세요'
                : ranged
                  ? `이 기간에 ${count}건`
                  : `기간을 고르지 않아 전체 ${count}건`}
              {ranged && undated > 0 && ` · ${cur === 'archive' && basis === 'sent' ? '넘기지 않은' : '날짜 없는'} ${undated}건은 기간에 들지 않습니다`}
            </p>
          )}
          <button className="btn primary" disabled={count === 0 || busy} onClick={remove}>
            {count ? `${count}건 삭제` : '삭제'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 보관함·다른 주소 항목처럼 대기 목록 밖의 항목들. 묶음마다 번호 내림차순, 펼치기는 전체에서 하나만.
 * empty(날짜 없는 묶음의 제목)를 주면 묶음마다 제목을 단다(보관함). 없으면 목록만(다른 주소 항목)
 */
function ItemGroup(props: { bn: PinProof; groups: DayGroup<ItemView>[]; mode: 'other' | 'archived'; empty?: string }) {
  const { bn, groups, mode } = props;
  const [openId, toggle] = useOneOpen(
    null,
    groups.flatMap((g) => g.list.map((v) => v.summary.id)),
  );
  return (
    <>
      {groups.map((g) => (
        <Fragment key={g.day ?? '-'}>
          {props.empty && <DayHead label={g.day ? dayLabel(g.day) : props.empty} count={g.list.length} />}
          <div className="ev-list">
            {[...g.list]
              .sort((a, b) => b.summary.id - a.summary.id)
              .map((v) => (
                <ItemRow key={v.summary.id} bn={bn} view={v} mode={mode} open={openId === v.summary.id} onToggle={() => toggle(v.summary.id)} />
              ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}

/** 카테고리 이전의 기록(이슈 단위). 읽기 전용: 프롬프트 복사 · 보관 · 삭제만. 만든 날짜로 기간을 거르고 날짜별로 묶는다 */
function OldRecords({ bn }: { bn: PinProof }) {
  const [period, setPeriod] = useState<Period>('all');
  const shown = bn.records.filter((r) => inPeriod(dayOf(r.created), period));
  return (
    <Folded
      title="이전 기록"
      count={bn.records.length}
      className="records"
      action={
        <button className="btn" onClick={bn.clearRecords} title="이전 기록을 보관한 것까지 모두 지웁니다 — 한 번 묻습니다">
          이전 기록 모두 삭제
        </button>
      }
    >
      <div className="filters">
        <span className="filter-label">만든 날짜</span>
        <FilterSelect label="기간(만든 날짜)" value={period} init="all" options={PERIODS} onChange={setPeriod} />
      </div>
      <p className="muted small">카테고리로 바뀌기 전의 기록입니다. 읽기만 되고, 새 항목은 위 카테고리에 쌓입니다.</p>
      {shown.length === 0 ? (
        <FilterEmpty conds={[`만든 날짜 ${PERIOD_LABEL[period]}`]} onClear={() => setPeriod('all')} />
      ) : (
        byDay(shown, (r) => dayOf(r.created)).map((g) => (
          <Fragment key={g.day ?? '-'}>
            <DayHead label={g.day ? dayLabel(g.day) : '날짜 없음'} count={g.list.length} />
            {[...g.list]
              .sort((a, b) => Number(a.archived) - Number(b.archived) || b.id - a.id)
              .map((r) => (
                <RecordRow key={`${r.archived}-${r.id}`} r={r} bn={bn} />
              ))}
          </Fragment>
        ))
      )}
    </Folded>
  );
}

function RecordRow({ r, bn }: { r: RecordSummary; bn: PinProof }) {
  const other = !!r.app && r.app !== bn.origin;
  return (
    <div className={`rec ${other ? 'other' : ''}`}>
      <div className="rec-main">
        <span className="mono strong">#{padId(r.id)}</span>
        <span className="rec-title">{r.title || '(제목 없음)'}</span>
        <span className="rec-meta">
          {r.type} · 증거 {r.evidenceCount}
          {r.archived && ' · 보관함'}
          {r.hasResult && <span className="done"> · 처리 기록 있음</span>}
          {other && <span className="mono"> · {hostOf(r.app)}</span>}
        </span>
      </div>
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
