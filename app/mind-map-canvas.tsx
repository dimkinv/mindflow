"use client";

import { useEffect, useRef } from "react";
import { createMindMap, type BoardData, type MindMapEditor } from "@mindflow/mindmap";

/** React lifecycle adapter only; the package owns all editor state and DOM. */
export function MindMapCanvas({ data, readOnly, onChange, onSaveRequest }: {
  data: BoardData;
  readOnly: boolean;
  onChange: (data: BoardData) => void;
  onSaveRequest: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<MindMapEditor | null>(null);
  const currentData = useRef(data);
  const callbacks = useRef({ onChange, onSaveRequest });
  useEffect(() => { callbacks.current = { onChange, onSaveRequest }; }, [onChange, onSaveRequest]);
  useEffect(() => {
    const instance = createMindMap(container.current!, {
      data: currentData.current,
      onChange(next) { currentData.current = next; callbacks.current.onChange(next); },
      onSaveRequest() { callbacks.current.onSaveRequest(); },
    });
    editor.current = instance;
    return () => { instance.destroy(); editor.current = null; };
  }, []);
  useEffect(() => {
    if (currentData.current !== data) { editor.current?.setData(data); currentData.current = data; }
  }, [data]);
  useEffect(() => { editor.current?.setReadOnly(readOnly); }, [readOnly]);
  return <div ref={container} style={{ width: "100%", height: "100%" }} />;
}
