import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectFolder, isSupportedUrl, routeOf, sitePattern } from '@/lib/connect';
import * as db from '@/lib/db';
import {
  archiveRecord,
  deleteItem,
  deleteRecord,
  ensurePermission,
  hasLegacy,
  listItems,
  listRecords,
  migrateLegacy,
  moveItem,
  nextItemId,
  readCategories,
  updateWorkflow,
  workflowStatus,
  writeCategories,
  writeItem,
} from '@/lib/fs';
import type { WorkflowStatus } from '@/lib/fs';
import { copyPrompt, itemFileName, itemsPrompt, padId, pagePath, sameTarget } from '@/lib/markdown';
import { EvidenceEdit, MarkerInfo, OverlayState, PANEL_PORT, PortToContent, ToContent, ToPanel } from '@/lib/messages';
import { evidenceFromTransfer } from '@/lib/paste';
import { DEFAULT_CATEGORY, Evidence, Item, ItemSummary, RecordSummary } from '@/lib/types';

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

/** 패널에 보이는 항목: 파일 요약(상태·넘김·처리 기록) + 이 브라우저의 편집용 원본(증거 전체, 다른 주소면 없음) */
export interface ItemView {
  summary: ItemSummary;
  item: Item | null;
}

/** 페이지 위 마커로 보여줄 항목(위치가 있는 증거만) */
function markerOf(item: Item): MarkerInfo | null {
  const e = item.evidence;
  if (e.kind === 'network' || e.kind === 'paste') return null;
  const c = e.component;
  return {
    uid: e.uid,
    num: item.id,
    category: item.category,
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

export function usePinProof() {
  const [tabId, setTabId] = useState<number | null>(FIXED_TAB);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [connection, setConnection] = useState<Connection>('none');
  const [folderName, setFolderName] = useState('');
  /** 옛 기록(이슈 단위, 읽기 전용) */
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([DEFAULT_CATEGORY]);
  /** 지금 담을 카테고리(앱별) */
  const [category, setCategoryState] = useState<string>(DEFAULT_CATEGORY);
  const [summaries, setSummaries] = useState<ItemSummary[]>([]);
  const [models, setModels] = useState<Map<number, Item>>(new Map());
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null);
  /** 방금 담은 증거(uid). 패널에서 그 항목을 펼쳐 보여준다 */
  const [freshUid, setFreshUid] = useState<string | null>(null);
  /** 프로젝트의 WORKFLOW.md가 옛 버전이면 [업데이트] 버튼을 보여준다 */
  const [workflow, setWorkflow] = useState<WorkflowStatus | null>(null);
  /** 이전 이름(BugNotes)의 .bugnotes/ 폴더가 남아 있으면 [옮기기] 버튼을 보여준다 */
  const [legacy, setLegacy] = useState(false);

  /** localhost 가 아닌 탭에서, 사용자가 이 사이트를 켜 두었는지 */
  const [siteAllowed, setSiteAllowed] = useState(false);
  const local = isSupportedUrl(tabUrl);
  const pattern = local ? null : sitePattern(tabUrl);
  const origin = local || (pattern && siteAllowed) ? new URL(tabUrl).origin : null;
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const modelsRef = useRef(models);
  modelsRef.current = models;
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const noteTimers = useRef(new Map<number, number>());
  /** 항목을 연달아 만들 때 번호가 겹치지 않게 차례로 */
  const creating = useRef<Promise<unknown>>(Promise.resolve());
  const pendingFlash = useRef<{ url: string; selector: string; uid: string } | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  /** 패널 목록: 이 주소에서 만든 대기 항목 / 다른 주소의 대기 항목(읽기 전용) / 보관함 */
  const views = useMemo(() => {
    const view = (s: ItemSummary): ItemView => ({ summary: s, item: s.app === origin ? (models.get(s.id) ?? null) : null });
    const mine = summaries.filter((s) => !s.archived && s.app === origin).map(view);
    const others = summaries.filter((s) => !s.archived && s.app !== origin).map(view);
    const archived = summaries.filter((s) => s.archived).map(view);
    return { mine, others, archived };
  }, [summaries, models, origin]);

  const nextNumber = useMemo(() => {
    if (connection !== 'granted') return null;
    const ids = [...records.map((r) => r.id), ...summaries.map((s) => s.id)];
    return (ids.length ? Math.max(...ids) : 0) + 1;
  }, [connection, records, summaries]);

  const overlayState = useMemo<OverlayState>(() => {
    const markers: MarkerInfo[] = [];
    for (const v of views.mine) {
      const m = v.item && markerOf(v.item);
      if (m) markers.push(m);
    }
    return {
      category,
      pending: views.mine.filter((v) => v.summary.category === category).length,
      nextNumber,
      markers,
    };
  }, [views, category, nextNumber]);
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

  // ---------- 사이트별 켜기 (localhost 가 아닌 배포 주소 등) ----------
  useEffect(() => {
    if (!pattern) {
      setSiteAllowed(false);
      return;
    }
    const check = () => chrome.permissions.contains({ origins: [pattern] }).then(setSiteAllowed, () => setSiteAllowed(false));
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, [pattern]);

  /** 권한 확인 → 스크립트 등록을 맞출 때까지 기다림 → 탭 새로고침(네트워크 기록은 페이지 맨 처음에 들어가야 함) */
  const toggleSite = useCallback(
    async (on: boolean) => {
      if (!pattern || tabId === null) return;
      const ok = on ? await chrome.permissions.request({ origins: [pattern] }) : await chrome.permissions.remove({ origins: [pattern] });
      if (!ok) return;
      setSiteAllowed(on);
      await chrome.runtime.sendMessage({ type: 'bn:sync-sites' }).catch(() => {});
      await chrome.tabs.reload(tabId);
    },
    [pattern, tabId],
  );
  const enableSite = useCallback(() => toggleSite(true), [toggleSite]);
  const disableSite = useCallback(() => toggleSite(false), [toggleSite]);

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
  /** 폴더를 읽는다: 옛 기록·항목·카테고리. 완료로 바뀐 항목은 바로 보관함으로 옮긴다 */
  const refreshRecords = useCallback(async () => {
    const h = handleRef.current;
    if (!h || !(await ensurePermission(h, false))) return;
    try {
      let items = await listItems(h);
      const done = items.filter((s) => !s.archived && s.status === '완료');
      if (done.length) {
        for (const s of done) await moveItem(h, s.id, true);
        items = await listItems(h);
        say(`처리 완료된 항목 ${done.map((s) => `#${padId(s.id)}`).join(', ')} 를 보관함으로 옮겼습니다.`);
      }
      setSummaries(items);
      setCategories(await readCategories(h));
      setRecords(await listRecords(h));
      setWorkflow(await workflowStatus(h));
      setLegacy(await hasLegacy(h));
    } catch (e) {
      say(`기록 목록을 읽지 못했습니다: ${String(e)}`, 'warn');
    }
  }, [say]);

  /** 항목 하나를 파일과 편집용 원본에 쓴다 */
  const persistItem = useCallback(
    async (item: Item) => {
      if (!origin) return;
      const h = handleRef.current;
      setModels((m) => new Map(m).set(item.id, item));
      await db.setItemModel(origin, item);
      if (!h || !(await ensurePermission(h, false))) {
        setConnection(h ? 'prompt' : 'none');
        return;
      }
      try {
        await writeItem(h, { ...item, updated: nowStamp() });
      } catch (e) {
        say(`파일 저장 실패: ${String(e)}`, 'warn');
      }
    },
    [origin, say],
  );

  /** 증거 하나로 지금 카테고리에 새 항목을 만든다 */
  const createItem = useCallback(
    (evidence: Evidence, category: string): Promise<Item | null> => {
      const run = creating.current.then(async () => {
        const h = handleRef.current;
        if (!origin || !h || !(await ensurePermission(h, false))) return null;
        const item: Item = {
          id: await nextItemId(h),
          category,
          status: '대기',
          created: nowStamp(),
          app: origin,
          evidence: { ...evidence, letter: undefined },
        };
        await persistItem(item);
        return item;
      });
      creating.current = run.catch(() => {});
      return run;
    },
    [origin, persistItem],
  );

  const loadOrigin = useCallback(async () => {
    handleRef.current = null;
    setWorkflow(null);
    setLegacy(false);
    setConnection('none');
    setFolderName('');
    setRecords([]);
    setSummaries([]);
    setModels(new Map());
    setCategories([DEFAULT_CATEGORY]);
    if (!origin) return;
    const h = await db.getHandle(origin);
    const granted = !!h && (await ensurePermission(h, false));
    if (h) {
      handleRef.current = h;
      setFolderName(h.name);
      setConnection(granted ? 'granted' : 'prompt');
    }
    setCategoryState((await db.getCurrentCategory(origin)) ?? DEFAULT_CATEGORY);
    setModels(new Map((await db.listItemModels(origin)).map((i) => [i.id, i])));
    if (!granted) return;
    // 예전 방식의 흔적 정리: 작성 중 이슈 표시는 지우고(기록 파일은 읽기 전용으로 남음),
    // 브라우저에만 있던 미분류 증거는 미분류 카테고리의 항목(파일)으로 옮긴다
    await db.setDraftId(origin, null);
    const oldInbox = await db.listInbox(origin);
    for (const ev of oldInbox) {
      if (await createItem(ev, DEFAULT_CATEGORY)) await db.removeInbox(ev.uid);
    }
    await refreshRecords();
  }, [origin, createItem, refreshRecords]);

  useEffect(() => {
    loadOrigin();
  }, [loadOrigin]);

  useEffect(() => {
    if (connection !== 'granted') return;
    // 에이전트가 항목을 완료로 바꿨는지·처리 기록을 덧붙였는지 반영하기 위해 주기적으로 다시 읽는다
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshRecords();
    }, 5000);
    return () => window.clearInterval(t);
  }, [connection, refreshRecords]);

  // ---------- 담기 (content script 메시지) ----------
  const onCaptured = useCallback(
    async (evidence: Evidence) => {
      if (!origin) return;
      if (connection !== 'granted') {
        say('먼저 프로젝트 폴더를 연결해주세요.', 'warn');
        return;
      }
      // 이 화면에서 이미 담은(대기 중인) 대상이면 새로 담지 않고 그 항목을 가리킨다
      const page = pagePath(evidence.url);
      const existing = [...modelsRef.current.values()].find(
        (i) => i.status === '대기' && pagePath(i.evidence.url) === page && sameTarget(i.evidence, evidence),
      );
      if (existing && views.mine.some((v) => v.summary.id === existing.id)) {
        setFreshUid(null);
        window.setTimeout(() => setFreshUid(existing.evidence.uid), 0);
        say(`이미 #${padId(existing.id)}(${existing.category})로 담은 요소입니다.`, 'warn');
        return;
      }
      const item = await createItem(evidence, categoryRef.current);
      if (!item) return;
      setFreshUid(item.evidence.uid);
      refreshRecords();
    },
    [origin, connection, views, createItem, refreshRecords, say],
  );

  /** 메모: 편집용 원본은 바로, 파일은 잠시 모았다가 쓴다 */
  const updateNote = useCallback(
    (id: number, note: string) => {
      const item = modelsRef.current.get(id);
      if (!item || !origin) return;
      const next = { ...item, evidence: { ...item.evidence, note } };
      setModels((m) => new Map(m).set(id, next));
      db.setItemModel(origin, next);
      window.clearTimeout(noteTimers.current.get(id));
      noteTimers.current.set(
        id,
        window.setTimeout(() => {
          persistItem(modelsRef.current.get(id) ?? next).then(refreshRecords);
        }, 600),
      );
    },
    [origin, persistItem, refreshRecords],
  );

  const moveItemTo = useCallback(
    async (id: number, to: string) => {
      const item = modelsRef.current.get(id);
      if (!item || item.category === to) return;
      await persistItem({ ...item, category: to });
      await refreshRecords();
      say(`#${padId(id)} 를 "${to}"(으)로 옮겼습니다.`);
    },
    [persistItem, refreshRecords, say],
  );

  /** 항목 삭제(md·스크린샷·편집용 원본). 보관함에서는 확인을 받는다 */
  const removeItem = useCallback(
    async (id: number, archived: boolean) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      if (archived && !window.confirm(`보관한 항목 #${padId(id)} 를 삭제할까요?\n\nmd 파일과 스크린샷이 지워지며 되돌릴 수 없습니다.`)) return;
      window.clearTimeout(noteTimers.current.get(id));
      try {
        await deleteItem(h, id, archived);
        await db.deleteItemModel(origin, id);
        setModels((m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
        await refreshRecords();
      } catch (e) {
        say(String(e), 'warn');
      }
    },
    [origin, refreshRecords, say],
  );

  /** 보관함에서 되돌리기: 다시 대기 항목으로 */
  const restoreItem = useCallback(
    async (id: number) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      try {
        await moveItem(h, id, false);
        const item = modelsRef.current.get(id);
        if (item) {
          const next = { ...item, status: '대기' as const };
          setModels((m) => new Map(m).set(id, next));
          await db.setItemModel(origin, next);
        }
        await refreshRecords();
        say(`#${padId(id)} 를 되돌렸습니다.`);
      } catch (e) {
        say(String(e), 'warn');
      }
    },
    [origin, refreshRecords, say],
  );

  /** 프롬프트를 복사하고, 넘긴 항목에 넘긴 시각을 남긴다 */
  const sendItems = useCallback(
    async (ids: number[], prompt: string) => {
      await navigator.clipboard.writeText(prompt);
      const sent = nowStamp();
      for (const id of ids) {
        const item = modelsRef.current.get(id);
        if (item) await persistItem({ ...item, sent });
      }
      await refreshRecords();
    },
    [persistItem, refreshRecords],
  );

  const copyItem = useCallback(
    async (id: number) => {
      await sendItems([id], itemsPrompt([itemFileName(id)]));
      say(`#${padId(id)} 프롬프트를 복사했습니다.`);
    },
    [sendItems, say],
  );

  /** 카테고리째: 아직 넘기지 않은 대기 항목만. 없으면 대기 항목 전부를 다시 */
  const copyCategory = useCallback(
    async (name: string) => {
      const pending = views.mine.filter((v) => v.summary.category === name);
      const fresh = pending.filter((v) => !v.summary.sent);
      const list = fresh.length ? fresh : pending;
      if (list.length === 0) {
        say(`"${name}"에 넘길 대기 항목이 없습니다.`, 'warn');
        return;
      }
      const ids = list.map((v) => v.summary.id);
      await sendItems(ids, itemsPrompt(ids.map(itemFileName), name));
      say(fresh.length ? `"${name}"의 새 항목 ${ids.length}건을 복사했습니다.` : `"${name}"의 대기 항목 ${ids.length}건을 다시 복사했습니다.`);
    },
    [views, sendItems, say],
  );

  // ---------- 카테고리 ----------
  const setCategory = useCallback(
    (name: string) => {
      setCategoryState(name);
      if (origin) db.setCurrentCategory(origin, name);
    },
    [origin],
  );

  const addCategory = useCallback(
    async (raw: string) => {
      const h = handleRef.current;
      const name = raw.trim();
      if (!h || !name) return;
      if (!categories.includes(name)) {
        await writeCategories(h, [...categories, name]);
        setCategories(await readCategories(h));
      }
      setCategory(name);
    },
    [categories, setCategory],
  );

  const renameCategory = useCallback(
    async (from: string, raw: string) => {
      const h = handleRef.current;
      const to = raw.trim();
      if (!h || !to || from === to || from === DEFAULT_CATEGORY) return;
      if (categories.includes(to)) {
        say(`"${to}" 카테고리가 이미 있습니다.`, 'warn');
        return;
      }
      await writeCategories(h, categories.map((c) => (c === from ? to : c)));
      for (const item of modelsRef.current.values()) {
        if (item.category === from) await persistItem({ ...item, category: to });
      }
      if (categoryRef.current === from) setCategory(to);
      await refreshRecords();
    },
    [categories, persistItem, setCategory, refreshRecords, say],
  );

  /** 대기 항목이 없는 카테고리만 지운다(보관한 항목은 카테고리 이름을 그대로 가짐) */
  const deleteCategory = useCallback(
    async (name: string) => {
      const h = handleRef.current;
      if (!h || name === DEFAULT_CATEGORY) return;
      if (summaries.some((s) => !s.archived && s.category === name)) {
        say(`"${name}"에 대기 항목이 있어 지울 수 없습니다. 항목을 옮기거나 지운 뒤 다시 해주세요.`, 'warn');
        return;
      }
      await writeCategories(h, categories.filter((c) => c !== name));
      if (categoryRef.current === name) setCategory(DEFAULT_CATEGORY);
      await refreshRecords();
    },
    [categories, summaries, setCategory, refreshRecords, say],
  );

  /** 페이지 위 편집 팝오버에서 고친 내용 반영 */
  const onEdit = useCallback(
    (uid: string, edit: EvidenceEdit) => {
      const item = [...modelsRef.current.values()].find((i) => i.evidence.uid === uid);
      if (!item) return;
      if (edit.action === 'note') updateNote(item.id, edit.note);
      else removeItem(item.id, false);
    },
    [updateNote, removeItem],
  );

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
    }
  }, [origin, loadOrigin, say]);

  const reconnect = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    if (await ensurePermission(h, true)) {
      setConnection('granted');
      loadOrigin();
    }
  }, [loadOrigin]);

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

  /** 클립보드 붙여넣기·끌어다 놓기로 받은 이미지/텍스트를 지금 카테고리의 항목으로 담는다 */
  const addPasted = useCallback(
    async (dt: DataTransfer) => {
      if (!tabUrl || !origin) return;
      const items = await evidenceFromTransfer(dt, { url: tabUrl, route: routeOf(tabUrl) });
      if (items.length === 0) {
        say('붙여넣을 이미지나 텍스트가 없습니다.', 'warn');
        return;
      }
      for (const ev of items) await onCaptured(ev);
      say(`붙여넣은 자료 ${items.length}개를 담았습니다.`);
    },
    [tabUrl, origin, onCaptured, say],
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

  // ---------- 옛 기록(읽기 전용: 복사·보관·삭제) ----------
  const copyRecord = useCallback(
    async (fileName: string, archived = false) => {
      await navigator.clipboard.writeText(copyPrompt(fileName, archived));
      say('프롬프트를 복사했습니다.');
    },
    [say],
  );

  const archive = useCallback(
    async (summary: RecordSummary) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      try {
        await archiveRecord(h, summary.id, summary.archived);
        await refreshRecords();
        say(summary.archived ? `#${summary.id} 를 되돌렸습니다.` : `#${summary.id} 를 보관했습니다.`);
      } catch (e) {
        say(String(e), 'warn');
      }
    },
    [origin, refreshRecords, say],
  );

  /** 옛 기록 삭제(되돌릴 수 없음) */
  const removeRecord = useCallback(
    async (id: number, title: string, archived: boolean) => {
      const h = handleRef.current;
      if (!h || !origin) return;
      const label = `#${padId(id)} "${title || '제목 없음'}"`;
      const ok = window.confirm(`${label} 기록을 삭제할까요?\n\nmd 파일과 스크린샷이 프로젝트 폴더에서 지워지며 되돌릴 수 없습니다.\n(나중에 다시 볼 수도 있다면 [보관]을 쓰세요)`);
      if (!ok) return;
      try {
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
    tabUrl,
    origin,
    /** localhost 가 아닌 http(s) 탭이면 그 사이트의 권한 패턴 */
    sitePattern: pattern,
    enableSite,
    disableSite,
    connection,
    folderName,
    notice,
    freshUid,
    workflow,
    upgradeWorkflow,
    legacy,
    moveLegacy,
    connect,
    reconnect,
    disconnect,
    // 카테고리·항목
    categories,
    category,
    setCategory,
    addCategory,
    renameCategory,
    deleteCategory,
    items: views.mine,
    otherItems: views.others,
    archivedItems: views.archived,
    updateNote,
    moveItemTo,
    removeItem,
    restoreItem,
    copyItem,
    copyCategory,
    addPasted,
    goTo,
    locate,
    // 옛 기록(읽기 전용)
    records,
    copyRecord,
    archive,
    removeRecord,
  };
}

export type PinProof = ReturnType<typeof usePinProof>;
