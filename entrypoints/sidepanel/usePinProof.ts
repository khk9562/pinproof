import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectFolder, isSupportedUrl, routeOf } from '@/lib/connect';
import * as db from '@/lib/db';
import { archiveRecord, deleteRecord, ensurePermission, hasLegacy, listRecords, migrateLegacy, nextRecordId, updateWorkflow, workflowStatus, writeRecord } from '@/lib/fs';
import type { WorkflowStatus } from '@/lib/fs';
import { copyPrompt, letterFor, padId, pagePath, recordFileName, sameTarget } from '@/lib/markdown';
import { EvidenceEdit, MarkerInfo, OverlayState, PANEL_PORT, PortToContent, ToContent, ToPanel } from '@/lib/messages';
import { evidenceFromTransfer } from '@/lib/paste';
import { BugRecord, Evidence, RecordSummary } from '@/lib/types';

export type Connection = 'none' | 'prompt' | 'granted';

const params = new URLSearchParams(location.search);
/** e2e 테스트용: ?tab=<id> 로 대상 탭 고정, ?opfs=1 로 폴더 대신 OPFS 사용 */
const FIXED_TAB = params.get('tab') ? Number(params.get('tab')) : null;
const USE_OPFS = params.get('opfs') === '1';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 지우거나 옮긴 뒤 A부터 순서대로 다시 매긴다(스크린샷 파일명도 다음 저장 때 맞춰짐) */
function relabel(evidence: Evidence[]): Evidence[] {
  return evidence.map((e, i) => ({ ...e, letter: letterFor(i) }));
}

function nextLetter(evidence: Evidence[]): string {
  let max = -1;
  for (const e of evidence) {
    if (!e.letter) continue;
    let n = 0;
    for (const ch of e.letter) n = n * 26 + (ch.charCodeAt(0) - 64);
    max = Math.max(max, n - 1);
  }
  return letterFor(max + 1);
}

/** 페이지 위 마커로 보여줄 증거(위치가 있는 것만) */
function markerOf(e: Evidence): MarkerInfo | null {
  if (e.kind === 'network' || e.kind === 'paste') return null;
  const c = e.component;
  return {
    uid: e.uid,
    letter: e.letter,
    kind: e.kind,
    page: pagePath(e.url),
    note: e.note,
    selector: e.selector,
    anchor: e.anchor,
    label: e.label,
    tag: e.tag,
    quote: e.quote?.exact,
    rect: e.rect ? { width: e.rect.width, height: e.rect.height } : undefined,
    component: c?.chain.length ? c.chain.slice(0, 3).join(' › ') : undefined,
    source: c?.source ? `${c.source}${c.sourceApprox ? ' 근처' : ''}` : undefined,
  };
}

function overlayStateOf(draft: BugRecord | null, inbox: Evidence[]): OverlayState {
  const markers: MarkerInfo[] = [];
  for (const e of [...(draft?.evidence ?? []), ...inbox]) {
    const m = markerOf(e);
    if (m) markers.push(m);
  }
  return {
    record: draft ? { id: draft.id, title: draft.title, count: draft.evidence.length } : null,
    nextLetter: draft ? nextLetter(draft.evidence) : null,
    inboxCount: inbox.length,
    markers,
  };
}

