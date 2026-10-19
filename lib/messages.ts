import { Evidence, EvidenceKind, NetworkEntry } from './types';

export type PickMode = 'element' | 'text' | 'region';

/** 사이드 패널 → content script (chrome.tabs.sendMessage) */
export type ToContent =
  | { type: 'bn:start'; mode: PickMode }
  | { type: 'bn:stop' }
  | { type: 'bn:flash'; selector: string; uid?: string }
  | { type: 'bn:network' }
  | { type: 'bn:ping' };

/**
 * 사이드 패널 ↔ content script 포트. 패널이 열려 있는 동안만 이어져 있고,
 * content script는 포트가 있을 때만 페이지 위 툴바·마커를 보여준다.
 */
export const PANEL_PORT = 'pinproof-panel';

/** 페이지 위 마커 하나 (작성 중 기록의 증거 = letter 있음, 미분류 = letter 없음) */
export interface MarkerInfo {
  uid: string;
  letter?: string;
  kind: EvidenceKind;
  /**
   * 담은 화면의 주소(경로 + ?쿼리 + #해시). 마커는 지금 주소가 이것과 같을 때만 보인다.
   * 경로만 비교하면 ?tab= 처럼 쿼리로 바뀌는 화면에서 다른 탭의 마커가 엉뚱한 요소에 붙는다.
   */
  page: string;
  note: string;
  selector?: string;
  anchor?: { x: number; y: number };
  label?: string;
  tag?: string;
  /** text 전용: 담은 글자 */
  quote?: string;
  rect?: { width: number; height: number };
  component?: string;
  source?: string;
}

export interface OverlayState {
  /** 작성 중인 기록. 없으면 담는 증거는 미분류로 간다 */
  record: { id: number; title: string; count: number } | null;
  /** 다음에 담으면 붙을 문자(작성 중 기록이 없으면 null) */
  nextLetter: string | null;
  inboxCount: number;
  markers: MarkerInfo[];
}

/** 패널 → content (포트) */
export type PortToContent = { type: 'bn:state'; state: OverlayState };

/** 페이지 위 편집 팝오버에서 고친 내용 (content → 패널) */
export type EvidenceEdit =
  | { action: 'note'; note: string }
  | { action: 'delete' }
  | { action: 'move' };

export interface NetworkSnapshot {
  url: string;
  route: string;
  viewportWidth: number;
  entries: NetworkEntry[];
}

/** content script → 사이드 패널 (chrome.runtime.sendMessage) */
export type ToPanel =
  | { type: 'bn:captured'; evidence: Evidence }
  | { type: 'bn:mode'; mode: PickMode | null }
  | { type: 'bn:hello'; url: string }
  | { type: 'bn:edit'; uid: string; edit: EvidenceEdit };

/** content script → background */
export type ToBackground =
  | { type: 'bn:screenshot' }
  /** 사이트를 켜거나 끈 뒤, 그 사이트의 스크립트 등록을 맞출 때까지 기다린다(그다음 탭을 새로고침) */
  | { type: 'bn:sync-sites' };

/** isolated world ↔ MAIN world (window.postMessage) */
export const BRIDGE_KEY = '__pinproof_bridge__';
export type BridgeRequest =
  | { key: typeof BRIDGE_KEY; dir: 'req'; id: string; op: 'component'; target: string }
  | { key: typeof BRIDGE_KEY; dir: 'req'; id: string; op: 'network'; route: string };
export type BridgeResponse = { key: typeof BRIDGE_KEY; dir: 'res'; id: string; data: unknown };
export const TARGET_ATTR = 'data-pinproof-target';
