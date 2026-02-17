"use client";

import React from "react";

export interface HighlightItem {
  id: number;
  book_title: string;
  cfi: string;
  text: string;
  color: string;
  notes: string;
  created_at: string;
}

interface SidebarProps {
  highlights: HighlightItem[];
  onNavigate: (cfi: string) => void;
  onDelete: (id: number) => void;
  onUpdateNote: (id: number, notes: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function HighlightsSidebar({
  highlights,
  onNavigate,
  onDelete,
  onUpdateNote,
  isOpen,
  onToggle,
}: SidebarProps) {
  return (
    <>
      {/* Toggle button */}
      <button
        className="sidebar-toggle"
        onClick={onToggle}
        type="button"
        aria-label="Toggle highlights"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span className="sidebar-toggle-count">{highlights.length}</span>
      </button>

      {/* Sidebar */}
      <div className={`highlights-sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3>Highlights</h3>
          <span className="sidebar-count">{highlights.length}</span>
          <button className="sidebar-close" onClick={onToggle} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sidebar-list">
          {highlights.length === 0 && (
            <div className="sidebar-empty">
              <p>No highlights yet.</p>
              <p className="sidebar-empty-hint">
                Select text in the reader and choose a color to create a highlight.
              </p>
            </div>
          )}

          {highlights.map((hl) => (
            <div
              key={hl.id}
              className="sidebar-item"
              onClick={() => onNavigate(hl.cfi)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onNavigate(hl.cfi)}
            >
              <div
                className="sidebar-item-color"
                style={{ background: hl.color }}
              />
              <div className="sidebar-item-content">
                <p className="sidebar-item-text">&ldquo;{hl.text}&rdquo;</p>
                
                <div className="sidebar-item-note-container" onClick={(e) => e.stopPropagation()}>
                  <label className="sidebar-item-note-label">ANNOTATION</label>
                  <textarea
                    className="sidebar-item-note-input"
                    placeholder="Add your thoughts..."
                    defaultValue={hl.notes}
                    onBlur={(e) => onUpdateNote(hl.id, e.target.value)}
                  />
                </div>

                <div className="sidebar-item-footer">
                  <span className="sidebar-item-date">
                    {new Date(hl.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    className="sidebar-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(hl.id);
                    }}
                    type="button"
                    aria-label="Delete highlight"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}
    </>
  );
}
