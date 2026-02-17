"use client";

import React, { useState, useCallback } from "react";
import Library, { type BookMetadata } from "./components/Library";
import Reader, { type HighlightPayload } from "./components/Reader";
import HighlightsSidebar from "./components/HighlightsSidebar";
import type { HighlightItem } from "./components/HighlightsSidebar";
import Navbar from "./components/Navbar";
import AllHighlights from "./components/AllHighlights";

export default function Home() {
  const [view, setView] = useState<"library" | "reader" | "highlights">("library");
  const [currentBook, setCurrentBook] = useState<BookMetadata | null>(null);
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [highlightColor] = useState("#facc15");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      
      // Important: temporarily override the last_cfi with the highlight location
      const bookToOpen = { ...book, last_cfi: cfi };
      setCurrentBook(bookToOpen);

      // Fetch saved highlights for this book
      const saved = await invoke<HighlightItem[]>("get_highlights", {
        bookTitle: book.title,
      });
      setHighlights(saved);
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
      setCurrentBook(book);

      // Fetch saved highlights
      const saved = await invoke<HighlightItem[]>("get_highlights", {
        bookTitle: book.title,
      });
      setHighlights(saved);
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
      if (!currentBook) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_book_progress", {
          title: currentBook.title,
          cfi,
          percentage,
        });
      } catch (err) {
        console.warn("Failed to update progress:", err);
      }
    },
    [currentBook]
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

  if (view !== "reader") {
    return (
      <div className="home-layout">
        <Navbar currentView={view} onViewChange={setView} />
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
      />
      <HighlightsSidebar
        highlights={highlights}
        onNavigate={onNavigate}
        onDelete={onDelete}
        onUpdateNote={onUpdateNote}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
    </div>
  );
}
