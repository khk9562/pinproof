import { Evidence, NetworkEntry } from './types';

export type PickMode = 'element' | 'text' | 'region';

/** 사이드 패널 → content script (chrome.tabs.sendMessage) */
export type ToContent =
  | { type: 'bn:start'; mode: PickMode }
  | { type: 'bn:stop' }
  | { type: 'bn:flash'; selector: string }
  | { type: 'bn:network' }
  | { type: 'bn:ping' };

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
  | { type: 'bn:hello'; url: string };

/** content script → background */
export type ToBackground = { type: 'bn:screenshot' };

/** isolated world ↔ MAIN world (window.postMessage) */
export const BRIDGE_KEY = '__bugnotes_bridge__';
export type BridgeRequest =
  | { key: typeof BRIDGE_KEY; dir: 'req'; id: string; op: 'component'; target: string }
  | { key: typeof BRIDGE_KEY; dir: 'req'; id: string; op: 'network'; route: string };
export type BridgeResponse = { key: typeof BRIDGE_KEY; dir: 'res'; id: string; data: unknown };
export const TARGET_ATTR = 'data-bugnotes-target';