export function usePinProof() {
  const [tabId, setTabId] = useState<number | null>(FIXED_TAB);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [connection, setConnection] = useState<Connection>('none');
  const [folderName, setFolderName] = useState('');
  const [draft, setDraft] = useState<BugRecord | null>(null);
  const [inbox, setInbox] = useState<Evidence[]>([]);
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null);
  /** 방금 담은 증거. 패널에서 강조해 무엇이 담겼는지 보여준다 */
  const [freshUid, setFreshUid] = useState<string | null>(null);
  /** 프로젝트의 WORKFLOW.md가 옛 버전이면 [업데이트] 버튼을 보여준다 */
  const [workflow, setWorkflow] = useState<WorkflowStatus | null>(null);
  /** 이전 이름(BugNotes)의 .bugnotes/ 폴더가 남아 있으면 [옮기기] 버튼을 보여준다 */
  const [legacy, setLegacy] = useState(false);

  const origin = isSupportedUrl(tabUrl) ? new URL(tabUrl).origin : null;
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const draftRef = useRef<BugRecord | null>(null);
  const writeTimer = useRef<number | undefined>(undefined);
  const pendingFlash = useRef<{ url: string; selector: string; uid: string } | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  draftRef.current = draft;
  const overlayState = useMemo(() => overlayStateOf(draft, inbox), [draft, inbox]);
  const overlayRef = useRef(overlayState);
  overlayRef.current = overlayState;

  const say = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3500);
  }, []);

  // ---------- 대상 탭 추적 ----------
  useEffect(() => {
    const refresh = async () => {
      if (FIXED_TAB !== null) {
        const t = await chrome.tabs.get(FIXED_TAB);
        setTabUrl(t.url ?? '');
        return;
      }
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (t?.id !== undefined) {
        setTabId(t.id);
        setTabUrl(t.url ?? '');
      }
    };
    refresh();
    const onActivated = () => refresh();
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.url !== undefined || info.status === 'complete') {
        if (FIXED_TAB === null || id === FIXED_TAB) refresh();
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  const toContent = useCallback(
    async <T = unknown,>(msg: ToContent): Promise<T | null> => {
      if (tabId === null) return null;
      try {
        return (await chrome.tabs.sendMessage(tabId, msg)) as T;
      } catch {
        return null;
      }
    },
    [tabId],
  );

  // ---------- 페이지 위 툴바·마커 (포트) ----------
  /** 패널이 열려 있는 동안 그 탭의 content script 와 포트를 잇는다. 끊기면 페이지의 툴바·마커가 사라진다 */
  /** 상태를 보낸다. 포트가 이미 끊겼으면 false */
  const postState = useCallback((port: chrome.runtime.Port): boolean => {
    try {
      port.postMessage({ type: 'bn:state', state: overlayRef.current } satisfies PortToContent);
      return true;
    } catch {
      if (portRef.current === port) portRef.current = null;
      return false;
    }
  }, []);

  const connectPort = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
    if (tabId === null || !origin) return;
    try {
      const port = chrome.tabs.connect(tabId, { name: PANEL_PORT });
      portRef.current = port;
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (portRef.current === port) portRef.current = null;
      });
      postState(port);
    } catch {
      portRef.current = null;
    }
  }, [tabId, origin, postState]);

  useEffect(() => {
    connectPort();
    return () => {
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, [connectPort]);

  useEffect(() => {
    if (portRef.current) postState(portRef.current);
  }, [overlayState, postState]);

  // ---------- 앱(origin)별 상태 로드 ----------
  const refreshRecords = useCallback(async () => {
    const h = handleRef.current;
    if (!h || !(await ensurePermission(h, false))) return;
    try {
      setRecords(await listRecords(h));
      setWorkflow(await workflowStatus(h));
      setLegacy(await hasLegacy(h));
    } catch (e) {
      say(`기록 목록을 읽지 못했습니다: ${String(e)}`, 'warn');
    }
  }, [say]);

  const loadOrigin = useCallback(async () => {
    handleRef.current = null;
    setWorkflow(null);
    setLegacy(false);
    setConnection('none');
    setFolderName('');
    setDraft(null);
    setInbox([]);
    setRecords([]);
    if (!origin) return;
    const h = await db.getHandle(origin);
    if (h) {
      handleRef.current = h;
      setFolderName(h.name);
      setConnection((await ensurePermission(h, false)) ? 'granted' : 'prompt');
    }
    setInbox(await db.listInbox(origin));
    const draftId = await db.getDraftId(origin);
    if (draftId !== undefined) setDraft((await db.getRecordModel(origin, draftId)) ?? null);
  }, [origin]);

  useEffect(() => {
    loadOrigin();
  }, [loadOrigin]);

  useEffect(() => {
    if (connection !== 'granted') return;
    refreshRecords();
    // Claude가 처리 기록을 덧붙였는지 반영하기 위해 주기적으로 다시 읽는다
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshRecords();
    }, 5000);
    return () => window.clearInterval(t);
  }, [connection, refreshRecords]);

  // ---------- 저장 ----------
  const persistNow = useCallback(
    async (record: BugRecord) => {
      if (!origin) return;
      await db.setRecordModel(origin, record);
      const h = handleRef.current;
      if (h && (await ensurePermission(h, false))) {
        try {
          await writeRecord(h, { ...record, updated: nowStamp() });
          refreshRecords();
        } catch (e) {
          say(`파일 저장 실패: ${String(e)}`, 'warn');
        }
      } else {
        setConnection(h ? 'prompt' : 'none');
      }
    },
    [origin, refreshRecords, say],
  );

  /** 입력 중에는 IDB만 즉시, 파일은 잠시 모았다가 쓴다 */
  const saveDraft = useCallback(
    (record: BugRecord, immediate = false) => {
      // 연달아 담을 때(붙여넣기 여러 장 등) 다음 호출이 최신 기록을 보도록 즉시 갱신
      draftRef.current = record;
      setDraft(record);
      window.clearTimeout(writeTimer.current);
      if (immediate) persistNow(record);
      else {
        if (origin) db.setRecordModel(origin, record);
        writeTimer.current = window.setTimeout(() => persistNow(record), 600);
      }
    },
    [origin, persistNow],
  );

  // ---------- content script 메시지 ----------
  const onCaptured = useCallback(
    async (evidence: Evidence) => {
      if (!origin) return;
      const d = draftRef.current;
      // 같은 기록(또는 미분류)에 이미 있는 대상이면 새로 담지 않고 기존 카드를 가리킨다
      const existing = (d ? d.evidence : await db.listInbox(origin)).find((e) => sameTarget(e, evidence));
      if (existing) {
        setFreshUid(null);
        window.setTimeout(() => setFreshUid(existing.uid), 0);
        say(existing.letter ? `이미 ${existing.letter}(으)로 담은 요소입니다.` : '이미 미분류에 담은 요소입니다.', 'warn');
        return;
      }
      setFreshUid(evidence.uid);
      if (d) {
        const ev = { ...evidence, letter: nextLetter(d.evidence) };
        saveDraft({ ...d, evidence: [...d.evidence, ev] }, true);
      } else {
        await db.addInbox(origin, evidence);
        setInbox(await db.listInbox(origin));
      }
    },
    [origin, saveDraft, say],
  );

  /** 페이지 위 편집 팝오버에서 고친 내용 반영 (함수들이 아래에 있어 ref 로 최신을 부른다) */
  const editRef = useRef<(uid: string, edit: EvidenceEdit) => void>(() => {});
  const onEdit = useCallback((uid: string, edit: EvidenceEdit) => editRef.current(uid, edit), []);

  useEffect(() => {
    const listener = (msg: ToPanel, sender: chrome.runtime.MessageSender, sendResponse: (r?: unknown) => void) => {
      if (sender.tab?.id !== tabId) return;
      if (msg.type === 'bn:captured') {
        onCaptured(msg.evidence);
        sendResponse({ ok: true });
      } else if (msg.type === 'bn:mode') {
        sendResponse({ ok: true });
      } else if (msg.type === 'bn:edit') {
        onEdit(msg.uid, msg.edit);
        sendResponse({ ok: true });
      } else if (msg.type === 'bn:hello') {
        setTabUrl(msg.url);
        // 페이지를 새로 읽으면 content script 가 새로 뜨므로 포트를 다시 잇는다
        if (!portRef.current || !postState(portRef.current)) connectPort();
        const pf = pendingFlash.current;
        if (pf && msg.url === pf.url) {
          pendingFlash.current = null;
          window.setTimeout(() => toContent({ type: 'bn:flash', selector: pf.selector, uid: pf.uid }), 700);
        }
        sendResponse({ ok: true });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [tabId, onCaptured, onEdit, toContent, connectPort, postState]);

  // ---------- 폴더 연결 ----------
  const connect = useCallback(async () => {
    if (!origin) return;
    let root: FileSystemDirectoryHandle;
    try {
      root = USE_OPFS
        ? await navigator.storage.getDirectory()
        : await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
            mode: 'readwrite',
            id: 'pinproof-project',
          });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'AbortError') return;
      // 사이드 패널에서 폴더 선택이 막히는 환경이면 익스텐션 탭에서 대신 고른다
      await chrome.tabs.create({ url: chrome.runtime.getURL(`/connect.html?origin=${encodeURIComponent(origin)}`) });
      return;
    }
    const ok = await connectFolder(origin, root, (items, folder) =>
      USE_OPFS ? true : window.confirm(`"${folder}" 폴더에 다음 작업을 합니다.\n\n- ${items.join('\n- ')}\n\n계속할까요?`),
    );
    if (ok) {
      await loadOrigin();
      say(`"${root.name}" 폴더에 연결했습니다.`);
      if (draftRef.current) persistNow(draftRef.current);
    }
  }, [origin, loadOrigin, persistNow, say]);

  const reconnect = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    if (await ensurePermission(h, true)) {
      setConnection('granted');
      if (draftRef.current) persistNow(draftRef.current);
    }
  }, [persistNow]);

  const upgradeWorkflow = useCallback(async () => {
    const h = handleRef.current;
    if (!h || !workflow) return;
    const ok = window.confirm(
      `.pinproof/WORKFLOW.md 를 v${workflow.current} → v${workflow.latest} 로 교체합니다.\n\n이 파일을 직접 고친 적이 있다면 그 내용은 사라집니다. 프로젝트별 규칙은 .pinproof/WORKFLOW.local.md 에 따로 적어두세요(익스텐션이 건드리지 않습니다).\n\n계속할까요?`,
    );
    if (!ok) return;
    try {
      await updateWorkflow(h);
      setWorkflow(await workflowStatus(h));
      say(`처리 절차를 v${workflow.latest}로 업데이트했습니다.`);
    } catch (e) {
      say(`업데이트 실패: ${String(e)}`, 'warn');
    }
  }, [workflow, say]);

  const moveLegacy = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    const ok = window.confirm(
      '이전 이름(BugNotes)의 .bugnotes/ 폴더를 .pinproof/ 로 옮깁니다.\n\n- 기록·스크린샷·보관함 복사 (이미 있는 파일은 덮어쓰지 않음)\n- 모두 옮기면 .bugnotes/ 와 이전 커맨드 /bugnotes 삭제, .git/info/exclude 에 .pinproof/ 추가\n\n계속할까요?',
    );
    if (!ok) return;
    try {
      const { skipped } = await migrateLegacy(h);
      await refreshRecords();
      if (skipped.length) say(`번호가 겹치는 기록(${skipped.map((n) => `#${padId(n)}`).join(', ')})은 옮기지 않았습니다. .bugnotes/ 에 남아 있습니다.`, 'warn');
      else say('.bugnotes/ 를 .pinproof/ 로 옮겼습니다. 커맨드는 이제 /pinproof 입니다.');
    } catch (e) {
      say(`옮기기 실패: ${String(e)}`, 'warn');
    }
  }, [refreshRecords, say]);

  const disconnect = useCallback(async () => {
    if (!origin) return;
    await db.removeHandle(origin);
    await loadOrigin();
  }, [origin, loadOrigin]);

  // connect.html 탭에서 연결을 마치면 다시 읽는다
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.lastConnected) loadOrigin();
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, [loadOrigin]);

  // ---------- 기록 건 ----------
  const newRecord = useCallback(async () => {
    if (!origin) return;
    const h = handleRef.current;
    if (!h || !(await ensurePermission(h, false))) {
      say('먼저 프로젝트 폴더를 연결해주세요.', 'warn');
      return;
    }
    const id = await nextRecordId(h);
    const record: BugRecord = {
      id,
      title: '',
      type: '버그',
      related: '',
      memo: '',
      created: nowStamp(),
      app: origin,
      evidence: [],
    };
    await db.setDraftId(origin, id);
    saveDraft(record, true);
  }, [origin, saveDraft, say]);

  const updateDraft = useCallback(
    (patch: Partial<BugRecord>) => {
      const d = draftRef.current;
      if (d) saveDraft({ ...d, ...patch });
    },
    [saveDraft],
  );

  const finishDraft = useCallback(async () => {
    if (!origin) return;
    const d = draftRef.current;
    if (d) {
      window.clearTimeout(writeTimer.current);
      await persistNow(d);
    }
    await db.setDraftId(origin, null);
    setDraft(null);
  }, [origin, persistNow]);

  const openRecord = useCallback(
    async (summary: RecordSummary) => {
      if (!origin || summary.archived) return;
      const model = await db.getRecordModel(origin, summary.id);
      if (!model) {
        say('이 브라우저에서 만든 기록만 다시 열어 편집할 수 있습니다.', 'warn');
        return;
      }
      if (draftRef.current) await finishDraft();
      await db.setDraftId(origin, summary.id);
      setDraft(model);
    },
    [origin, finishDraft, say],
  );

  // ---------- 증거 ----------
  const updateEvidence = useCallback(
    (uid: string, patch: Partial<Evidence>) => {
      const d = draftRef.current;
      if (d) saveDraft({ ...d, evidence: d.evidence.map((e) => (e.uid === uid ? { ...e, ...patch } : e)) });
    },
    [saveDraft],
  );

  const removeEvidence = useCallback(
    (uid: string) => {
      const d = draftRef.current;
      if (d) saveDraft({ ...d, evidence: relabel(d.evidence.filter((e) => e.uid !== uid)) }, true);
    },
    [saveDraft],
  );

  const evidenceToInbox = useCallback(
    async (uid: string) => {
      const d = draftRef.current;
      if (!d || !origin) return;
      const ev = d.evidence.find((e) => e.uid === uid);
      if (!ev) return;
      await db.addInbox(origin, { ...ev, letter: undefined });
      setInbox(await db.listInbox(origin));
      saveDraft({ ...d, evidence: relabel(d.evidence.filter((e) => e.uid !== uid)) }, true);
    },
    [origin, saveDraft],
  );

  const inboxToDraft = useCallback(
    async (uid: string) => {
      const d = draftRef.current;
      if (!origin) return;
      if (!d) {
        say('먼저 [새 기록]을 만들거나 기록을 열어주세요.', 'warn');
        return;
      }
      const ev = inbox.find((e) => e.uid === uid);
      if (!ev) return;
      const existing = d.evidence.find((e) => sameTarget(e, ev));
      if (existing) {
        setFreshUid(existing.uid);
        say(`작성 중인 기록에 이미 ${existing.letter}(으)로 담긴 요소입니다.`, 'warn');
        return;
      }
      await db.removeInbox(uid);
      setInbox(await db.listInbox(origin));
      saveDraft({ ...d, evidence: [...d.evidence, { ...ev, letter: nextLetter(d.evidence) }] }, true);
    },
    [origin, inbox, saveDraft, say],
  );

  const removeInbox = useCallback(
    async (uid: string) => {
      if (!origin) return;
      await db.removeInbox(uid);
      setInbox(await db.listInbox(origin));
    },
    [origin],
  );

  const setInboxNote = useCallback(
    async (uid: string, note: string) => {
      if (!origin) return;
      const ev = inbox.find((e) => e.uid === uid);
      if (!ev) return;
      await db.addInbox(origin, { ...ev, note });
      setInbox((list) => list.map((e) => (e.uid === uid ? { ...e, note } : e)));
    },
    [origin, inbox],
  );

  /** 클립보드 붙여넣기·끌어다 놓기로 받은 이미지/텍스트를 증거로 담는다 */
  const addPasted = useCallback(
    async (dt: DataTransfer) => {
      if (!tabUrl || !isSupportedUrl(tabUrl)) return;
      const items = await evidenceFromTransfer(dt, { url: tabUrl, route: routeOf(tabUrl) });
      if (items.length === 0) {
        say('붙여넣을 이미지나 텍스트가 없습니다.', 'warn');
        return;
      }
      for (const ev of items) await onCaptured(ev);
      say(`붙여넣은 자료 ${items.length}개를 담았습니다.`);
    },
    [tabUrl, onCaptured, say],
  );

  const goTo = useCallback(
    async (ev: Evidence) => {
      if (tabId === null || !ev.selector) {
        if (tabId !== null && ev.url !== tabUrl) await chrome.tabs.update(tabId, { url: ev.url });
        return;
      }
      if (ev.url === tabUrl) {
        const res = await toContent<{ found: boolean }>({ type: 'bn:flash', selector: ev.selector, uid: ev.uid });
        if (!res) say('이 탭에서 요소를 찾지 못했습니다.', 'warn');
        return;
      }
      pendingFlash.current = { url: ev.url, selector: ev.selector, uid: ev.uid };
      await chrome.tabs.update(tabId, { url: ev.url });
    },
    [tabId, tabUrl, toContent, say],
  );

  /** 목록에서 고른 증거가 지금 페이지(주소 전체가 같은 화면)에 있으면 그 마커를 반짝인다 */
  const locate = useCallback(
    (ev: Evidence) => {
      if (!ev.selector || !tabUrl || pagePath(ev.url) !== pagePath(tabUrl)) return;
      toContent({ type: 'bn:flash', selector: ev.selector, uid: ev.uid });
    },
    [tabUrl, toContent],
  );

  editRef.current = (uid, edit) => {
    const inDraft = !!draftRef.current?.evidence.some((e) => e.uid === uid);
    if (edit.action === 'note') {
      if (inDraft) updateEvidence(uid, { note: edit.note });
      else setInboxNote(uid, edit.note);
    } else if (edit.action === 'delete') {
      if (inDraft) removeEvidence(uid);
      else removeInbox(uid);
    } else if (inDraft) evidenceToInbox(uid);
    else inboxToDraft(uid);
  };

  // ---------- 목록 ----------
  const copyRecord = useCallback(
    async (fileName: string, archived = false) => {
      await navigator.clipboard.writeText(copyPrompt(fileName, archived));
      say('프롬프트를 복사했습니다.');
    },
    [say],
  );

  const copyDraft = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    window.clearTimeout(writeTimer.current);
    await persistNow(d);
    await copyRecord(recordFileName(d));
  }, [persistNow, copyRecord]);

  const archive = useCallback(
    async (summary: RecordSummary) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      try {
        if (!summary.archived && draftRef.current?.id === summary.id) {
          await db.setDraftId(origin, null);
          setDraft(null);
        }
        await archiveRecord(h, summary.id, summary.archived);
        await refreshRecords();
        say(summary.archived ? `#${summary.id} 를 되돌렸습니다.` : `#${summary.id} 를 보관했습니다.`);
      } catch (e) {
        say(String(e), 'warn');
      }
    },
    [origin, refreshRecords, say],
  );

  /** 기록 삭제(되돌릴 수 없음). 작성 중인 기록이면 작성도 끝낸다 */
  const removeRecord = useCallback(
    async (id: number, title: string, archived: boolean) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      const label = `#${padId(id)} "${title || '제목 없음'}"`;
      const ok = window.confirm(`${label} 기록을 삭제할까요?\n\nmd 파일과 스크린샷이 프로젝트 폴더에서 지워지며 되돌릴 수 없습니다.\n(나중에 다시 볼 수도 있다면 [보관]을 쓰세요)`);
      if (!ok) return;
      try {
        if (draftRef.current?.id === id) {
          window.clearTimeout(writeTimer.current);
          await db.setDraftId(origin, null);
          setDraft(null);
        }
        await deleteRecord(h, id, archived);
        await db.deleteRecordModel(origin, id);
        await refreshRecords();
        say(`${label} 기록을 삭제했습니다.`);
      } catch (e) {
        say(String(e), 'warn');
      }
    },
    [origin, refreshRecords, say],
  );

  return {
    removeRecord,
    tabUrl,
    origin,
    connection,
    folderName,
    draft,
    inbox,
    records,
    notice,
    freshUid,
    workflow,
    upgradeWorkflow,
    legacy,
    moveLegacy,
    connect,
    reconnect,
    disconnect,
    newRecord,
    updateDraft,
    finishDraft,
    openRecord,
    updateEvidence,
    removeEvidence,
    evidenceToInbox,
    inboxToDraft,
    removeInbox,
    setInboxNote,
    addPasted,
    goTo,
    locate,
    copyRecord,
    copyDraft,
    archive,
  };
}

export type PinProof = ReturnType<typeof usePinProof>;
