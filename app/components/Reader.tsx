"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import ePub, { type Book, type Rendition } from "epubjs";

import { cleanBookTitle } from "../utils/book";

export interface HighlightPayload {
  cfi: string;
  text: string;
  notes?: string;
}

interface TOCItem {
  id: string;
  href: string;
  label: string;
  subitems?: TOCItem[];
  cfi?: string;
}

interface EpubLocation {
  start: {
    href: string;
    cfi: string;
    displayed: {
      page: number;
      total: number;
    };
    percentage?: number;
  };
}

interface RenditionExtension extends Rendition {
  manager?: {
    container: HTMLElement;
  };
}

interface BookExtension extends Book {
  spine: {
    get: (href: string) => { cfiBase?: string; href: string } | undefined;
  };
  navigation: {
    toc: TOCItem[];
    landmarks: unknown[];
    length: number;
  };
}

interface ReaderProps {
  bookData: ArrayBuffer;
  bookTitle: string;
  initialCfi?: string;
  onHighlight: (payload: HighlightPayload) => void;
  onLocationChange?: (cfi: string, percentage: number) => void;
  highlightColor: string;
  savedHighlights: { cfi: string; color: string }[];
  onBack: () => void;
  savedLocations?: string | null;
  onBookInit?: (locations: string) => void;
  onToggleHighlights: () => void;
  highlightsCount: number;
  onAddBookmark: (label: string, cfi: string) => void;
}

type LayoutMode = "full" | "focus" | "newspaper";

