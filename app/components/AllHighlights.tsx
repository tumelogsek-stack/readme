"use client";

import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Image from "next/image";
import { cleanBookTitle } from "../utils/book";
import type { HighlightItem } from "./HighlightsSidebar";
import type { BookMetadata } from "./Library";

interface AllHighlightsProps {
  onJumpToHighlight: (bookTitle: string, cfi: string) => void;
}

export default function AllHighlights({ onJumpToHighlight }: AllHighlightsProps) {
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [selectedBookTitle, setSelectedBookTitle] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allHighlights, allBooks] = await Promise.all([
        invoke<HighlightItem[]>("get_all_highlights"),
        invoke<BookMetadata[]>("get_all_books")
      ]);
      setHighlights(allHighlights);
      setBooks(allBooks);
    } catch (err) {
      console.error("Failed to fetch highlights or books:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this highlight?")) return;
    try {
      await invoke("delete_highlight", { id });
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error("Failed to delete highlight:", err);
    }
  };

  const handleUpdateNote = async (id: number, notes: string) => {
    try {
      await invoke("update_highlight_notes", { id, notes });
      setHighlights((prev) => 
        prev.map((h) => h.id === id ? { ...h, notes } : h)
      );
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  };

  const filteredHighlights = selectedBookTitle 
    ? highlights.filter(h => h.book_title === selectedBookTitle)
    : highlights;

  if (isLoading) {
    return <div className="library-loading">Loading notes...</div>;
  }

  const booksWithHighlights = books.filter(b => 
    highlights.some(h => h.book_title === b.title)
  );

  return (
    <div className="all-highlights-container">
      <div className="library-header">
        <h1>My Highlights</h1>
      </div>

      {booksWithHighlights.length > 0 && (
        <div className="highlights-book-selector">
          <div 
            className={`compact-book-card ${selectedBookTitle === null ? 'active' : ''}`}
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
              className={`compact-book-card ${selectedBookTitle === book.title ? 'active' : ''}`}
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

      {filteredHighlights.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-icon">✍️</div>
          <h2>No highlights found</h2>
          <p>Try selecting a different book or start highlighting!</p>
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
            />
          ))}
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
  onUpdateNote 
}: { 
  hl: HighlightItem; 
  isExpanded: boolean;
  onToggle: () => void;
  onJump: (t: string, c: string) => void;
  onDelete: (id: number) => void;
  onUpdateNote: (id: number, notes: string) => void;
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
