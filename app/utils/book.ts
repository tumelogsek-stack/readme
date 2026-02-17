/**
 * Cleans a book title by removing extra metadata parts (like hashes or sources) often found in EPUB filenames.
 * Specifically targets the "Title -- Author -- Hash -- Source" pattern.
 */
export const cleanBookTitle = (title: string): string => {
  if (!title) return "";
  
  // Handle "Title -- Author -- Hash -- Source" (e.g. from Anna's Archive)
  if (title.includes(" -- ")) {
    const parts = title.split(" -- ");
    if (parts.length >= 2) {
      // Re-combine the first two parts (typically Title and Author)
      return `${parts[0]} — ${parts[1]}`;
    }
  }
  
  // Fallback for underscore patterns
  if (title.includes("_") && !title.includes(" ")) {
    return title.replace(/_/g, " ");
  }
  
  return title;
};
