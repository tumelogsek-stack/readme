"use client";

import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Image from "next/image";
import { cleanBookTitle } from "../utils/book";
import type { HighlightItem } from "./HighlightsSidebar";
import type { BookMetadata } from "./Library";

interface Collection {
  id: number;
  name: string;
  emoji: string;
  created_at: string;
}

interface AllHighlightsProps {
  onJumpToHighlight: (bookTitle: string, cfi: string) => void;
}

const EMOJI_OPTIONS = ["📌", "💡", "😂", "🧠", "❤️", "⭐", "🔥", "📖", "✨", "🎯", "💎", "🌟"];

export default function AllHighlights({ onJumpToHighlight }: AllHighlightsProps) {
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedBookTitle, setSelectedBookTitle] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [collectionHighlights, setCollectionHighlights] = useState<HighlightItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<"highlights" | "collections">("highlights");
  
  // Collection creation
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionEmoji, setNewCollectionEmoji] = useState("📌");

  // Collection assignment dropdown
  const [assigningHighlightId, setAssigningHighlightId] = useState<number | null>(null);
  const [highlightCollectionMap, setHighlightCollectionMap] = useState<Record<number, number[]>>({});

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allHighlights, allBooks, allCollections] = await Promise.all([
        invoke<HighlightItem[]>("get_all_highlights"),
        invoke<BookMetadata[]>("get_all_books"),
        invoke<Collection[]>("get_all_collections"),
      ]);
      setHighlights(allHighlights);
      setBooks(allBooks);
      setCollections(allCollections);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load highlights for selected collection
  useEffect(() => {
    if (selectedCollectionId === null) {
      setCollectionHighlights([]);
      return;
    }
    (async () => {
      try {
        const items = await invoke<HighlightItem[]>("get_highlights_by_collection", {
          collectionId: selectedCollectionId,
        });
        setCollectionHighlights(items);
      } catch (err) {
        console.error("Failed to fetch collection highlights:", err);
      }
    })();
  }, [selectedCollectionId]);

  // Load collection assignments for a highlight when assigning
  const loadHighlightCollections = useCallback(async (highlightId: number) => {
    try {
      const cols = await invoke<Collection[]>("get_highlight_collections", { highlightId });
      setHighlightCollectionMap(prev => ({
        ...prev,
        [highlightId]: cols.map(c => c.id),
      }));
    } catch (err) {
      console.error("Failed to load highlight collections:", err);
    }
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this highlight?")) return;
    try {
      await invoke("delete_highlight", { id });
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      setCollectionHighlights((prev) => prev.filter((h) => h.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error("Failed to delete highlight:", err);
    }
  };

  const handleUpdateNote = async (id: number, notes: string) => {
    try {
      await invoke("update_highlight_notes", { id, notes });
      setHighlights((prev) =>
        prev.map((h) => (h.id === id ? { ...h, notes } : h))
      );
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const created = await invoke<Collection>("create_collection", {
        name: newCollectionName.trim(),
        emoji: newCollectionEmoji,
      });
      setCollections(prev => [...prev, created]);
      setNewCollectionName("");
      setNewCollectionEmoji("📌");
      setShowNewCollection(false);
    } catch (err) {
      console.error("Failed to create collection:", err);
    }
  };

  const handleDeleteCollection = async (id: number) => {
    if (!confirm("Delete this collection? Highlights will not be deleted.")) return;
    try {
      await invoke("delete_collection", { id });
      setCollections(prev => prev.filter(c => c.id !== id));
      if (selectedCollectionId === id) {
        setSelectedCollectionId(null);
        setCollectionHighlights([]);
      }
    } catch (err) {
      console.error("Failed to delete collection:", err);
    }
  };

  const handleToggleCollectionAssignment = async (highlightId: number, collectionId: number) => {
    const currentCollections = highlightCollectionMap[highlightId] || [];
    const isAssigned = currentCollections.includes(collectionId);
    
    try {
      if (isAssigned) {
        await invoke("remove_highlight_from_collection", { highlightId, collectionId });
        setHighlightCollectionMap(prev => ({
          ...prev,
          [highlightId]: (prev[highlightId] || []).filter(id => id !== collectionId),
        }));
      } else {
        await invoke("add_highlight_to_collection", { highlightId, collectionId });
        setHighlightCollectionMap(prev => ({
          ...prev,
          [highlightId]: [...(prev[highlightId] || []), collectionId],
        }));
      }
    } catch (err) {
      console.error("Failed to toggle collection assignment:", err);
    }
  };

  // Derive unique colors from highlights
  const uniqueColors = Array.from(new Set(highlights.map(h => h.color)));

  // Filter logic
  let filteredHighlights = highlights;
  if (selectedBookTitle) {
    filteredHighlights = filteredHighlights.filter(h => h.book_title === selectedBookTitle);
  }
  if (selectedColor) {
    filteredHighlights = filteredHighlights.filter(h => h.color === selectedColor);
  }

  const booksWithHighlights = books.filter(b =>
    highlights.some(h => h.book_title === b.title)
  );

  if (isLoading) {
    return <div className="library-loading">Loading notes...</div>;
  }

  return (
    <div className="all-highlights-container">
      <div className="library-header">
        <h1>My Highlights</h1>
      </div>

      {/* View Toggle */}
      <div className="highlights-view-tabs">
        <button
          className={`view-tab ${activeView === "highlights" ? "active" : ""}`}
          onClick={() => { setActiveView("highlights"); setSelectedCollectionId(null); }}
        >
          Highlights
        </button>
        <button
          className={`view-tab ${activeView === "collections" ? "active" : ""}`}
          onClick={() => setActiveView("collections")}
        >
          Collections
        </button>
      </div>

      {activeView === "highlights" ? (
        <>
          {/* Book Selector */}
          {booksWithHighlights.length > 0 && (
            <div className="highlights-book-selector">
              <div
                className={`compact-book-card ${selectedBookTitle === null ? "active" : ""}`}
                onClick={() => setSelectedBookTitle(null)}
              >
                <div className="compact-book-cover selector-all-cover">
                  <span>All</span>
                </div>
                <div className="compact-book-info">
                  <span className="compact-book-title">Entire Library</span>
                </div>
              </div>

              {booksWithHighlights.map((book) => (
                <div
                  key={book.id}
                  className={`compact-book-card ${selectedBookTitle === book.title ? "active" : ""}`}
                  onClick={() => setSelectedBookTitle(book.title)}
                >
                  <div className="compact-book-cover">
                    {book.cover ? (
                      <Image
                        src={book.cover}
                        alt={book.title}
                        width={40}
                        height={60}
                        unoptimized
                      />
                    ) : (
                      <div className="compact-book-placeholder">
                        {book.title.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="compact-book-info">
                    <span className="compact-book-title">{cleanBookTitle(book.title)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Color Filter */}
          {uniqueColors.length > 1 && (
            <div className="color-filter-row">
              <button
                className={`color-filter-btn ${selectedColor === null ? "active" : ""}`}
                onClick={() => setSelectedColor(null)}
              >
                All
              </button>
              {uniqueColors.map(color => (
                <button
                  key={color}
                  className={`color-filter-dot ${selectedColor === color ? "active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                  title={`Filter by ${color}`}
                />
              ))}
            </div>
          )}

          {/* Highlights List */}
          {filteredHighlights.length === 0 ? (
            <div className="library-empty">
              <div className="library-empty-icon">✍️</div>
              <h2>No highlights found</h2>
              <p>Try selecting a different book or color filter!</p>
            </div>
          ) : (
            <div className="highlights-list-global">
              {filteredHighlights.map((hl) => (
                <HighlightCard
                  key={hl.id}
                  hl={hl}
                  isExpanded={expandedId === hl.id}
                  onToggle={() => setExpandedId(expandedId === hl.id ? null : hl.id)}
                  onJump={onJumpToHighlight}
                  onDelete={handleDelete}
                  onUpdateNote={handleUpdateNote}
                  collections={collections}
                  assigningHighlightId={assigningHighlightId}
                  onToggleAssignMenu={(id) => {
                    if (assigningHighlightId === id) {
                      setAssigningHighlightId(null);
                    } else {
                      setAssigningHighlightId(id);
                      loadHighlightCollections(id);
                    }
                  }}
                  highlightCollectionIds={highlightCollectionMap[hl.id] || []}
                  onToggleCollection={handleToggleCollectionAssignment}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* Collections View */
        <div className="collections-view">
          {/* New Collection Button / Form */}
          {showNewCollection ? (
            <div className="new-collection-form">
              <div className="new-collection-emoji-picker">
                {EMOJI_OPTIONS.map(e => (
                  <button
                    key={e}
                    className={`emoji-option ${newCollectionEmoji === e ? "active" : ""}`}
                    onClick={() => setNewCollectionEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="new-collection-input-row">
                <input
                  type="text"
                  className="new-collection-input"
                  placeholder="Collection name..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCollection()}
                  autoFocus
                />
                <button className="new-collection-save" onClick={handleCreateCollection}>
                  Create
                </button>
                <button className="new-collection-cancel" onClick={() => setShowNewCollection(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="add-collection-btn" onClick={() => setShowNewCollection(true)}>
              + New Collection
            </button>
          )}

          {/* Selected Collection View */}
          {selectedCollectionId !== null ? (
            <div className="collection-detail-view">
              <button className="collection-back-btn" onClick={() => setSelectedCollectionId(null)}>
                ← All Collections
              </button>
              <h2 className="collection-detail-title">
                {collections.find(c => c.id === selectedCollectionId)?.emoji}{" "}
                {collections.find(c => c.id === selectedCollectionId)?.name}
              </h2>
              {collectionHighlights.length === 0 ? (
                <div className="library-empty">
                  <p>No highlights in this collection yet. Add some from the Highlights tab!</p>
                </div>
              ) : (
                <div className="highlights-list-global">
                  {collectionHighlights.map((hl) => (
                    <HighlightCard
                      key={hl.id}
                      hl={hl}
                      isExpanded={expandedId === hl.id}
                      onToggle={() => setExpandedId(expandedId === hl.id ? null : hl.id)}
                      onJump={onJumpToHighlight}
                      onDelete={handleDelete}
                      onUpdateNote={handleUpdateNote}
                      collections={collections}
                      assigningHighlightId={assigningHighlightId}
                      onToggleAssignMenu={(id) => {
                        if (assigningHighlightId === id) {
                          setAssigningHighlightId(null);
                        } else {
                          setAssigningHighlightId(id);
                          loadHighlightCollections(id);
                        }
                      }}
                      highlightCollectionIds={highlightCollectionMap[hl.id] || []}
                      onToggleCollection={handleToggleCollectionAssignment}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Collection Cards Grid */
            <div className="collections-grid">
              {collections.length === 0 ? (
                <div className="library-empty">
                  <div className="library-empty-icon">📂</div>
                  <h2>No collections yet</h2>
                  <p>Create one to organize your highlights!</p>
                </div>
              ) : (
                collections.map(col => (
                  <div
                    key={col.id}
                    className="collection-card"
                    onClick={() => setSelectedCollectionId(col.id)}
                  >
                    <span className="collection-card-emoji">{col.emoji}</span>
                    <span className="collection-card-name">{col.name}</span>
                    <button
                      className="collection-card-delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCollection(col.id); }}
                      title="Delete collection"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HighlightCard({
  hl,
  isExpanded,
  onToggle,
  onJump,
  onDelete,
  onUpdateNote,
  collections,
  assigningHighlightId,
  onToggleAssignMenu,
  highlightCollectionIds,
  onToggleCollection,
}: {
  hl: HighlightItem;
  isExpanded: boolean;
  onToggle: () => void;
  onJump: (t: string, c: string) => void;
  onDelete: (id: number) => void;
  onUpdateNote: (id: number, notes: string) => void;
  collections: Collection[];
  assigningHighlightId: number | null;
  onToggleAssignMenu: (id: number) => void;
  highlightCollectionIds: number[];
  onToggleCollection: (highlightId: number, collectionId: number) => void;
}) {
  const textLength = hl.text.length;

  return (
    <div className={`highlight-item-global ${isExpanded ? "expanded" : "collapsed"}`}>
      <div
        className="highlight-item-content"
        onClick={onToggle}
      >
        <div
          className="highlight-bar"
          style={{ backgroundColor: hl.color }}
        />
        <div className="highlight-text-container">
          <p className="highlight-text-global">&ldquo;{hl.text}&rdquo;</p>
          {textLength > 100 && (
            <button className="expand-toggle-btn">
              {isExpanded ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="highlight-expanded-body">
          <div className="highlight-item-note-global">
            <label className="global-note-label">MY ANNOTATION</label>
            <textarea
              className="global-note-input"
              placeholder="Add your thoughts..."
              defaultValue={hl.notes}
              onBlur={(e) => onUpdateNote(hl.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="highlight-item-footer">
            <span className="highlight-book-title">{cleanBookTitle(hl.book_title)}</span>
            <span className="highlight-date">
              {new Date(hl.created_at).toLocaleDateString()}
            </span>
          </div>

          <div className="highlight-item-actions">
            <button
              className="delete-btn-global"
              onClick={(e) => { e.stopPropagation(); onDelete(hl.id); }}
            >
              Delete
            </button>
            
            {/* Collection Assignment Button */}
            <div className="collection-assign-wrapper">
              <button
                className="collection-assign-btn"
                onClick={(e) => { e.stopPropagation(); onToggleAssignMenu(hl.id); }}
                title="Add to collection"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>

              {assigningHighlightId === hl.id && (
                <div className="collection-assign-dropdown" onClick={(e) => e.stopPropagation()}>
                  {collections.length === 0 ? (
                    <div className="collection-assign-empty">No collections. Create one first!</div>
                  ) : (
                    collections.map(col => (
                      <button
                        key={col.id}
                        className={`collection-assign-option ${highlightCollectionIds.includes(col.id) ? "assigned" : ""}`}
                        onClick={() => onToggleCollection(hl.id, col.id)}
                      >
                        <span>{col.emoji} {col.name}</span>
                        {highlightCollectionIds.includes(col.id) && <span className="check-mark">✓</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              className="jump-btn-global"
              onClick={(e) => { e.stopPropagation(); onJump(hl.book_title, hl.cfi); }}
            >
              Go to Book
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
