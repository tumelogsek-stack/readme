use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Highlight {
    pub id: i64,
    pub book_title: String,
    pub cfi: String,
    pub text: String,
    pub color: String,
    pub notes: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: i64,
    pub book_title: String,
    pub cfi: String,
    pub label: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub emoji: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookMetadata {
    pub id: i64,
    pub title: String,
    pub filename: String,
    pub last_cfi: String,
    pub cover: Option<String>,
    pub locations_data: Option<String>,
    pub last_percentage: f64,
    pub created_at: String,
}

pub struct DbState(pub Mutex<Connection>);

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS highlights (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_title  TEXT    NOT NULL,
            cfi         TEXT    NOT NULL,
            text        TEXT    NOT NULL,
            color       TEXT    NOT NULL DEFAULT '#facc15',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS books (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL UNIQUE,
            filename    TEXT    NOT NULL,
            last_cfi    TEXT    NOT NULL DEFAULT '',
            cover       TEXT,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_title  TEXT    NOT NULL,
            cfi         TEXT    NOT NULL,
            label       TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .expect("Failed to initialize database");

    // Simple migration: ensure columns exist in highlights
    let _ = conn.execute(
        "ALTER TABLE highlights ADD COLUMN color TEXT NOT NULL DEFAULT '#facc15'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE highlights ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE highlights ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        [],
    );

    // Migration: add locations_data column to books table
    let _ = conn.execute("ALTER TABLE books ADD COLUMN locations_data TEXT", []);

    // Migration: add last_percentage column to books table
    let _ = conn.execute(
        "ALTER TABLE books ADD COLUMN last_percentage REAL NOT NULL DEFAULT 0.0",
        [],
    );

    // Collections tables
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS collections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            emoji       TEXT    NOT NULL DEFAULT '📌',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS highlight_collections (
            highlight_id   INTEGER NOT NULL,
            collection_id  INTEGER NOT NULL,
            PRIMARY KEY (highlight_id, collection_id),
            FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
        );",
    )
    .expect("Failed to create collections tables");
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn add_book(
    app: tauri::AppHandle,
    state: tauri::State<DbState>,
    title: String,
    filename: String,
    cover: Option<String>,
    data: Vec<u8>,
) -> Result<BookMetadata, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let books_dir = app_dir.join("books");
    std::fs::create_dir_all(&books_dir).map_err(|e| e.to_string())?;

    let file_path = books_dir.join(&filename);
    std::fs::write(&file_path, data).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO books (title, filename, cover) VALUES (?1, ?2, ?3)",
        params![title, filename, cover],
    )
    .map_err(|e| e.to_string())?;

    let book = conn
        .query_row(
            "SELECT id, title, filename, last_cfi, cover, locations_data, last_percentage, created_at FROM books WHERE title = ?1",
            params![title],
            |row| {
                Ok(BookMetadata {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    filename: row.get(2)?,
                    last_cfi: row.get(3)?,
                    cover: row.get(4)?,
                    locations_data: row.get(5)?,
                    last_percentage: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(book)
}

#[tauri::command]
fn get_all_books(state: tauri::State<DbState>) -> Result<Vec<BookMetadata>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, filename, last_cfi, cover, locations_data, last_percentage, created_at FROM books ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BookMetadata {
                id: row.get(0)?,
                title: row.get(1)?,
                filename: row.get(2)?,
                last_cfi: row.get(3)?,
                cover: row.get(4)?,
                locations_data: row.get(5)?,
                last_percentage: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut books = Vec::new();
    for row in rows {
        books.push(row.map_err(|e| e.to_string())?);
    }
    Ok(books)
}

#[tauri::command]
fn update_book_progress(
    state: tauri::State<DbState>,
    title: String,
    cfi: String,
    percentage: f64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE books SET last_cfi = ?1, last_percentage = ?2 WHERE title = ?3",
        params![cfi, percentage, title],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_book_locations(
    state: tauri::State<DbState>,
    title: String,
    locations_data: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE books SET locations_data = ?1 WHERE title = ?2",
        params![locations_data, title],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_book_content(app: tauri::AppHandle, filename: String) -> Result<Vec<u8>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_dir.join("books").join(filename);
    std::fs::read(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_highlight(
    state: tauri::State<DbState>,
    book_title: String,
    cfi: String,
    text: String,
    color: String,
    notes: String,
) -> Result<Highlight, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO highlights (book_title, cfi, text, color, notes) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![book_title, cfi, text, color, notes],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let hl = conn
        .query_row(
            "SELECT id, book_title, cfi, text, color, notes, created_at FROM highlights WHERE id = ?1",
            params![id],
            |row| {
                Ok(Highlight {
                    id: row.get(0)?,
                    book_title: row.get(1)?,
                    cfi: row.get(2)?,
                    text: row.get(3)?,
                    color: row.get(4)?,
                    notes: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(hl)
}

#[tauri::command]
fn get_highlights(
    state: tauri::State<DbState>,
    book_title: String,
) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, book_title, cfi, text, color, notes, created_at FROM highlights WHERE book_title = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![book_title], |row| {
            Ok(Highlight {
                id: row.get(0)?,
                book_title: row.get(1)?,
                cfi: row.get(2)?,
                text: row.get(3)?,
                color: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut highlights = Vec::new();
    for row in rows {
        highlights.push(row.map_err(|e| e.to_string())?);
    }
    Ok(highlights)
}

#[tauri::command]
fn delete_book(
    app: tauri::AppHandle,
    state: tauri::State<DbState>,
    title: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 1. Get filename to delete the file later
    let filename: String = conn
        .query_row(
            "SELECT filename FROM books WHERE title = ?1",
            params![title],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 2. Delete from DB (Cascade-like manual cleanup)
    conn.execute(
        "DELETE FROM highlights WHERE book_title = ?1",
        params![title],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM books WHERE title = ?1", params![title])
        .map_err(|e| e.to_string())?;

    // 3. Delete the file
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_dir.join("books").join(filename);
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_all_highlights(state: tauri::State<DbState>) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, book_title, cfi, text, color, notes, created_at FROM highlights ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Highlight {
                id: row.get(0)?,
                book_title: row.get(1)?,
                cfi: row.get(2)?,
                text: row.get(3)?,
                color: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut highlights = Vec::new();
    for row in rows {
        highlights.push(row.map_err(|e| e.to_string())?);
    }
    Ok(highlights)
}

#[tauri::command]
fn update_highlight_notes(
    state: tauri::State<DbState>,
    id: i64,
    notes: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE highlights SET notes = ?1 WHERE id = ?2",
        params![notes, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_highlight(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM highlights WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_bookmark(
    state: tauri::State<DbState>,
    book_title: String,
    cfi: String,
    label: String,
) -> Result<Bookmark, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bookmarks (book_title, cfi, label) VALUES (?1, ?2, ?3)",
        params![book_title, cfi, label],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let bookmark = conn
        .query_row(
            "SELECT id, book_title, cfi, label, created_at FROM bookmarks WHERE id = ?1",
            params![id],
            |row| {
                Ok(Bookmark {
                    id: row.get(0)?,
                    book_title: row.get(1)?,
                    cfi: row.get(2)?,
                    label: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(bookmark)
}

#[tauri::command]
fn get_bookmarks(
    state: tauri::State<DbState>,
    book_title: String,
) -> Result<Vec<Bookmark>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, book_title, cfi, label, created_at FROM bookmarks WHERE book_title = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![book_title], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                book_title: row.get(1)?,
                cfi: row.get(2)?,
                label: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut bookmarks = Vec::new();
    for row in rows {
        bookmarks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(bookmarks)
}

#[tauri::command]
fn delete_bookmark(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn wipe_all_data(app: tauri::AppHandle, state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 1. Clear DB
    conn.execute_batch(
        "DELETE FROM highlights;
         DELETE FROM books;
         DELETE FROM bookmarks;
         VACUUM;",
    )
    .map_err(|e| e.to_string())?;

    // 2. Delete all book files
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let books_dir = app_dir.join("books");
    if books_dir.exists() {
        std::fs::remove_dir_all(&books_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&books_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Collection commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn create_collection(
    state: tauri::State<DbState>,
    name: String,
    emoji: String,
) -> Result<Collection, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (name, emoji) VALUES (?1, ?2)",
        params![name, emoji],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let collection = conn
        .query_row(
            "SELECT id, name, emoji, created_at FROM collections WHERE id = ?1",
            params![id],
            |row| {
                Ok(Collection {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    emoji: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(collection)
}

#[tauri::command]
fn get_all_collections(state: tauri::State<DbState>) -> Result<Vec<Collection>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, emoji, created_at FROM collections ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut collections = Vec::new();
    for r in rows {
        collections.push(r.map_err(|e| e.to_string())?);
    }
    Ok(collections)
}

#[tauri::command]
fn delete_collection(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM highlight_collections WHERE collection_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_highlight_to_collection(
    state: tauri::State<DbState>,
    highlight_id: i64,
    collection_id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO highlight_collections (highlight_id, collection_id) VALUES (?1, ?2)",
        params![highlight_id, collection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_highlight_from_collection(
    state: tauri::State<DbState>,
    highlight_id: i64,
    collection_id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM highlight_collections WHERE highlight_id = ?1 AND collection_id = ?2",
        params![highlight_id, collection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_highlights_by_collection(
    state: tauri::State<DbState>,
    collection_id: i64,
) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.book_title, h.cfi, h.text, h.color, h.notes, h.created_at
             FROM highlights h
             INNER JOIN highlight_collections hc ON h.id = hc.highlight_id
             WHERE hc.collection_id = ?1
             ORDER BY h.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![collection_id], |row| {
            Ok(Highlight {
                id: row.get(0)?,
                book_title: row.get(1)?,
                cfi: row.get(2)?,
                text: row.get(3)?,
                color: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut highlights = Vec::new();
    for r in rows {
        highlights.push(r.map_err(|e| e.to_string())?);
    }
    Ok(highlights)
}

#[tauri::command]
fn get_highlight_collections(
    state: tauri::State<DbState>,
    highlight_id: i64,
) -> Result<Vec<Collection>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.emoji, c.created_at
             FROM collections c
             INNER JOIN highlight_collections hc ON c.id = hc.collection_id
             WHERE hc.highlight_id = ?1
             ORDER BY c.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![highlight_id], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut collections = Vec::new();
    for r in rows {
        collections.push(r.map_err(|e| e.to_string())?);
    }
    Ok(collections)
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Open / create the SQLite database in the app data dir
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("highlights.db");
            let conn = Connection::open(&db_path).expect("failed to open SQLite database");
            init_db(&conn);
            app.manage(DbState(Mutex::new(conn)));

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_book,
            get_all_books,
            update_book_progress,
            update_book_locations,
            get_book_content,
            add_highlight,
            get_highlights,
            get_all_highlights,
            delete_highlight,
            delete_book,
            update_highlight_notes,
            add_bookmark,
            get_bookmarks,
            delete_bookmark,
            wipe_all_data,
            create_collection,
            get_all_collections,
            delete_collection,
            add_highlight_to_collection,
            remove_highlight_from_collection,
            get_highlights_by_collection,
            get_highlight_collections
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
