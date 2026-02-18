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
      {/* Sidebar */}
      <div className={`highlights-sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3>Highlights</h3>
          <button className="sidebar-close" onClick={onToggle} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sidebar-list">
          {highlights.length === 0 ? (
            <div className="sidebar-empty">
              <p>No highlights yet.</p>
            </div>
          ) : (
            highlights.map((hl) => (
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
                  
                  {hl.notes && (
                    <div className="sidebar-item-note-container" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className="sidebar-item-note-input"
                        placeholder="Add your thoughts..."
                        defaultValue={hl.notes}
                        onBlur={(e) => onUpdateNote(hl.id, e.target.value)}
                        rows={1}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = target.scrollHeight + 'px';
                        }}
                      />
                    </div>
                  )}

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
                        <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}
    </>
  );
}
