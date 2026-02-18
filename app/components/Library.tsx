"use client";

import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Image from "next/image";
import { cleanBookTitle } from "../utils/book";

export interface BookMetadata {
  id: number;
  title: string;
  filename: string;
  last_cfi?: string;
  cover?: string;
  locations_data?: string;
  last_percentage: number;
  created_at: string;
}

interface LibraryProps {
  onSelectBook: (book: BookMetadata) => void;
}

export default function Library({ onSelectBook }: LibraryProps) {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const allBooks = await invoke<BookMetadata[]>("get_all_books");
      setBooks(allBooks);
    } catch (err) {
      console.error("Failed to fetch books:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleAddBook = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });

      if (result && typeof result === "string") {
        const path = result;
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(path);
        const name = path.split(/[\\/]/).pop() || "book.epub";
        const title = name.replace(/\.epub$/i, "");

        // Extract cover
        let coverBase64: string | undefined = undefined;
        try {
          const { default: ePub } = await import("epubjs");
          const book = ePub(bytes.buffer);
          const coverUrl = await book.coverUrl();
          if (coverUrl) {
            const resp = await fetch(coverUrl);
            const blob = await resp.blob();
            coverBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn("Failed to extract cover:", e);
        }

        const newBook = await invoke<BookMetadata>("add_book", {
          title,
          filename: name,
          cover: coverBase64,
          data: Array.from(bytes),
        });

        setBooks((prev) => {
          const filtered = prev.filter((b) => b.id !== newBook.id);
          return [newBook, ...filtered];
        });
        onSelectBook(newBook);
      }
    } catch (err) {
      console.error("Failed to add book:", err);
      alert("Failed to add book to library.");
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, title: string) => {
    e.stopPropagation();
    const displayTitle = cleanBookTitle(title);
    if (!confirm(`Are you sure you want to remove "${displayTitle}"? This will also delete all highlights for this book.`)) return;
    
    try {
      await invoke("delete_book", { title });
      setBooks((prev) => prev.filter((b) => b.title !== title));
    } catch (err) {
      console.error("Failed to delete book:", err);
      alert("Failed to delete book.");
    }
  };

  return (
    <div className="library-container">
      <div className="library-header">
        <h1>My Library</h1>
        <button className="library-add-btn" onClick={handleAddBook}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Book
        </button>
      </div>

      {isLoading ? (
        <div className="library-loading">Loading your collection...</div>
      ) : books.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-icon">📚</div>
          <h2>Your library is empty</h2>
          <p>Add an EPUB file to start reading.</p>
          <button className="drop-zone-button" onClick={handleAddBook}>
            Choose EPUB
          </button>
        </div>
      ) : (
        <div className="library-grid">
          {books.map((book) => (
            <div
              key={book.id}
              className="book-card"
              onClick={() => onSelectBook(book)}
            >
              <button 
                className="book-delete-btn"
                onClick={(e) => handleDeleteBook(e, book.title)}
                title="Remove book"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              <div className="book-cover-placeholder">
                {book.cover ? (
                  <Image 
                    src={book.cover} 
                    alt={book.title} 
                    className="book-cover-img" 
                    width={150} 
                    height={200}
                    unoptimized
                  />
                ) : (
                  <span>{book.title.charAt(0)}</span>
                )}
              </div>
              <div className="book-info">
                <h3 className="book-title">{cleanBookTitle(book.title)}</h3>
                <div className="book-meta">
                  {book.last_percentage > 0 ? (
                    <>
                      <span className="book-progress-badge">
                        {Math.round(book.last_percentage)}%
                      </span>
                      <span className="book-meta-divider">-</span>
                      <span>Completed</span>
                    </>
                  ) : (
                    <span>New</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
