# @mindflow/mindmap

A framework-independent mindmap model and browser editor. There are no runtime
or peer dependencies. Rendering uses HTML nodes and SVG connectors inside a
shadow DOM. The package does not perform network requests, authenticate users,
change the page URL, or install global keyboard shortcuts.

## Use with any application

```js
import { createMindMap, createBoard } from '@mindflow/mindmap';

const editor = createMindMap(document.querySelector('#mindmap'), {
  data: createBoard('My idea'),
  readOnly: false,
  onChange(data) {
    // A detached JSON-compatible snapshot. Persist it using your own storage.
    console.log(data);
  },
  onSaveRequest() {
    // Optional Ctrl/Cmd+S shortcut while the editor is focused.
    saveDocument(editor.getData());
  },
});

editor.setData(loadedDocument); // Does not trigger onChange.
editor.setReadOnly(true);
editor.centerOnRoot();
editor.focus();
editor.destroy(); // Remove DOM, event handlers, timers, and resize observer.
```

Give the mount container a defined width and height, for example
`<div id="mindmap" style="width:100%;height:500px"></div>`.
Destroy the editor when the host removes it. Create a new instance to remount.
An editor owns its contents, but leaves sibling host content untouched.

The compiled `dist/index.js` is also a native browser ES module. A plain HTML
page can import it directly without a bundler; serve the complete `dist/`
directory so its relative module imports resolve. No stylesheet import is needed.
See [the plain HTML example](examples/index.html) for two independent instances,
JSON loading, and read-only mode. Build the package, serve the repository with
`python3 -m http.server 8080`, and open
`http://localhost:8080/packages/mindmap/examples/`.

## Editing

Select a node, press Tab or its plus button to add a child, double-click to edit
text, and press Delete/Backspace to delete. Drag a node to move its entire branch.
Right-click for duplication, manual connections, reparenting, and branch colors.
Use the toolbar to style connectors. Wheel and two-finger pinch zoom around the
pointer; drag the background to pan. Shortcuts apply only inside the editor.
Read-only mode allows selection and navigation but blocks document edits.

Deleting a node preserves its children as independent roots and removes edges
attached to the deleted node. Reparenting rejects cycles. External `setData`
updates cancel active edits and gestures, preserve the viewport, and emit no
change callback, so a host can use them for collaboration without an echo loop.
`onChange` fires for local document edits, including each drag/text update; hosts
should debounce persistence if desired. Collaboration conflict resolution is
owned by the host.

## Model without a browser

```js
import { addChild, createBoard, isBoardData } from '@mindflow/mindmap/model';
const { board, nodeId } = addChild(createBoard(), 'root');
console.log(isBoardData(board), nodeId);
```

`BoardData` is `{ nodes: NodeItem[], edges: EdgeItem[] }`. Nodes contain `id`,
`text`, `x`, `y`, `color`, and optional `parentId`. Edges contain `id`, `from`,
`to`, `color`, `shape` (`curve`, `straight`, `elbow`), `dash` (`solid`, `dashed`,
`dotted`), and optional `manual`. Every parent relationship has a corresponding
non-manual edge. Manual edges are independent cross-links.

The model exports TypeScript types, `createBoard`, `cloneBoard`, `isBoardData`,
`normalizeBoard`, `descendantIds`, `addChild`, `deleteNode`, `duplicateNode`,
`reparentNode`, `connectNodes`, `colorBranch`, and `pathFor`. Operations leave
inputs unchanged. `normalizeBoard` repairs dangling references from older
Mindflow documents and rejects invalid shapes or inconsistent graphs.
Browser globals are accessed only when mounting. ID creation uses
`crypto.randomUUID()` (a secure browser context or a modern Node.js runtime).

## Build and distribute

From this directory, run `npm install`, `npm run build`, and `npm pack`.
The archive contains ES modules, TypeScript declarations, documentation, and
the HTML example; consuming applications need no TypeScript build step.
From the repository root, use `npm run build:mindmap` and
`npm test --workspace @mindflow/mindmap`.
