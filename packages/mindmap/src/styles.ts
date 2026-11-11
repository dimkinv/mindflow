export const styles: string = `
:host { display:block; width:100%; height:100%; min-height:240px; }
.editor { container-type:inline-size; position:relative; width:100%; height:100%; overflow:hidden; --ink:#17161f; --muted:#747486; --purple:#5b43d6; --purple-dark:#4631bd; --border:#e7e5ee; font:14px Arial,sans-serif; color:var(--ink); } * { box-sizing:border-box; } button,input { font:inherit; } button { color:inherit; }
.canvas { outline:none; }
.context-menu { max-width:calc(100% - 16px); }
.notice { position:absolute; bottom:65px; left:50%; transform:translateX(-50%); background:#25222e; color:white; padding:10px; border-radius:8px; pointer-events:none; }
.canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background-color: #fbfbfc; background-image: linear-gradient(#e9e9ee 1px, transparent 1px), linear-gradient(90deg, #e9e9ee 1px, transparent 1px); background-size: 40px 40px; }
.canvas:active { cursor: grabbing; }
.canvas.connecting { cursor: crosshair; }
.canvas-world { width: 1600px; height: 900px; position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.edge-hit { pointer-events: stroke; cursor: pointer; }
.edge-selected path:first-child { filter: drop-shadow(0 0 3px rgba(91,67,214,.5)); }
.mind-node { --node-color: #7a4cff; position: absolute; width: 176px; min-height: 48px; padding: 11px 20px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--node-color); border-radius: 11px; background: rgba(255,255,255,.97); color: #25232e; font-size: 14px; font-weight: 560; line-height: 20px; text-align: center; box-shadow: 0 3px 8px rgba(27,23,45,.07); cursor: grab; user-select: none; transition: box-shadow .12s, transform .12s; }
.mind-node:hover { box-shadow: 0 7px 18px rgba(31,25,59,.14); }
.mind-node.selected { box-shadow: 0 0 0 3px rgba(91,67,214,.15), 0 8px 20px rgba(31,25,59,.13); }
.mind-node.connect-source { box-shadow: 0 0 0 4px rgba(91,67,214,.22); animation: connectPulse 1.2s infinite; }
.mind-node input { width: 100%; border: 0; outline: 0; text-align: center; background: #fff; font-weight: 560; }
.node-plus { position: absolute; right: -31px; top: 8px; width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border-radius: 50%; border: 1px solid #d9d7e2; background: #fff; color: #5f5a6c; font-size: 18px; line-height: 1; box-shadow: 0 2px 7px rgba(30,25,48,.12); opacity: 0; transform: scale(.8); transition: .15s; cursor: pointer; }
.mind-node[data-plus-side="left"] .node-plus { right: auto; left: -31px; }
.mind-node:hover .node-plus,.mind-node.selected .node-plus { opacity: 1; transform: scale(1); }
.node-plus:hover { background: var(--purple); border-color: var(--purple); color: #fff; }
@keyframes connectPulse { 50% { box-shadow: 0 0 0 8px rgba(91,67,214,.08); } }

.left-tools { position: absolute; z-index: 40; left: 18px; top: 18px; padding: 6px; display: grid; gap: 4px; border: 1px solid var(--border); border-radius: 13px; background: #fff; box-shadow: 0 9px 26px rgba(29,23,53,.13); }
.tool { width: 42px; height: 42px; border: 0; border-radius: 9px; background: transparent; font-size: 22px; cursor: pointer; }
.tool:hover,.tool.active { background: #efecff; color: var(--purple-dark); }
.tool:disabled { opacity: .3; cursor: default; }
.center-root-button { display: grid; place-items: center; padding: 0; line-height: 1; }
.center-root-button svg { display: block; }
.format-bar { position: absolute; z-index: 45; top: 14px; left: 50%; transform: translateX(-50%); display: flex; padding: 5px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 9px 28px rgba(29,23,53,.14); }
.format-button { height: 38px; padding: 0 14px; display: flex; gap: 8px; align-items: center; border: 0; border-right: 1px solid #eeeef2; background: transparent; font-size: 13px; cursor: pointer; }
.format-button:last-of-type { border-right: 0; }
.format-button:hover,.format-button[aria-expanded="true"] { background: #f5f3ff; }
.format-button:disabled { opacity: .35; }
.format-button.danger { color: #c73149; }
.line-sample { display: block; width: 24px; border-top: 2px solid #4d4a57; }
.color-dot { display: block; width: 18px; height: 18px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.1); }
.popover { position: absolute; top: calc(100% + 9px); left: 0; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 10px 28px rgba(29,23,53,.15); }
.popover-label { margin: 0 0 8px; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.popover-label:not(:first-child) { margin-top: 15px; }
.segmented { display: flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
.segmented button { height: 34px; padding: 0 11px; border: 0; border-right: 1px solid var(--border); background: #fff; font-size: 12px; cursor: pointer; }
.segmented button:last-child { border: 0; }
.segmented button:hover { background: #f1effd; color: var(--purple-dark); }
.color-popover { left: 80px; width: 232px; }
.swatches { display: grid; grid-template-columns: repeat(5, 32px); gap: 9px; }
.swatches button { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #fff; outline: 1px solid rgba(0,0,0,.12); cursor: pointer; }
.swatches button:hover { transform: scale(1.12); }
.color-popover p { margin: 13px 0 0; color: var(--muted); font-size: 11px; }

.context-menu { position: absolute; z-index: 80; width: 240px; padding: 7px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 12px 34px rgba(25,20,47,.18); }
.context-menu button { width: 100%; height: 38px; padding: 0 10px; display: grid; grid-template-columns: 24px 1fr auto; align-items: center; border: 0; border-radius: 8px; background: transparent; text-align: left; font-size: 13px; cursor: pointer; }
.context-menu button:hover { background: #f5f3ff; }
.context-menu button.danger { color: #c73149; }
.context-menu kbd { color: #9b98a6; font: 11px var(--font-geist, Inter); }
.menu-divider { height: 1px; margin: 5px 7px; background: var(--border); }
.zoom-controls { position: absolute; z-index: 40; right: 18px; bottom: 18px; height: 40px; display: flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: 0 6px 18px rgba(29,23,53,.12); overflow: hidden; }
.zoom-controls button { width: 38px; height: 40px; border: 0; background: #fff; cursor: pointer; font-size: 17px; }
.zoom-controls button:hover { background: #f4f2fd; }
.zoom-controls span { min-width: 54px; text-align: center; color: var(--muted); font-size: 12px; }
.canvas-hint { position: absolute; z-index: 20; left: 50%; bottom: 19px; transform: translateX(-50%); padding: 8px 13px; border: 1px solid rgba(220,218,229,.8); border-radius: 9px; background: rgba(255,255,255,.88); color: #777383; font-size: 11px; backdrop-filter: blur(8px); }

@container(max-width:720px) { .format-bar { top:auto; bottom:70px; max-width:calc(100% - 20px); }
.format-button { padding:0 9px; }
.popover { top:auto; bottom:48px; }
.canvas-hint { display:none; }
.left-tools { left:10px; }
.zoom-controls { right:10px; bottom:12px; } }
`;
