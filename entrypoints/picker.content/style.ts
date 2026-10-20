import TOKENS_CSS from '@/lib/tokens.css?raw';

/**
 * 페이지 위 오버레이(Shadow DOM) 스타일.
 * 색은 lib/tokens.css 의 무채색 토큰(잉크·종이 농도)만 쓴다. 빨강·주황도 쓰지 않는다.
 * 호스트 페이지 바탕을 모르므로 하이라이트·마커는 잉크 + 종이 두 겹으로 그려 밝은·어두운 페이지 모두에서 보이게 한다.
 * 모션: 순간마다 한 번만 움직이고, 계속 도는 것은 모드 중 핀 로고 숨쉬기 하나뿐이다.
 */
export const OVERLAY_CSS = `
:host { all: initial; }
${TOKENS_CSS}
:host {
  /* Paperlogy 는 Shadow DOM 안에서 등록할 수 없어(호스트 문서에 넣어야 함) 대체 폰트부터 */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  --radius-s: var(--radius-paper); --radius: var(--radius-input); --radius-l: var(--radius-control);
  --t: var(--dur-tap) var(--ease-out);
  /* 작은 마커용: 떠 있는 카드 그림자(--shadow-float)는 22px 원에는 거의 안 보인다 */
  --shadow-pin: 0 2px 6px rgb(0 0 0 / 0.35);
  /* 호스트 페이지가 비쳐 보이지 않게 섞은 불투명 회색(미분류 점) */
  --color-ink-faint-solid: color-mix(in srgb, rgb(var(--ink-rgb)) 44%, rgb(var(--paper-rgb)));
}
* { box-sizing: border-box; font-family: var(--font-sans); }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus, textarea:focus { outline: none; }
button:focus-visible { outline: 2px solid var(--color-ink); outline-offset: -2px; }
kbd {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--color-line); border-bottom-width: 2px; border-radius: var(--radius-s);
  background: var(--color-surface); font: 500 11px/1 var(--font-mono); color: var(--color-ink-soft);
}
.dot3 { width: 3px; height: 3px; border-radius: var(--radius-paper); background: var(--color-ink-faint); margin: 0 4px; flex: none; }

/* ---------- 고르는 동안의 하이라이트 ---------- */
.box {
  position: fixed; border: 2px solid var(--color-ink); border-radius: var(--radius-paper); background: var(--color-wash);
  box-shadow: var(--ring-paper), inset var(--ring-paper); pointer-events: none; transition: left .08s ease, top .08s ease, width .08s ease, height .08s ease;
}
.label {
  position: fixed; max-width: 360px; padding: 2px 6px; border-radius: var(--radius-s);
  background: var(--color-ink); color: var(--color-inverse); font: 500 11px/1.4 var(--font-mono); box-shadow: var(--ring-paper);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
}
.catcher { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgb(var(--ink-rgb) / 0.03); }
.drag { position: fixed; border: 1.5px dashed var(--color-ink); background: var(--color-wash); box-shadow: var(--ring-paper); }
.drag::after {
  content: attr(data-size); position: absolute; right: 0; bottom: -22px; padding: 2px 6px;
  border-radius: var(--radius-s); background: var(--color-ink); color: var(--color-inverse); font: 500 11px/1.4 var(--font-mono); box-shadow: var(--ring-paper);
}
/* 팝오버 대상 */
.sel { position: fixed; border: 2px solid var(--color-ink); border-radius: var(--radius-paper); background: var(--color-wash); box-shadow: var(--ring-paper), inset var(--ring-paper); pointer-events: none; }
/* 마커가 없는 요소 찾기([해당 페이지로 이동]) */
.pulse { position: fixed; border: 2px solid var(--color-ink); border-radius: var(--radius-paper); pointer-events: none; animation: pp-pulse-box 1.1s var(--ease-out) forwards; }
@keyframes pp-pulse-box {
  0% { box-shadow: var(--ring-paper), 0 0 0 0 rgb(var(--ink-rgb) / 0.45); background: var(--color-wash-strong); }
  70% { box-shadow: var(--ring-paper), 0 0 0 10px rgb(var(--ink-rgb) / 0); }
  100% { box-shadow: var(--ring-paper), 0 0 0 0 rgb(var(--ink-rgb) / 0); background: transparent; opacity: 0; }
}

/* ---------- 툴바 ---------- */
.tb {
  position: fixed; display: flex; align-items: center; gap: 2px; height: 44px; padding: 4px;
  border: 1px solid var(--color-line); border-radius: var(--radius-pill); background: var(--color-surface); box-shadow: var(--shadow-float);
  pointer-events: auto; user-select: none; font-size: 13px; color: var(--color-ink);
  animation: pp-tb-in .25s var(--ease-out) both;
}
.tb.leave { animation: pp-tb-out .2s var(--ease-out) forwards; pointer-events: none; }
@keyframes pp-tb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes pp-tb-out { to { opacity: 0; transform: translateY(8px); } }
.tb.dragging { cursor: grabbing; }
.grip { width: 18px; height: 36px; display: grid; place-items: center; color: var(--color-ink-faint); cursor: grab; border-radius: var(--radius-pill); transition: color var(--t); }
.grip:hover { color: var(--color-ink-soft); }
.logo { width: 22px; height: 22px; display: grid; place-items: center; margin: 0 4px 0 2px; flex: none; }
.logo svg { display: block; overflow: visible; }
.pp-body { stroke: var(--color-bg); stroke-width: 6; stroke-linejoin: round; transform-box: fill-box; transform-origin: center; }
.logo { color: var(--color-ink); }
.pp-needle { fill: none; stroke: currentColor; stroke-width: 7; stroke-linecap: round; }
.vsep { width: 1px; height: 18px; background: var(--color-line); margin: 0 4px; flex: none; }
.tbtn {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 0;
  border-radius: var(--radius-pill); background: transparent; color: var(--color-ink-soft); font-size: 13px; font-weight: 500;
  white-space: nowrap; transition: background var(--t), color var(--t), transform var(--t);
}
.tbtn svg { flex: none; }
.tbtn:hover { background: var(--color-wash); color: var(--color-ink); }
.tbtn:active { background: var(--color-wash-strong); transform: scale(0.96); }
.tbtn.icon:active { transform: scale(0.92); }
.tbtn.icon { width: 30px; padding: 0; justify-content: center; }
.tbtn.icon[aria-pressed="true"] { background: var(--color-wash); color: var(--color-ink); }
/* 모드 → 안내 띠 변신: 버튼 0.15s 사라짐 → 폭 quick → 안내 0.2s (되돌아갈 때 역순). 폭만 width 전환을 쓴다 */
.swap { position: relative; display: flex; align-items: center; height: 36px; transition: width var(--dur-quick) var(--ease-out) .2s; }
.swap .tools, .swap .guide { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.swap .tools { transition: opacity .15s ease .5s; }
.swap .guide { position: absolute; left: 0; top: 0; bottom: 0; gap: 0; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
.tb.mode .swap { transition: width var(--dur-quick) var(--ease-out) .15s; }
.tb.mode .swap .tools { opacity: 0; pointer-events: none; transition: opacity .15s ease; }
.tb.mode .swap .guide { opacity: 1; pointer-events: auto; transition: opacity .2s ease .45s; }
.guide .mode-name {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px 0 8px; border: 0; border-radius: var(--radius-pill);
  background: transparent; font-weight: 600; color: var(--color-ink); transition: background var(--t);
}
.guide .mode-name:hover, .guide .mode-name[aria-expanded="true"] { background: var(--color-wash); }
.guide .mode-name .chev { color: var(--color-ink-faint); transition: transform var(--t); }
.guide .mode-name[aria-expanded="true"] .chev { transform: rotate(180deg); }
/* 모드 선택 메뉴: 툴바 위(또는 아래)로 뜨는 작은 목록 */
.mode-menu {
  position: absolute; bottom: calc(100% + 8px); min-width: 196px; padding: 4px; display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--color-line); border-radius: var(--radius-l); background: var(--color-surface); box-shadow: var(--shadow-float);
  animation: pp-menu-up var(--dur-quick) var(--ease-out) both;
}
.mode-menu.down { bottom: auto; top: calc(100% + 8px); animation-name: pp-menu-down; }
@keyframes pp-menu-up { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes pp-menu-down { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: none; } }
.mode-item {
  display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px 0 10px; border: 0; border-radius: var(--radius);
  background: transparent; color: var(--color-ink-soft); font-size: 13px; text-align: left; white-space: nowrap; transition: background var(--t), color var(--t);
}
.mode-item:hover, .mode-item:focus-visible { background: var(--color-wash); color: var(--color-ink); outline: none; }
.mode-item[aria-checked="true"] { color: var(--color-ink); font-weight: 600; }
.mode-item .sp { flex: 1; }
.guide .mode-name::before { content: ""; width: 8px; height: 8px; border-radius: var(--radius-paper); background: var(--color-ink); }
.guide .hint { display: inline-flex; align-items: center; gap: 4px; color: var(--color-ink-soft); padding: 0 6px; white-space: nowrap; }
.guide .stop { margin-left: 2px; }
/* 모드 중 압정 로고: "진행 중" 숨쉬기 — 1.2초 주기 투명도 1 → 0.3 → 1 (유일한 반복 모션) */
.tb.mode .logo svg { animation: pp-breathe 1.2s ease-in-out infinite; }
@keyframes pp-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
/* 기록 칩: 진한 바탕은 "지금 담기는 곳"에만, 미분류는 옅게 */
.rec {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; margin-left: 2px;
  border-radius: var(--radius-pill); background: var(--color-wash-strong); color: var(--color-ink); font-size: 12px; font-weight: 500; white-space: nowrap;
}
.rec .cat { max-width: 120px; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.rec.loose { background: var(--color-wash); color: var(--color-ink-soft); }
.rec.loose::before { content: ""; width: 7px; height: 7px; border-radius: var(--radius-paper); background: var(--color-ink-faint); }
.rec .n { display: inline-block; height: 16px; line-height: 16px; overflow: hidden; vertical-align: middle; font-variant-numeric: tabular-nums; font-weight: 600; }
.rec .n i { display: block; height: 16px; font-style: normal; }
.rec .n .roll { animation: pp-roll .2s var(--ease-out) forwards; }
@keyframes pp-roll { from { transform: translateY(0); } to { transform: translateY(-16px); } }
.logo.bump { animation: pp-bump .3s var(--ease-out); }
@keyframes pp-bump { 0% { transform: none; } 40% { transform: translateY(4px) scale(.94); } 75% { transform: translateY(-2px); } 100% { transform: none; } }

/* ---------- 마커 ---------- */
.pins { position: fixed; inset: 0; pointer-events: none; transition: opacity var(--t); }
.pins.off { opacity: 0; }
.pins.off .pin { pointer-events: none; }
/* 번호 마커: 세 자리까지 늘어나는 알약. 폭이 달라도 자리 중심에 오게 translate 로 맞춘다 */
.pin {
  position: fixed; min-width: 22px; height: 22px; padding: 0 6px; border: 0; border-radius: var(--radius-pill); translate: -50% -50%; font-variant-numeric: tabular-nums;
  background: var(--color-ink); color: var(--color-inverse); font: 700 11px/22px var(--font-sans); text-align: center;
  box-shadow: 0 0 0 2px var(--color-bg), var(--shadow-pin); pointer-events: auto;
  transition: transform var(--t), box-shadow var(--t);
}
.pin:hover { transform: scale(1.15); }
.pin.loose { min-width: 12px; width: 12px; height: 12px; padding: 0; background: var(--color-ink-faint-solid); font-size: 0; }
.pin.temp { background: var(--color-bg); color: var(--color-ink); box-shadow: inset 0 0 0 1.5px var(--color-ink), 0 0 0 2px var(--color-bg), var(--shadow-pin); }
.pin.temp.loose { background: var(--color-ink-faint-solid); box-shadow: 0 0 0 2px var(--color-bg), var(--shadow-pin); }
.pin.editing { box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-ink), 0 0 0 5px var(--color-bg), var(--shadow-pin); }
/* 툴팁은 마커 위로 — 아래로 띄우면 잡은 값을 가린다 */
.tip {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  max-width: 260px; padding: 5px 9px; border-radius: var(--radius-s); background: var(--color-ink); color: var(--color-inverse);
  font: 400 12px/1.4 var(--font-sans); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; visibility: hidden; transition: opacity .12s ease, visibility .12s; pointer-events: none;
}
.tip .none { color: var(--color-ink-faint); }
.pin:hover .tip { opacity: 1; visibility: visible; }
/* 핀 꽂힘 + 하늘색 링 한 번 */
/* 키프레임에 튀는 동작이 들어 있어 곡선은 ease-out */
.pin.drop { animation: pp-pin-drop var(--dur-quick) var(--ease-out); }
.pin.drop::after { content: ""; position: absolute; inset: 0; border-radius: var(--radius-pill); border: 3px solid var(--color-ink); box-shadow: var(--ring-paper); pointer-events: none; animation: pp-ring-out .6s var(--ease-out) forwards; }
@keyframes pp-pin-drop { 0% { opacity: 0; transform: translateY(-12px) scale(.6); } 62% { opacity: 1; transform: translateY(0) scale(1.08); } 100% { opacity: 1; transform: none; } }
@keyframes pp-ring-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(2.27); } }
/* 패널 목록 클릭 → 마커 찾기: 펄스 3회 + 남색 링 */
.pin.target { animation: pp-pulse .6s ease-in-out 3; }
.pin.target::before { content: ""; position: absolute; inset: -5px; border-radius: var(--radius-pill); border: 3px solid var(--color-ink); box-shadow: var(--ring-paper), inset var(--ring-paper); pointer-events: none; animation: pp-ring-hold 1.8s linear forwards; }
@keyframes pp-pulse { 0%, 100% { transform: none; } 50% { transform: scale(1.2); } }
@keyframes pp-ring-hold { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
.pin.leaving { animation: pp-pin-out var(--dur-tap) var(--ease-out) forwards; pointer-events: none; }
@keyframes pp-pin-out { to { opacity: 0; transform: scale(.6); } }

/* ---------- 팝오버 ---------- */
.pop {
  position: fixed; width: 340px; padding: 0 14px 12px; border: 1px solid var(--color-line); border-radius: var(--radius-l); background: var(--color-surface);
  box-shadow: var(--shadow-float); pointer-events: auto; font-size: 13px; color: var(--color-ink);
  animation: pp-up var(--dur-quick) var(--ease-out) both;
}
.pop.edit { width: 320px; }
.pop.out { animation: pp-pop-out .12s var(--ease-out) forwards; pointer-events: none; }
@keyframes pp-up { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes pp-pop-out { to { opacity: 0; } }
.handle { display: block; width: 40%; height: 16px; margin: 0 auto; border: 0; background: transparent; cursor: grab; position: relative; }
.handle::after { content: ""; position: absolute; left: 0; right: 0; top: 6px; height: 4px; border-radius: var(--radius-pill); background: var(--color-line); transition: background var(--t); }
.handle:hover::after { background: var(--color-ink-faint); }
.p-head { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0 10px; }
.who { flex: 1; min-width: 0; }
.p-row { display: flex; align-items: center; gap: 8px; }
.p-name { flex: 1; min-width: 0; font: 600 12px/1.4 var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-name .q { font-weight: 400; color: var(--color-ink-soft); }
.p-meta { font-size: 12px; color: var(--color-ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.p-src { font: 11px/1.4 var(--font-mono); color: var(--color-ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-to { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px 0 2px; border-radius: var(--radius-pill); background: var(--color-wash-strong); color: var(--color-ink); font-size: 12px; }
.p-to .p-cat { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.p-to.plain { padding-left: 7px; }
.p-to.loose { background: var(--color-wash); color: var(--color-ink-soft); padding-left: 7px; }
.lt { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: var(--radius-pill); font-variant-numeric: tabular-nums; background: var(--color-ink); color: var(--color-inverse); font: 700 11px/1 var(--font-sans); flex: none; }
.lt.temp { background: transparent; color: var(--color-ink); box-shadow: inset 0 0 0 1.5px var(--color-ink); }
.field { border: 1px solid var(--color-line); border-radius: var(--radius); background: var(--color-wash); transition: border-color var(--t); }
.field:focus-within { border-color: var(--color-ink); }
.field textarea {
  display: block; width: 100%; min-height: 40px; max-height: 140px; padding: 9px 11px 4px; border: 0; border-radius: var(--radius);
  resize: none; outline: none; background: transparent; font: 13px/1.45 var(--font-sans); color: var(--color-ink); overflow: auto;
}
.field textarea::placeholder { color: var(--color-ink-faint); }
.field-foot { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0 8px 7px; color: var(--color-ink-faint); font-size: 12px; }
.field-foot .sp { flex: 1; }
.p-foot { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.p-foot .sp { flex: 1; }
.vw { display: inline-flex; align-items: center; gap: 5px; color: var(--color-ink-faint); font: 11px var(--font-mono); }
.btn-ghost { height: 36px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--color-ink-soft); font-size: 13px; font-weight: 500; transition: background var(--t), color var(--t), transform var(--t); }
.btn-ghost:hover { background: var(--color-wash); color: var(--color-ink); }
.btn-ghost:active { background: var(--color-wash-strong); transform: scale(0.96); }
.btn-main { height: 36px; padding: 0 18px; border: 0; border-radius: var(--radius-pill); background: var(--color-ink); color: var(--color-inverse); font-size: 13px; font-weight: 700; transition: opacity var(--t), transform var(--t); }
.btn-main:hover { opacity: .88; }
.btn-main:active { transform: scale(0.97); }
.btn-main:focus-visible { outline-offset: 3px; }
.btn-main:disabled { opacity: .45; cursor: default; transform: none; }
.btn-del { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--color-ink-soft); font-size: 12px; font-weight: 500; transition: background var(--t), color var(--t); }
.btn-del:hover { color: var(--color-ink); background: var(--color-wash-strong); }

/* ---------- 경고 (패널 미연결·스크린샷 권한 등). 아래 가운데 툴바와 겹치지 않게 그 위에 ---------- */
.toast {
  position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); max-width: 520px; padding: 8px 14px;
  border-radius: var(--radius); background: var(--color-ink); color: var(--color-inverse); font: 500 12.5px/18px var(--font-sans);
  box-shadow: var(--ring-paper), var(--shadow-float); animation: pp-toast-in var(--dur-quick) var(--ease-out) both;
}
/* 경고: 주황 대신 굵은 글자 + 앞의 느낌표 */
.toast[data-kind="warn"] { font-weight: 700; }
.toast[data-kind="warn"]::before { content: "! "; font-weight: 800; }
@keyframes pp-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translateX(-50%); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
