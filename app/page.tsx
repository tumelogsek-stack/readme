"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Library, { type BookMetadata } from "./components/Library";
import Reader, { type HighlightPayload } from "./components/Reader";
import HighlightsSidebar from "./components/HighlightsSidebar";
import type { HighlightItem } from "./components/HighlightsSidebar";
import Navbar from "./components/Navbar";
import AllHighlights from "./components/AllHighlights";
import { saveProgress, getProgress, clearDatabase } from "./utils/db";

export interface BookmarkItem {
  id: number;
  book_title: string;
  cfi: string;
  label: string;
  created_at: string;
}

export default function Home() {
  const [view, setView] = useState<"library" | "reader" | "highlights">("library");
  const [currentBook, setCurrentBook] = useState<BookMetadata | null>(null);
  const currentBookRef = useRef<BookMetadata | null>(null);
  useEffect(() => { currentBookRef.current = currentBook; }, [currentBook]);

  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [highlightColor] = useState("#facc15");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Jump to specific book and CFI
  const onJumpToHighlight = useCallback(async (bookTitle: string, cfi: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      
      // Get all books to find the one we need
      const allBooks = await invoke<BookMetadata[]>("get_all_books");
      const book = allBooks.find(b => b.title === bookTitle);
      
      if (!book) {
        throw new Error("Book not found in library");
      }

      // Load content
      const data = await invoke<number[]>("get_book_content", {
        filename: book.filename,
      });
      
      const buf = new Uint8Array(data).buffer;
      setBookData(buf);
      
      // Reconcile IndexedDB vs Database
      let finalCfi = cfi;
      try {
        const localProgress = await getProgress(book.title);
        if (localProgress && localProgress.cfi) {
          finalCfi = localProgress.cfi;
          console.log("Recovered progress from IndexedDB:", finalCfi);
        } else {
          // Fallback to localStorage for legacy progress if needed
          const localKey = `reading-progress-${book.title}`;
          const localData = localStorage.getItem(localKey);
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed.cfi) finalCfi = parsed.cfi;
          }
        }
      } catch (e) {
        console.warn("Failed to reconcile progress:", e);
      }

      const bookToOpen = { ...book, last_cfi: (typeof finalCfi === 'string' && finalCfi) ? finalCfi : undefined };
      setCurrentBook(bookToOpen);

      // Fetch saved highlights for this book
      const saved = await invoke<HighlightItem[]>("get_highlights", {
        bookTitle: book.title,
      });
      setHighlights(saved);

      // Fetch saved bookmarks
      const bks = await invoke<BookmarkItem[]>("get_bookmarks", {
        bookTitle: book.title,
      });
      setBookmarks(bks);

      setView("reader");
    } catch (err) {
      console.error("Failed to jump to highlight:", err);
      setError("Failed to open book at highlight location.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load book from library
  const onSelectBook = useCallback(async (book: BookMetadata) => {
    setIsLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<number[]>("get_book_content", {
        filename: book.filename,
      });
      
      const buf = new Uint8Array(data).buffer;
      setBookData(buf);

      // Fetch saved highlights
      const saved = await invoke<HighlightItem[]>("get_highlights", {
        bookTitle: book.title,
      });
      setHighlights(saved);

      // Fetch saved bookmarks
      const bks = await invoke<BookmarkItem[]>("get_bookmarks", {
        bookTitle: book.title,
      });
      setBookmarks(bks);

      // Reconcile IndexedDB vs Database
      let finalCfi = book.last_cfi;
      console.log(`[Progress] SQLite CFI for "${book.title}":`, finalCfi || "(empty)");
      try {
        const localProgress = await getProgress(book.title);
        if (localProgress && localProgress.cfi) {
          console.log(`[Progress] IndexedDB CFI:`, localProgress.cfi.substring(0, 50));
          finalCfi = localProgress.cfi;
        } else {
          // Fallback to localStorage for legacy
          const localKey = `reading-progress-${book.title}`;
          const localData = localStorage.getItem(localKey);
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed.cfi) {
              console.log(`[Progress] localStorage CFI:`, parsed.cfi.substring(0, 50));
              finalCfi = parsed.cfi;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to reconcile progress:", e);
      }

      console.log(`[Progress] Final CFI:`, finalCfi ? finalCfi.substring(0, 50) : "(none)");
      setCurrentBook({ ...book, last_cfi: (typeof finalCfi === 'string' && finalCfi) ? finalCfi : undefined });
      setView("reader");
    } catch (err) {
      console.error("Failed to load book content:", err);
      setError("Failed to open book. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update reading progress
  const onLocationChange = useCallback(
    async (cfi: string, percentage: number) => {
      const book = currentBookRef.current;
      if (!book) return;
      
      // 1. Instant Local Persistence (IndexedDB)
      saveProgress({
        bookTitle: book.title,
        cfi,
        percentage
      });

      // Maintain legacy localStorage for safety during transition
      localStorage.setItem(`reading-progress-${book.title}`, JSON.stringify({
        cfi,
        percentage,
        timestamp: Date.now()
      }));

      // Update local state without triggering a full re-render of Reader if possible
      // (However, since Reader uses currentBook.title for key, it won't re-mount if title is same)
      setCurrentBook(prev => prev ? { ...prev, last_cfi: cfi, last_percentage: percentage } : null);

      // 2. Debounced Backend Sync
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      syncTimeoutRef.current = setTimeout(async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("update_book_progress", {
            title: book.title,
            cfi,
            percentage,
          });
        } catch (err) {
          console.warn("Failed to sync progress to backend:", err);
        }
      }, 1000); // 1.0 second delay
    },
    [] // Stable dependency
  );

  // Update book locations cache
  const onBookInit = useCallback(
    async (locations_data: string) => {
      if (!currentBook) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_book_locations", {
          title: currentBook.title,
          locationsData: locations_data,
        });
        setCurrentBook(prev => prev ? { ...prev, locations_data } : null);
      } catch (err) {
        console.error("Failed to update book locations:", err);
      }
    },
    [currentBook]
  );

  // Create highlight
  const onHighlight = useCallback(
    async (payload: HighlightPayload) => {
      if (!currentBook) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const hl = await invoke<HighlightItem>("add_highlight", {
          bookTitle: currentBook.title,
          cfi: payload.cfi,
          text: payload.text,
          color: highlightColor,
          notes: payload.notes || "",
        });
        setHighlights((prev) => [hl, ...prev]);
        console.log("Highlight saved successfully");
      } catch (err) {
        console.error("Failed to save highlight:", err);
        alert("Failed to save highlight to database.");
      }
    },
    [currentBook, highlightColor]
  );

  // Delete highlight
  const onDelete = useCallback(async (id: number) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_highlight", { id });
      setHighlights((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      console.error("Failed to delete highlight:", err);
    }
  }, []);

  // Update highlight note
  const onUpdateNote = useCallback(async (id: number, notes: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_highlight_notes", { id, notes });
      setHighlights((prev) => 
        prev.map((h) => h.id === id ? { ...h, notes } : h)
      );
    } catch (err) {
      console.error("Failed to update highlight note:", err);
    }
  }, []);

  // Add bookmark
  const onAddBookmark = useCallback(async (label: string, cfi: string) => {
    if (!currentBook) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const bk = await invoke<BookmarkItem>("add_bookmark", {
        bookTitle: currentBook.title,
        cfi,
        label,
      });
      setBookmarks((prev) => [bk, ...prev]);
    } catch (err) {
      console.error("Failed to add bookmark:", err);
    }
  }, [currentBook]);

  // Delete bookmark
  const onDeleteBookmark = useCallback(async (id: number) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_bookmark", { id });
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
    }
  }, []);

  // Navigate to highlight CFI
  const onNavigate = useCallback((_cfi: string) => {
    window.dispatchEvent(new CustomEvent("navigate-cfi", { detail: _cfi }));
    setSidebarOpen(false);
  }, []);

  const goBack = useCallback(() => {
    setView("library");
    setBookData(null);
    setCurrentBook(null);
    setHighlights([]);
    setError(null);
  }, []);

  const fullReset = useCallback(async () => {
    if (!confirm("Are you sure you want to WIPE ALL DATA? This cannot be undone.")) return;
    setIsLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      
      // 1. Backend Wipe (SQLite + Files)
      await invoke("wipe_all_data");
      
      // 2. Frontend Wipe (IndexedDB)
      await clearDatabase();
      
      // 3. Frontend Wipe (localStorage)
      localStorage.clear();
      
      // 4. Reset state & Reload
      window.location.reload();
    } catch (err) {
      console.error("Failed to wipe data:", err);
      alert("Failed to wipe all data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (view !== "reader") {
    return (
      <div className="home-layout">
        <Navbar currentView={view} onViewChange={setView} />
        {/* Hidden Wipe Button */}
        <button 
          onClick={fullReset}
          style={{ 
            position: 'fixed', 
            bottom: '10px', 
            left: '10px', 
            opacity: 0.1, 
            fontSize: '10px',
            zIndex: 999
          }}
        >
          WIPE
        </button>
        <main className="main-content">
          {view === "library" ? (
            <Library onSelectBook={onSelectBook} />
          ) : (
            <AllHighlights onJumpToHighlight={onJumpToHighlight} />
          )}
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={goBack} className="drop-zone-button">Back to Library</button>
      </div>
    );
  }

  if (!bookData || !currentBook) {
    return null;
  }

  return (
    <div className="app-layout">
      {isLoading && <div className="loading-overlay">Loading...</div>}
      <Reader
        key={currentBook.title}
        bookData={bookData}
        bookTitle={currentBook.title}
        initialCfi={currentBook.last_cfi}
        onHighlight={onHighlight}
        onLocationChange={onLocationChange}
        highlightColor={highlightColor}
        savedHighlights={highlights.map((h) => ({ cfi: h.cfi, color: h.color }))}
        onBack={goBack}
        savedLocations={currentBook.locations_data}
        onBookInit={onBookInit}
        onToggleHighlights={() => setSidebarOpen((v) => !v)}
        highlightsCount={highlights.length + bookmarks.length}
        onAddBookmark={onAddBookmark}
      />
      <HighlightsSidebar
        highlights={highlights}
        bookmarks={bookmarks}
        onNavigate={onNavigate}
        onDelete={onDelete}
        onDeleteBookmark={onDeleteBookmark}
        onUpdateNote={onUpdateNote}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
    </div>
  );
}