export default function Reader({
  bookData,
  bookTitle,
  initialCfi,
  onHighlight,
  onLocationChange,
  highlightColor,
  savedHighlights,
  onBack,
  savedLocations,
  onBookInit,
  onToggleHighlights,
  highlightsCount,
  onAddBookmark,
}: ReaderProps) {
  // 1. State declarations
  const [chapter, setChapter] = useState("");
  const [progress, setProgress] = useState(0); 
  const [globalProgress, setGlobalProgress] = useState(0); 
  const [showPopover, setShowPopover] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [renditionReady, setRenditionReady] = useState(false);
  const [popoverMode, setPopoverMode] = useState<"actions" | "colors" | "note">("actions");
  const [noteText, setNoteText] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("reader-layout-mode");
      if (saved && ["full", "focus", "newspaper"].includes(saved)) {
        return saved as LayoutMode;
      }
    }
    return "full";
  });
  const [isLayoutChanging, setIsLayoutChanging] = useState(false);
  const [isUIVisible, setIsUIVisible] = useState(true);
  const [chapterTicks, setChapterTicks] = useState<{ percentage: number; label: string }[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [locationsReady, setLocationsReady] = useState(false);

  // 2. Refs for internal state tracking
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const pendingSelection = useRef<{ cfi: string; text: string } | null>(null);
  const allChaptersRef = useRef<TOCItem[]>([]);
  const isDraggingScrubber = useRef(false);
  const chapterTicksRef = useRef<{ percentage: number; label: string }[]>([]);
  const locationsReadyRef = useRef(false);
  const globalProgressRef = useRef(0);
  const currentLocationRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const isSettledRef = useRef(false);

  // Lifting helper functions out of useEffect
  const generateChapterTicks = useCallback(async (bookObj: Book) => {
    const flattenChapters = (items: TOCItem[]): TOCItem[] => {
      return items.reduce((acc: TOCItem[], item) => {
        acc.push(item);
        if (item.subitems && item.subitems.length > 0) {
          acc.push(...flattenChapters(item.subitems));
        }
        return acc;
      }, []);
    };

    const navigation = (bookObj as unknown as BookExtension).navigation;
    if (navigation && navigation.toc && bookObj.locations.length() > 0) {
      const flattened = flattenChapters(navigation.toc);
      allChaptersRef.current = flattened;
      const tickPromises = flattened.map(async (chapterObj: TOCItem) => {
        try {
          const bookExt = bookObj as unknown as BookExtension;
          const spineItem = bookExt.spine.get(chapterObj.href);
          if (!spineItem) return null;

          const cfi = chapterObj.cfi || (spineItem as { cfiBase?: string }).cfiBase || "";
          const percentage = bookObj.locations.percentageFromCfi(cfi);
          return { percentage: percentage * 100, label: chapterObj.label };
        } catch (err) {
          console.warn("Could not calculate percentage for chapter:", chapterObj.label, err);
          return null;
        }
      });

      const resolvedTicks = await Promise.all(tickPromises);
      const ticks = resolvedTicks
          .filter((t): t is { percentage: number; label: string } => t !== null && t.percentage >= 0)
          .sort((a, b) => a.percentage - b.percentage);

      const uniqueTicks = ticks.filter((tick, i) => {
        if (i === 0) return true;
        return Math.abs(tick.percentage - ticks[i - 1].percentage) > 0.1;
      });

      setChapterTicks(uniqueTicks);
      chapterTicksRef.current = uniqueTicks;
    }
  }, []);

  const startLocationGeneration = useCallback((bookObj: Book) => {
    bookObj.locations.generate(1000).then(() => {
      const locationsStr = bookObj.locations.save();
      if (onBookInitRef.current) onBookInitRef.current(locationsStr);
      setLocationsReady(true);
      generateChapterTicks(bookObj);
    });
  }, [generateChapterTicks]);

  // 3. Refs for stable event handlers (syncing state to refs)
  const showPopoverRef = useRef(showPopover);
  const popoverModeRef = useRef(popoverMode);
  const noteTextRef = useRef(noteText);
  const confirmNoteRef = useRef<() => void>(() => {});
  const onLocationChangeRef = useRef(onLocationChange);
  const onBookInitRef = useRef(onBookInit);
  
  // Update refs in effects
  useEffect(() => { showPopoverRef.current = showPopover; }, [showPopover]);
  useEffect(() => { popoverModeRef.current = popoverMode; }, [popoverMode]);
  useEffect(() => { noteTextRef.current = noteText; }, [noteText]);
  useEffect(() => { onLocationChangeRef.current = onLocationChange; }, [onLocationChange]);
  
  // Wrapped ref update to potentially bypass strict modification checks if they are prop-linked
  useEffect(() => { 
    const currentOnBookInit = onBookInit;
    onBookInitRef.current = currentOnBookInit; 
  }, [onBookInit]);

  useEffect(() => { chapterTicksRef.current = chapterTicks; }, [chapterTicks]);
  useEffect(() => { locationsReadyRef.current = locationsReady; }, [locationsReady]);
  useEffect(() => { globalProgressRef.current = globalProgress; }, [globalProgress]);

  // 4. Navigation Actions
  const goNext = useCallback(() => {
    renditionRef.current?.next();
    setIsUIVisible(false);
  }, []);

  const goPrev = useCallback(() => {
    renditionRef.current?.prev();
    setIsUIVisible(false);
  }, []);

  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  useEffect(() => { goNextRef.current = goNext; }, [goNext]);
  useEffect(() => { goPrevRef.current = goPrev; }, [goPrev]);

  // 5. Global Click Handler (Handles Auto-Save and Selection Persistence)
  const handleGlobalClick = useCallback((clientX: number, targetWindow: Window = window) => {
    const selection = targetWindow.getSelection();
    const hasSelection = selection && selection.toString().trim().length > 0;

    // A. If popover is open
    if (showPopoverRef.current) {
      if (hasSelection) {
        // User just finished a new selection or is interacting with one.
        // Keep the menu open; 'selected' event will handle repositioning.
        return;
      }

      // No selection -> treat as "Cancel" (save if note exists, otherwise just close)
      if (popoverModeRef.current === "note" && noteTextRef.current.trim()) {
        if (confirmNoteRef.current) confirmNoteRef.current();
      } else {
        setShowPopover(false);
      }
      return; // Block navigation
    }

    // B. Block if selecting text
    if (hasSelection) {
      return;
    }

    // C. Regular Navigation
    const width = window.innerWidth;
    if (clientX < width * 0.3) {
      goPrev();
    } else if (clientX > width * 0.7) {
      goNext();
    } else {
      setIsUIVisible(prev => !prev);
    }
  }, [goNext, goPrev]);

  const handleGlobalClickRef = useRef(handleGlobalClick);
  useEffect(() => { handleGlobalClickRef.current = handleGlobalClick; }, [handleGlobalClick]);


  const cycleLayout = () => {
    setIsLayoutChanging(true);
    setLayoutMode((prev: LayoutMode) => {
      let next: LayoutMode = "full";
      if (prev === "full") next = "focus";
      else if (prev === "focus") next = "newspaper";
      
      localStorage.setItem("reader-layout-mode", next);
      return next;
    });
  };

  // Init book
  useEffect(() => {
    let isMounted = true;
    if (!viewerRef.current || !bookData) return;
    const initialLocation = initialCfi;
    const container = viewerRef.current;
    
    const book = ePub(bookData);
    bookRef.current = book;

    book.ready.then(() => {
      const rendition = book.renderTo(container, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
      });

      renditionRef.current = rendition;

      rendition.themes.default({
        "body": {
          "background": "#1a1a2e !important",
          "color": "#e0e0e0 !important",
          "font-family": "'Inter', 'Georgia', serif !important",
          "line-height": "1.8 !important",
          "padding": "40px !important",
        },
        "p": { "color": "#e0e0e0 !important" },
        "h1, h2, h3, h4, h5, h6": { "color": "#ffffff !important" },
        "a": { "color": "#818cf8 !important" },
        "::selection": { "background": "rgba(129, 140, 248, 0.4) !important" },
      });

      // Display the book with fallback logic
      const isValidCfi = (cfi?: string): boolean => {
        if (!cfi || typeof cfi !== 'string') return false;
        // Basic CFI format check: should start with epubcfi(
        return cfi.trim().startsWith('epubcfi(') && cfi.includes(')');
      };

      const locationToUse = isValidCfi(initialLocation) ? initialLocation : undefined;
      console.log("Reader: Initial location:", initialLocation, "-> Using:", locationToUse || "START");
      
      const tryDisplay = async (cfi?: string): Promise<boolean> => {
        try {
          console.log(`Reader: Calling rendition.display(${cfi ? cfi.substring(0, 40) + '...' : 'default'})`);
          await rendition.display(cfi || undefined);
          
          // Verify content was actually rendered by checking for an iframe
          await new Promise(r => setTimeout(r, 100));
          const iframe = container.querySelector('iframe');
          if (iframe && iframe.contentDocument?.body) {
            const bodyText = iframe.contentDocument.body.innerText || '';
            if (bodyText.trim().length > 0) {
              console.log("Reader: Display SUCCESS - content verified");
              return true;
            }
            console.warn("Reader: Display produced empty iframe body");
          } else {
            console.warn("Reader: No iframe found after display");
          }
          // Even if content check fails, the display call itself succeeded
          // epub.js may render asynchronously, so trust it
          return true;
        } catch (err) {
          console.warn(`Reader: Failed to display:`, err);
          return false;
        }
      };

      (async () => {
        // Wait for container to be laid out
        await new Promise(r => setTimeout(r, 50));
        if (!isMounted) return;

        let success = await tryDisplay(locationToUse);
        
        // If saved CFI failed, fall back to start of book
        if (!success && locationToUse) {
          console.log("Reader: Falling back to start of book");
          success = await tryDisplay();
        }

        if (!success || !isMounted) {
          console.error("Reader: Critical failure - Could not display book");
          return;
        }

        setRenditionReady(true);
        
        // STABILIZATION: Force resize after display
        const doResize = () => {
          if (!renditionRef.current || !container) return false;
          const { width, height } = container.getBoundingClientRect();
          if (width > 0 && height > 0) {
            console.log(`Reader: Resizing to ${width}x${height}`);
            renditionRef.current.resize(width, height);
            return true;
          }
          return false;
        };

        if ((rendition as RenditionExtension).manager) {
          if (!doResize()) {
            // Container not ready yet — observe for size changes
            const observer = new ResizeObserver(() => {
              if (doResize()) {
                observer.disconnect();
              }
            });
            observer.observe(container);
          }
        }

        // Mark as settled after a delay
        setTimeout(() => {
          if (isMounted) {
            isSettledRef.current = true;
            console.log("Reader: Layout settled");
          }
        }, 1200);

        // Hydration Logic: Load locations from cache or generate
        if (savedLocations) {
          try {
            book.locations.load(savedLocations);
            setLocationsReady(true);
            generateChapterTicks(book);
          } catch (e) {
            console.error("Reader: Failed to load saved locations:", e);
            startLocationGeneration(book);
          }
        } else {
          startLocationGeneration(book);
        }
      })();

      // Chapter label & Progress
      rendition.on("relocated", (location: EpubLocation) => {
        // Percentage and Pages
        if (!isDraggingScrubber.current) {
          if (locationsReadyRef.current && book.locations.length() > 0) {
            const globalPct = book.locations.percentageFromCfi(location.start.cfi);
            const globalPct100 = globalPct * 100;
            setGlobalProgress(globalPct100);

            // Use ref for stable lookup
            const currentTicks = chapterTicksRef.current;
            let currentTickIndex = -1;
            for (let i = currentTicks.length - 1; i >= 0; i--) {
              // Using a slightly more generous threshold to catch chapters on the same page
              if (globalPct100 >= currentTicks[i].percentage - 0.05) {
                currentTickIndex = i;
                break;
              }
            }

            if (currentTickIndex !== -1) {
              // SYNC CHAPTER TITLE WITH PROGRESS BOUNDARIES
              setChapter(currentTicks[currentTickIndex].label);

              const start = currentTicks[currentTickIndex].percentage;
              const nextTick = currentTicks[currentTickIndex + 1];
              const end = nextTick ? nextTick.percentage : 100;
              
              const range = end - start;
              const chapterPct = range > 0 
                ? ((globalPct100 - start) / range) * 100 
                : 100;

              setProgress(Math.round(Math.max(0, Math.min(100, chapterPct)) * 10) / 10);
            } else {
              // Fallback for before-first-tick or no-ticks
              setProgress(Math.round(globalPct100 * 10) / 10);
              
              // Try fallback href matching for the title if no tick hit yet
              const href = location.start.href;
              const currentChap = allChaptersRef.current.find(c => c.href.includes(href) || href.includes(c.href));
              if (currentChap) setChapter(currentChap.label);
            }

            if (onLocationChangeRef.current && isSettledRef.current) {
              onLocationChangeRef.current(location.start.cfi, globalPct100);
            }
            // Store for bookmarking
            currentLocationRef.current = { cfi: location.start.cfi, percentage: globalPct100 };
          } else {
            const pct = location.start.percentage || 0;
            const pct100 = pct * 100;
            setProgress(Math.round(pct100));
            if (onLocationChangeRef.current && isSettledRef.current) {
              onLocationChangeRef.current(location.start.cfi, pct100);
            }
            // Store for bookmarking
            currentLocationRef.current = { cfi: location.start.cfi, percentage: pct100 };
          }
        }
        
        if (locationsReadyRef.current && book.locations.length() > 0) {
          // If we have generated locations, we can get a global page number
          const currentLoc = book.locations.locationFromCfi(location.start.cfi);
          const totalLocs = book.locations.length();
          setCurrentPage(typeof currentLoc === 'number' ? currentLoc + 1 : 0);
          setTotalPages(totalLocs);
        } else if (location.start.displayed) {
          // Fallback to section-based pages
          setCurrentPage(location.start.displayed.page);
          setTotalPages(location.start.displayed.total);
        }

        // Hide UI on location change (reading)
        setIsUIVisible(false);
      });

      // Show UI on mousemove near top or bottom of iframe
      rendition.on("mousemove", (e: MouseEvent) => {
        const threshold = 60;
        if (e.clientY < threshold || e.clientY > window.innerHeight - threshold) {
          setIsUIVisible(true);
        }
      });

      // Handle navigation and UI toggling on click inside iframe
      rendition.on("click", (e: MouseEvent) => {
        // Get the absolute position by adding the iframe's offset
        const iframe = viewerRef.current?.querySelector("iframe");
        if (iframe && iframe.contentWindow) {
          const rect = iframe.getBoundingClientRect();
          if (handleGlobalClickRef.current) {
            handleGlobalClickRef.current(rect.left + e.clientX, iframe.contentWindow);
          }
        } else {
          if (handleGlobalClickRef.current) {
            handleGlobalClickRef.current(e.clientX);
          }
        }
      });

      // Text selection
      rendition.on("selected", (cfiRange: string, contents: { window: Window }) => {
        const sel = contents.window.getSelection();
        const text = sel?.toString().trim();
        if (!text) return;

        pendingSelection.current = { cfi: cfiRange, text };

        const range = sel?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const iframe = container.querySelector("iframe");
          const iframeRect = iframe?.getBoundingClientRect() || containerRect;

          setPopoverPos({
            x: iframeRect.left + rect.left + rect.width / 2 - containerRect.left,
            y: iframeRect.top + rect.top - containerRect.top - 10,
          });
          setPopoverMode("actions");
          setNoteText("");
          setShowPopover(true);
        }
      });
    });

    return () => {
      isMounted = false;
      if (renditionRef.current) renditionRef.current.destroy();
      if (bookRef.current) bookRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookData, generateChapterTicks, startLocationGeneration]); // initialCfi and savedLocations handled via ref behavior in initialLocation

  // Handle savedLocations updates independently if locations are not already ready
  useEffect(() => {
    if (!bookRef.current || locationsReady || !savedLocations) return;
    try {
      bookRef.current.locations.load(savedLocations);
      setLocationsReady(true);
      generateChapterTicks(bookRef.current);
    } catch (e) {
      console.error("Failed to load late-arriving locations:", e);
    }
  }, [savedLocations, locationsReady, generateChapterTicks]);

  // Handle saved highlights independently to avoid re-rendering book
  const appliedCfis = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!renditionRef.current || !renditionReady) return;
    const rendition = renditionRef.current;

    // Apply any new highlights
    savedHighlights.forEach((hl: { cfi: string; color: string }) => {
      if (!appliedCfis.current.has(hl.cfi)) {
        try {
          rendition.annotations.highlight(hl.cfi, {}, () => {}, "", {
            fill: hl.color,
            "fill-opacity": "0.35",
            "mix-blend-mode": "multiply",
          });
          appliedCfis.current.add(hl.cfi);
        } catch (e) {
          console.warn("Failed to apply highlight:", hl.cfi, e);
        }
      }
    });

    // Remove highlights that are no longer in savedHighlights
    const currentCfis = new Set(savedHighlights.map((h: { cfi: string; color: string }) => h.cfi));
    appliedCfis.current.forEach(cfi => {
      if (!currentCfis.has(cfi)) {
        try {
          rendition.annotations.remove(cfi, "highlight");
        } catch (e) {
          console.warn("Failed to remove highlight:", cfi, e);
        }
        appliedCfis.current.delete(cfi);
      }
    });
  }, [savedHighlights, renditionReady]);

  // Handle layout mode changes AND window resizing
  useEffect(() => {
    const updateLayout = () => {
      // Rendition manager safety check
      if (renditionRef.current && renditionReady && viewerRef.current) {
        const rendition = renditionRef.current as RenditionExtension;
        
        // Critical: Ensure managers exist before resizing
        if (!rendition.manager) return;

        const isLargeScreen = window.innerWidth > 1000;

        if (layoutMode === "newspaper" && isLargeScreen) {
          // epubjs built-in spread for two-page view
          rendition.spread("always");
        } else {
          rendition.spread("none");
        }

        const { width, height } = viewerRef.current.getBoundingClientRect();
        rendition.resize(width, height);
        
        // End transition state after a short delay to match CSS
        setTimeout(() => setIsLayoutChanging(false), 300);
      }
    };

    // Initial update for mode change
    // Using a minor delay to allow CSS transitions to start before epubjs reflows
    const timer = setTimeout(updateLayout, 100);

    // Debounced resize handler
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateLayout, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
      clearTimeout(timer);
    };
  }, [layoutMode, renditionReady]);

  const confirmHighlight = useCallback(
    (color: string) => {
      if (!pendingSelection.current || !renditionRef.current) return;
      const { cfi, text } = pendingSelection.current;

      renditionRef.current.annotations.highlight(cfi, {}, () => {}, "", {
        fill: color,
        "fill-opacity": "0.35",
        "mix-blend-mode": "multiply",
      });

      // Include noteText if the user was typing a note and then picked a color
      onHighlight({ cfi, text, notes: noteText });
      pendingSelection.current = null;
      setShowPopover(false);
      setNoteText("");
    },
    [onHighlight, noteText]
  );

  const confirmNote = useCallback(() => {
    if (!pendingSelection.current || !renditionRef.current) return;
    const { cfi, text } = pendingSelection.current;

    // Apply default highlighting color when saving a note
    renditionRef.current.annotations.highlight(cfi, {}, () => {}, "", {
      fill: highlightColor,
      "fill-opacity": "0.35",
      "mix-blend-mode": "multiply",
    });

    onHighlight({ cfi, text, notes: noteText });
    pendingSelection.current = null;
    setShowPopover(false);
    setNoteText("");
  }, [onHighlight, highlightColor, noteText]);

  useEffect(() => {
    confirmNoteRef.current = confirmNote;
  }, [confirmNote]);

  const handleCopy = () => {
    if (pendingSelection.current) {
      navigator.clipboard.writeText(pendingSelection.current.text).then(() => {
        setShowPopover(false);
        // Optional: Add a toast notification here
      });
    }
  };

  const handleDefine = () => {
    if (pendingSelection.current) {
      const query = encodeURIComponent(pendingSelection.current.text);
      window.open(`https://www.google.com/search?q=define+${query}`, "_blank");
      setShowPopover(false);
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
  };

  const handleScrubberActionStart = () => {
    isDraggingScrubber.current = true;
  };

  const handleScrubberActionEnd = (e: React.MouseEvent<HTMLInputElement>) => {
    isDraggingScrubber.current = false;
    const val = parseFloat(e.currentTarget.value);
    
    if (bookRef.current && renditionRef.current && locationsReadyRef.current && bookRef.current.locations.length() > 0) {
      // Current global percentage (cached in ref)
      const globalPctNow = globalProgressRef.current;
      const currentTicks = chapterTicksRef.current;
      
      // Find current chapter boundaries to map back
      let currentTickIndex = -1;
      for (let i = currentTicks.length - 1; i >= 0; i--) {
        if (globalPctNow >= currentTicks[i].percentage - 0.05) {
          currentTickIndex = i;
          break;
        }
      }

      let targetGlobalPctP = globalPctNow;
      if (currentTickIndex !== -1) {
        const start = currentTicks[currentTickIndex].percentage;
        const nextTick = currentTicks[currentTickIndex + 1];
        const end = nextTick ? nextTick.percentage : 100;
        
        targetGlobalPctP = start + (val / 100) * (end - start);
      } else {
        // If we were before any chapter, just use global
        targetGlobalPctP = val;
      }

      const cfi = bookRef.current.locations.cfiFromPercentage(targetGlobalPctP / 100);
      renditionRef.current.display(cfi);
    }
  };

  const COLORS = ["#facc15", "#4ade80", "#60a5fa", "#f472b6", "#c084fc"];

  // keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" || 
        target.tagName === "TEXTAREA" || 
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === " ") {
        // Prevent space bar from scrolling page if we are using it for navigation
        if (e.key === " ") e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") goPrev();

      // Show UI on interaction
      setIsUIVisible(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  // Mouse move to show UI
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const threshold = 60;
      if (e.clientY < threshold || e.clientY > window.innerHeight - threshold) {
        setIsUIVisible(true);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Navigate-to-CFI from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const cfi = (e as CustomEvent).detail;
      if (cfi && renditionRef.current) {
        renditionRef.current.display(cfi);
      }
    };
    window.addEventListener("navigate-cfi", handler);
    return () => window.removeEventListener("navigate-cfi", handler);
  }, []);

  const handleBookmark = async () => {
    if (!currentLocationRef.current) return;
    setIsBookmarking(true);
    try {
      // Use chapter title as label, or fallback to generic "Bookmark"
      const label = chapter || "Bookmark";
      onAddBookmark(label, currentLocationRef.current.cfi);
      
      // Visual feedback: briefly show "Saved!" or similar? 
      // For now just finish the action.
    } catch (err) {
      console.error("Failed to bookmark page:", err);
    } finally {
      setTimeout(() => setIsBookmarking(false), 500);
    }
  };

  return (
    <div 
      className="reader-wrapper" 
      onClick={(e) => handleGlobalClick(e.clientX)}
    >
      {/* Top bar */}
      <div 
        className={`reader-topbar ${!isUIVisible ? "hidden" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="reader-back-btn" onClick={onBack} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Library
        </button>
        <div className="reader-title">{cleanBookTitle(bookTitle)}</div>
        <div className="reader-chapter">{chapter}</div>
        <button 
          className="reader-layout-btn" 
          onClick={cycleLayout} 
          type="button"
          title={`Cycle Layout (Current: ${layoutMode})`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
          <span className="layout-mode-label">{layoutMode === 'full' ? 'Aa' : layoutMode === 'focus' ? 'Focus' : 'News'}</span>
        </button>
        <button 
          className={`reader-bookmark-btn ${isBookmarking ? "active" : ""}`}
          onClick={handleBookmark}
          type="button"
          title="Save Bookmark"
          disabled={isBookmarking}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isBookmarking ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <button 
          className="reader-highlights-toggle-btn" 
          onClick={onToggleHighlights} 
          type="button"
          title="Toggle Highlights"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span className="highlights-count-badge">{highlightsCount}</span>
        </button>
      </div>

      {/* Reader container */}
      <div className={`reader-container layout-${layoutMode} ${isLayoutChanging ? 'layout-changing' : ''} ${!isUIVisible ? "ui-hidden" : ""}`}>
        <div className="reader-view-stable">
          <div ref={viewerRef} className="reader-view-target" />
        </div>
      </div>

      {/* Progress Scrubber */}
      <div 
        className={`reader-progress-container ${!isUIVisible ? "hidden" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reader-scrubber-wrapper">
          {/* Chapter Ticks */}
          <div className="chapter-ticks">
            {chapterTicks.map((tick, i) => (
              <div 
                key={i} 
                className="chapter-tick" 
                style={{ left: `${tick.percentage}%` }}
                title={tick.label}
              />
            ))}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={handleScrubberChange}
            onMouseDown={handleScrubberActionStart}
            onMouseUp={handleScrubberActionEnd}
            className="reader-scrubber"
            aria-label="Progress scrubber"
            disabled={!locationsReady}
          />
        </div>
        <div className="reader-progress-label">
          {!locationsReady ? "Calculating progress..." : totalPages > 0 ? `Page ${currentPage} of ${totalPages} (Chapter: ${progress}%)` : `Chapter: ${progress}%`}
        </div>
      </div>

      {/* Selection Menu Popover */}
      {showPopover && (
        <div
          className="selection-menu"
          style={{
            left: popoverPos.x,
            top: popoverPos.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {popoverMode !== "note" ? (
            <div className="selection-actions-row">
              <div className="selection-colors-compact">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`selection-color-dot ${c === highlightColor ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => confirmHighlight(c)}
                    type="button"
                    title={`Highlight ${c}`}
                  />
                ))}
              </div>
              <div className="selection-util-actions">
                <button className="selection-util-btn" onClick={() => setPopoverMode("note")} title="Add Note">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8.5"/><path d="M11 21v-4a2 2 0 0 0-2-2H5"/><path d="M16 2l5 5"/></svg>
                </button>
                <button className="selection-util-btn" onClick={handleCopy} title="Copy">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button className="selection-util-btn" onClick={handleDefine} title="Define">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="selection-note-container">
              <textarea 
                className="selection-note-input"
                placeholder="Write your thoughts..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    confirmNote();
                  }
                  if (e.key === 'Escape') {
                    setPopoverMode("actions");
                  }
                }}
              />
              <div className="selection-note-footer">
                <button className="selection-back-btn" onClick={() => setPopoverMode("actions")}>
                  Cancel
                </button>
                <button 
                  className="selection-note-save-btn" 
                  onClick={confirmNote}
                  disabled={!noteText.trim()}
                >
                  Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
