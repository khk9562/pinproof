/**
 * 페이지 위 오버레이(Shadow DOM) 스타일.
 * 색은 화이트 바탕 + 남색(주 버튼·선택·하이라이트 테두리) + 하늘색(마커·채움)만 쓴다. 빨강·주황은 오류·경고에만.
 * 모션: 순간마다 한 번만 움직이고, 계속 도는 것은 모드 중 핀 로고 숨쉬기 하나뿐이다.
 */
export const OVERLAY_CSS = `
:host {
  all: initial;
  --bg: #ffffff; --surface: #f5f8fc; --surface-2: #edf2f8; --border: #dde5ef;
  --text: #172033; --text-2: #4b5b73; --text-3: #8593a8;
  --navy: #1e3a8a; --navy-strong: #172554; --navy-soft: rgba(30,58,138,.10);
  --sky: #38bdf8; --sky-soft: rgba(56,189,248,.20); --on-sky: #0b1b3f;
  --gray-dot: #9ca3af; --red: #dc2626; --amber: #b45309;
  --radius-s: 6px; --radius: 8px; --radius-l: 12px; --pill: 999px;
  --shadow-float: 0 8px 28px rgba(23,32,51,.14), 0 0 0 1px rgba(23,32,51,.06);
  --sans: ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --t: .15s ease; --ease: cubic-bezier(.4,0,.2,1);
}
* { box-sizing: border-box; font-family: var(--sans); }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--navy); outline-offset: 1px; }
kbd {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--border); border-bottom-width: 2px; border-radius: var(--radius-s);
  background: var(--surface); font: 500 11px/1 var(--mono); color: var(--text-2);
}
.dot3 { width: 3px; height: 3px; border-radius: 50%; background: var(--text-3); margin: 0 4px; flex: none; }

/* ---------- 고르는 동안의 하이라이트 ---------- */
.box {
  position: fixed; border: 2px solid var(--navy); border-radius: 2px; background: var(--sky-soft);
  pointer-events: none; transition: left .08s ease, top .08s ease, width .08s ease, height .08s ease;
}
.label {
  position: fixed; max-width: 360px; padding: 2px 6px; border-radius: var(--radius-s);
  background: var(--navy-strong); color: var(--bg); font: 500 11px/1.4 var(--mono);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
}
.catcher { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(23,32,51,.03); }
.drag { position: fixed; border: 1.5px dashed var(--navy); background: var(--sky-soft); }
.drag::after {
  content: attr(data-size); position: absolute; right: 0; bottom: -22px; padding: 2px 6px;
  border-radius: var(--radius-s); background: var(--navy-strong); color: var(--bg); font: 500 11px/1.4 var(--mono);
}
/* 팝오버 대상 */
.sel { position: fixed; border: 2px solid var(--navy); border-radius: 3px; background: var(--sky-soft); pointer-events: none; }
/* 마커가 없는 요소 찾기([페이지로 이동]) */
.pulse { position: fixed; border: 2px solid var(--navy); border-radius: 3px; pointer-events: none; animation: pp-pulse-box 1.1s ease-out forwards; }
@keyframes pp-pulse-box {
  0% { box-shadow: 0 0 0 0 rgba(30,58,138,.5); background: var(--sky-soft); }
  70% { box-shadow: 0 0 0 10px rgba(30,58,138,0); }
  100% { box-shadow: 0 0 0 0 rgba(30,58,138,0); background: transparent; opacity: 0; }
}

/* ---------- 툴바 ---------- */
.tb {
  position: fixed; display: flex; align-items: center; gap: 2px; height: 40px; padding: 4px;
  border-radius: var(--pill); background: var(--bg); box-shadow: var(--shadow-float);
  pointer-events: auto; user-select: none; font-size: 13px; color: var(--text);
  animation: pp-tb-in .25s var(--ease) both;
}
.tb.leave { animation: pp-tb-out .2s var(--ease) forwards; pointer-events: none; }
@keyframes pp-tb-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes pp-tb-out { to { opacity: 0; transform: translateY(-8px); } }
.tb.dragging { cursor: grabbing; }
.grip { width: 18px; height: 30px; display: grid; place-items: center; color: var(--text-3); cursor: grab; border-radius: var(--pill); transition: color var(--t); }
.grip:hover { color: var(--text-2); }
.logo { width: 22px; height: 22px; display: grid; place-items: center; margin: 0 4px 0 2px; flex: none; }
.logo svg { display: block; overflow: visible; }
.pp-body { stroke: var(--bg); stroke-width: 6; stroke-linejoin: round; transform-box: fill-box; transform-origin: center; }
.pp-needle { fill: none; stroke: var(--on-sky); stroke-width: 7; stroke-linecap: round; }
.vsep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; flex: none; }
.tbtn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 0;
  border-radius: var(--pill); background: transparent; color: var(--text-2); font-size: 13px; font-weight: 500;
  white-space: nowrap; transition: background var(--t), color var(--t);
}
.tbtn svg { flex: none; }
.tbtn:hover { background: var(--surface-2); color: var(--text); }
.tbtn:active { background: var(--border); }
.tbtn.icon { width: 30px; padding: 0; justify-content: center; }
.tbtn.icon[aria-pressed="true"] { background: var(--surface-2); color: var(--text); }
/* 모드 → 안내 띠 변신: 버튼 0.15s 사라짐 → 폭 0.3s → 안내 0.2s (되돌아갈 때 역순). 폭만 width 전환을 쓴다 */
.swap { position: relative; display: flex; align-items: center; height: 30px; transition: width .3s var(--ease) .2s; }
.swap .tools, .swap .guide { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.swap .tools { transition: opacity .15s ease .5s; }
.swap .guide { position: absolute; left: 0; top: 0; bottom: 0; gap: 0; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
.tb.mode .swap { transition: width .3s var(--ease) .15s; }
.tb.mode .swap .tools { opacity: 0; pointer-events: none; transition: opacity .15s ease; }
.tb.mode .swap .guide { opacity: 1; pointer-events: auto; transition: opacity .2s ease .45s; }
.guide .mode-name { display: inline-flex; align-items: center; gap: 6px; padding: 0 8px 0 4px; font-weight: 600; color: var(--text); }
.guide .mode-name::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--sky); box-shadow: 0 0 0 1px var(--navy); }
.guide .hint { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); padding: 0 6px; white-space: nowrap; }
.guide .stop { margin-left: 2px; }
/* 모드 중 압정 로고: 실루엣 숨쉬기 (유일한 반복 모션) */
.tb.mode .pp-body { animation: pp-breathe 1.2s ease-in-out infinite alternate; }
@keyframes pp-breathe { from { opacity: 1; transform: scale(1); } to { opacity: .55; transform: scale(.92); } }
/* 기록 칩: 하늘색은 "지금 담기는 곳"에만 */
.rec {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; margin-left: 2px;
  border-radius: var(--pill); background: var(--sky-soft); color: var(--on-sky); font-size: 12px; font-weight: 500; white-space: nowrap;
}
.rec b { font-family: var(--mono); font-weight: 600; }
.rec.loose { background: var(--surface-2); color: var(--text-2); }
.rec.loose::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--gray-dot); }
.rec .n { display: inline-block; height: 16px; line-height: 16px; overflow: hidden; vertical-align: middle; font-variant-numeric: tabular-nums; font-weight: 600; }
.rec .n i { display: block; height: 16px; font-style: normal; }
.rec .n .roll { animation: pp-roll .2s var(--ease) forwards; }
@keyframes pp-roll { from { transform: translateY(0); } to { transform: translateY(-16px); } }
.logo.bump { animation: pp-bump .3s var(--ease); }
@keyframes pp-bump { 0% { transform: none; } 40% { transform: translateY(4px) scale(.94); } 75% { transform: translateY(-2px); } 100% { transform: none; } }

/* ---------- 마커 ---------- */
.pins { position: fixed; inset: 0; pointer-events: none; transition: opacity var(--t); }
.pins.off { opacity: 0; }
.pins.off .pin { pointer-events: none; }
.pin {
  position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; padding: 0; border: 0; border-radius: 50%;
  background: var(--sky); color: var(--on-sky); font: 700 11px/22px var(--sans); text-align: center;
  box-shadow: 0 0 0 2px var(--bg), var(--shadow-float); pointer-events: auto;
  transition: transform var(--t), box-shadow var(--t);
}
.pin:hover { transform: scale(1.15); }
.pin.loose { width: 12px; height: 12px; margin: -6px 0 0 -6px; background: var(--gray-dot); font-size: 0; }
.pin.temp { background: var(--bg); color: var(--navy-strong); box-shadow: inset 0 0 0 1.5px var(--navy), 0 0 0 2px var(--bg), var(--shadow-float); }
.pin.temp.loose { background: var(--gray-dot); box-shadow: 0 0 0 2px var(--bg), var(--shadow-float); }
.pin.editing { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--navy), var(--shadow-float); }
/* 툴팁은 마커 위로 — 아래로 띄우면 잡은 값을 가린다 */
.tip {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  max-width: 260px; padding: 5px 9px; border-radius: var(--radius-s); background: var(--text); color: var(--bg);
  font: 400 12px/1.4 var(--sans); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; visibility: hidden; transition: opacity .12s ease, visibility .12s; pointer-events: none;
}
.tip .none { color: var(--text-3); }
.pin:hover .tip { opacity: 1; visibility: visible; }
/* 핀 꽂힘 + 하늘색 링 한 번 */
.pin.drop { animation: pp-pin-drop .32s var(--ease); }
.pin.drop::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--sky); pointer-events: none; animation: pp-ring-out .6s ease-out forwards; }
@keyframes pp-pin-drop { 0% { opacity: 0; transform: translateY(-12px) scale(.6); } 62% { opacity: 1; transform: translateY(0) scale(1.08); } 100% { opacity: 1; transform: none; } }
@keyframes pp-ring-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(2.27); } }
/* 패널 목록 클릭 → 마커 찾기: 펄스 3회 + 남색 링 */
.pin.target { animation: pp-pulse .6s ease-in-out 3; }
.pin.target::before { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 3px solid var(--navy); pointer-events: none; animation: pp-ring-hold 1.8s linear forwards; }
@keyframes pp-pulse { 0%, 100% { transform: none; } 50% { transform: scale(1.2); } }
@keyframes pp-ring-hold { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
.pin.leaving { animation: pp-pin-out .18s ease forwards; pointer-events: none; }
@keyframes pp-pin-out { to { opacity: 0; transform: scale(.6); } }

/* ---------- 팝오버 ---------- */
.pop {
  position: fixed; width: 340px; padding: 0 14px 12px; border-radius: var(--radius-l); background: var(--bg);
  box-shadow: var(--shadow-float); pointer-events: auto; font-size: 13px; color: var(--text);
  animation: pp-up .2s var(--ease) both;
}
.pop.edit { width: 320px; }
.pop.out { animation: pp-pop-out .12s ease forwards; pointer-events: none; }
@keyframes pp-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pp-pop-out { to { opacity: 0; } }
.handle { display: block; width: 40%; height: 16px; margin: 0 auto; border: 0; background: transparent; cursor: grab; position: relative; }
.handle::after { content: ""; position: absolute; left: 0; right: 0; top: 6px; height: 4px; border-radius: var(--pill); background: var(--border); transition: background var(--t); }
.handle:hover::after { background: var(--text-3); }
.p-head { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0 10px; }
.who { flex: 1; min-width: 0; }
.p-row { display: flex; align-items: center; gap: 8px; }
.p-name { flex: 1; min-width: 0; font: 600 12px/1.4 var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-name .q { font-weight: 400; color: var(--text-2); }
.p-meta { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.p-src { font: 11px/1.4 var(--mono); color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-to { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px 0 2px; border-radius: var(--pill); background: var(--sky-soft); color: var(--on-sky); font-size: 12px; }
.p-to b { font-family: var(--mono); font-weight: 600; }
.p-to.loose { background: var(--surface-2); color: var(--text-2); padding-left: 7px; }
.lt { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--sky); color: var(--on-sky); font: 700 11px/1 var(--sans); flex: none; }
.lt.temp { background: var(--bg); color: var(--navy-strong); box-shadow: inset 0 0 0 1.5px var(--navy); }
.lt.loose { width: 10px; height: 10px; background: var(--gray-dot); margin: 4px; }
.field { border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); transition: border-color var(--t), box-shadow var(--t); }
.field:focus-within { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-soft); }
.field textarea {
  display: block; width: 100%; min-height: 40px; max-height: 140px; padding: 9px 11px 4px; border: 0; border-radius: var(--radius);
  resize: none; outline: none; background: transparent; font: 13px/1.45 var(--sans); color: var(--text); overflow: auto;
}
.field textarea::placeholder { color: var(--text-3); }
.field-foot { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0 8px 7px; color: var(--text-3); font-size: 12px; }
.field-foot .sp { flex: 1; }
.p-foot { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.p-foot .sp { flex: 1; }
.vw { display: inline-flex; align-items: center; gap: 5px; color: var(--text-3); font: 11px var(--mono); }
.btn-ghost { height: 30px; padding: 0 12px; border: 0; border-radius: var(--pill); background: transparent; color: var(--text-2); font-size: 13px; font-weight: 500; transition: background var(--t), color var(--t); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-main { height: 30px; padding: 0 16px; border: 0; border-radius: var(--pill); background: var(--navy); color: var(--bg); font-size: 13px; font-weight: 600; transition: background var(--t); }
.btn-main:hover { background: var(--navy-strong); }
.btn-main:disabled { background: var(--surface-2); color: var(--text-3); cursor: default; }
.btn-del { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 0; border-radius: var(--pill); background: transparent; color: var(--text-2); font-size: 12px; font-weight: 500; transition: background var(--t), color var(--t); }
.btn-del:hover { color: var(--red); background: var(--surface); }
.btn-move { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--pill); background: var(--bg); color: var(--text-2); font-size: 12px; font-weight: 500; transition: border-color var(--t), color var(--t); }
.btn-move:hover { border-color: var(--navy); color: var(--text); }
.btn-move i { width: 7px; height: 7px; border-radius: 50%; background: var(--gray-dot); }
.btn-move b { font-family: var(--mono); font-weight: 600; }

/* ---------- 경고 (패널 미연결·스크린샷 권한 등) ---------- */
.toast {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); max-width: 520px; padding: 8px 14px;
  border-radius: var(--radius); background: var(--text); color: var(--bg); font: 500 12px/18px var(--sans);
  box-shadow: var(--shadow-float); animation: pp-up .2s var(--ease) both;
}
.toast[data-kind="warn"] { background: var(--amber); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
