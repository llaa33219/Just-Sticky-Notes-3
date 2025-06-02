-- Cloudflare D1 Database Schema for Just Sticky Notes

CREATE TABLE IF NOT EXISTS sticky_notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    color TEXT DEFAULT '#fff740',
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_created_at ON sticky_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_author ON sticky_notes(author); 