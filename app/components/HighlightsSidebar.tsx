import React, { useState } from "react";

export interface HighlightItem {
  id: number;
  book_title: string;
  cfi: string;
  text: string;
  color: string;
  notes: string;
  created_at: string;
}

export interface BookmarkItem {
  id: number;
  book_title: string;
  cfi: string;
  label: string;
  created_at: string;
}

interface SidebarProps {
  highlights: HighlightItem[];
  bookmarks: BookmarkItem[];
  onNavigate: (cfi: string) => void;
  onDelete: (id: number) => void;
  onDeleteBookmark: (id: number) => void;
  onUpdateNote: (id: number, notes: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function HighlightsSidebar({
  highlights,
  bookmarks,
  onNavigate,
  onDelete,
  onDeleteBookmark,
  onUpdateNote,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<"highlights" | "bookmarks">("highlights");
  return (
    <>
      {/* Sidebar */}
      <div className={`highlights-sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-tabs">
            <button 
              className={`sidebar-tab ${activeTab === "highlights" ? "active" : ""}`}
              onClick={() => setActiveTab("highlights")}
            >
              Highlights
            </button>
            <button 
              className={`sidebar-tab ${activeTab === "bookmarks" ? "active" : ""}`}
              onClick={() => setActiveTab("bookmarks")}
            >
              Bookmarks
            </button>
          </div>
          <button className="sidebar-close" onClick={onToggle} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sidebar-list">
          {activeTab === "highlights" ? (
            highlights.length === 0 ? (
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
                    
                    {hl.notes !== undefined && (
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
            )
          ) : (
            bookmarks.length === 0 ? (
              <div className="sidebar-empty">
                <p>No bookmarks yet.</p>
              </div>
            ) : (
              bookmarks.map((bk) => (
                <div
                  key={bk.id}
                  className="sidebar-item bookmark-item"
                  onClick={() => onNavigate(bk.cfi)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onNavigate(bk.cfi)}
                >
                  <div className="sidebar-item-content">
                    <div className="sidebar-item-header">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      <h4 className="bookmark-label">{bk.label}</h4>
                    </div>
                    
                    <div className="sidebar-item-footer">
                      <span className="sidebar-item-date">
                        {new Date(bk.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <button
                        className="sidebar-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBookmark(bk.id);
                        }}
                        type="button"
                        aria-label="Delete bookmark"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}
    </>
  );
}
