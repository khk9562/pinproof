export const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; }
[hidden] { display: none !important; }

.box {
  position: fixed;
  border: 1px solid #2563eb;
  background: rgba(37, 99, 235, 0.08);
  border-radius: 2px;
  pointer-events: none;
}
.label {
  position: fixed;
  max-width: 320px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #111827;
  color: #f9fafb;
  font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0,0,0,.25);
}

.pulse {
  position: fixed;
  border: 2px solid #2563eb;
  border-radius: 3px;
  pointer-events: none;
  animation: bn-pulse 1.1s ease-out forwards;
}
@keyframes bn-pulse {
  0% { box-shadow: 0 0 0 0 rgba(37,99,235,.55); background: rgba(37,99,235,.18); }
  70% { box-shadow: 0 0 0 10px rgba(37,99,235,0); background: rgba(37,99,235,.06); }
  100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); background: transparent; opacity: 0; }
}

.catcher {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  pointer-events: auto;
  background: rgba(17, 24, 39, 0.04);
}
.drag {
  position: fixed;
  border: 1.5px dashed #16a34a;
  background: rgba(22, 163, 74, 0.08);
}
.drag::after {
  content: attr(data-size);
  position: absolute;
  right: 0;
  bottom: -20px;
  padding: 1px 5px;
  border-radius: 3px;
  background: #111827;
  color: #fff;
  font: 500 10px/16px ui-monospace, monospace;
}

.chip {
  position: fixed;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: #16a34a;
  color: #fff;
  font: 600 12px/16px ui-sans-serif, system-ui, sans-serif;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.25);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 8px;
  background: #111827;
  color: #f9fafb;
  font: 500 12px/18px ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.toast[data-kind="warn"] { background: #b45309; }
`;
