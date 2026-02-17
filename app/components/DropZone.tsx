"use client";

import React, { useCallback, useState } from "react";

interface DropZoneProps {
  onFileLoad: (data: ArrayBuffer, fileName: string) => void;
}

export default function DropZone({ onFileLoad }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".epub")) return;
      const buf = await file.arrayBuffer();
      onFileLoad(buf, file.name);
    },
    [onFileLoad]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const openDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (result) {
        const path = typeof result === "string" ? result : (result as unknown as string);
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(path);
        const buf = bytes.buffer as ArrayBuffer;
        const name = path.split(/[\\/]/).pop() || "book.epub";
        onFileLoad(buf, name);
      }
    } catch {
      // fallback: Tauri APIs not available (e.g. in browser dev)
      document.getElementById("epub-input")?.click();
    }
  }, [onFileLoad]);

  return (
    <div className="drop-zone-container">
      <div
        className={`drop-zone ${dragOver ? "drag-over" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className="drop-zone-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
        </div>
        <h2 className="drop-zone-title">Open an EPUB</h2>
        <p className="drop-zone-subtitle">
          Drag &amp; drop your <code>.epub</code> file here
        </p>
        <button className="drop-zone-button" onClick={openDialog} type="button">
          Choose File
        </button>
        <input
          id="epub-input"
          type="file"
          accept=".epub"
          style={{ display: "none" }}
          onChange={onInputChange}
        />
      </div>
    </div>
  );
}
