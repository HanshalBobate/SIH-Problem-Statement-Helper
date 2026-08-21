"""
SIH PS Helper — Local Backend Server
=====================================
Provides persistent storage for the SIH PS Helper Chrome Extension.

Endpoints:
  GET  /health                  → {"status": "ok", "version": "1.0.0"}
  GET  /notes/{ps_id}           → {"ps_id": "26001", "note": "..."}
  PUT  /notes/{ps_id}           → save note, returns {"saved": true}
  GET  /status/{ps_id}          → {"ps_id": "26001", "reviewed": false}
  PUT  /status/{ps_id}          → save reviewed flag, returns {"saved": true}
  GET  /all                     → list all stored PS records (for popup stats)
  DELETE /notes/{ps_id}         → delete a note
  DELETE /status/{ps_id}        → clear reviewed status

Run:
  python server.py
  -- or --
  uvicorn server:app --host 127.0.0.1 --port 7842 --reload

CORS:
  Allows requests from:
    - chrome-extension://*   (the extension)
    - https://sih.gov.in     (the live page, if called from page context)
    - http://localhost:*     (local dev / curl testing)
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
PORT     = int(os.getenv("SIH_HELPER_PORT", "7842"))
DB_PATH  = os.getenv("SIH_HELPER_DB", os.path.join(os.path.dirname(__file__), "sih_helper.db"))
VERSION  = "1.0.0"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sih-helper")

# ─────────────────────────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────────────────────────
CREATE_NOTES_TABLE = """
CREATE TABLE IF NOT EXISTS notes (
    ps_id       TEXT PRIMARY KEY,
    note        TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL
);
"""

CREATE_STATUS_TABLE = """
CREATE TABLE IF NOT EXISTS status (
    ps_id       TEXT PRIMARY KEY,
    reviewed    INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
);
"""


@asynccontextmanager
async def get_db():
    """Open an aiosqlite connection with WAL mode for concurrency."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA foreign_keys=ON;")
        yield db


async def init_db():
    log.info(f"Initialising database at: {DB_PATH}")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_NOTES_TABLE)
        await db.execute(CREATE_STATUS_TABLE)
        await db.commit()
    log.info("Database ready.")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────
# Lifespan (replaces @app.on_event which is deprecated)
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    log.info(f"SIH PS Helper backend v{VERSION} listening on http://127.0.0.1:{PORT}")
    yield
    log.info("Shutting down SIH PS Helper backend.")


# ─────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="SIH PS Helper Backend",
    version=VERSION,
    description="Local persistent storage for the SIH PS Helper Chrome Extension.",
    lifespan=lifespan,
)

# Allow requests from the extension and the SIH website
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"(chrome-extension://.*|https://sih\.gov\.in|http://localhost:\d+|http://127\.0\.0\.1:\d+)",
    allow_methods=["GET", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
    allow_credentials=False,
)


# ─────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────
class NotePayload(BaseModel):
    note: str


class StatusPayload(BaseModel):
    reviewed: bool


# ─────────────────────────────────────────────────────────────
# Routes — Health
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": VERSION, "db": DB_PATH}


# ─────────────────────────────────────────────────────────────
# Routes — Notes
# ─────────────────────────────────────────────────────────────
@app.get("/notes/{ps_id}")
async def get_note(ps_id: str):
    async with get_db() as db:
        async with db.execute(
            "SELECT note, updated_at FROM notes WHERE ps_id = ?", (ps_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return {"ps_id": ps_id, "note": "", "updated_at": None}
    return {"ps_id": ps_id, "note": row["note"], "updated_at": row["updated_at"]}


@app.put("/notes/{ps_id}")
async def save_note(ps_id: str, payload: NotePayload):
    now = utcnow()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO notes (ps_id, note, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(ps_id) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at
            """,
            (ps_id, payload.note, now),
        )
        await db.commit()
    return {"saved": True, "ps_id": ps_id, "updated_at": now}


@app.delete("/notes/{ps_id}")
async def delete_note(ps_id: str):
    async with get_db() as db:
        await db.execute("DELETE FROM notes WHERE ps_id = ?", (ps_id,))
        await db.commit()
    return {"deleted": True, "ps_id": ps_id}


# ─────────────────────────────────────────────────────────────
# Routes — Status (Reviewed)
# ─────────────────────────────────────────────────────────────
@app.get("/status/{ps_id}")
async def get_status(ps_id: str):
    async with get_db() as db:
        async with db.execute(
            "SELECT reviewed, updated_at FROM status WHERE ps_id = ?", (ps_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return {"ps_id": ps_id, "reviewed": False, "updated_at": None}
    return {"ps_id": ps_id, "reviewed": bool(row["reviewed"]), "updated_at": row["updated_at"]}


@app.put("/status/{ps_id}")
async def save_status(ps_id: str, payload: StatusPayload):
    now = utcnow()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO status (ps_id, reviewed, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(ps_id) DO UPDATE SET reviewed=excluded.reviewed, updated_at=excluded.updated_at
            """,
            (ps_id, int(payload.reviewed), now),
        )
        await db.commit()
    return {"saved": True, "ps_id": ps_id, "reviewed": payload.reviewed, "updated_at": now}


@app.delete("/status/{ps_id}")
async def delete_status(ps_id: str):
    async with get_db() as db:
        await db.execute("DELETE FROM status WHERE ps_id = ?", (ps_id,))
        await db.commit()
    return {"deleted": True, "ps_id": ps_id}


# ─────────────────────────────────────────────────────────────
# Routes — Aggregate / Stats
# ─────────────────────────────────────────────────────────────
@app.get("/all")
async def get_all():
    """Return all stored PS records merged from notes and status tables."""
    async with get_db() as db:
        async with db.execute("SELECT ps_id, note, updated_at FROM notes") as cur:
            notes_rows = await cur.fetchall()
        async with db.execute("SELECT ps_id, reviewed, updated_at FROM status") as cur:
            status_rows = await cur.fetchall()

    # Merge by ps_id
    merged: dict = {}
    for row in notes_rows:
        merged.setdefault(row["ps_id"], {})["note"] = row["note"]
        merged[row["ps_id"]]["notes_updated_at"] = row["updated_at"]
    for row in status_rows:
        merged.setdefault(row["ps_id"], {})["reviewed"] = bool(row["reviewed"])
        merged[row["ps_id"]]["status_updated_at"] = row["updated_at"]

    result = []
    for ps_id, data in sorted(merged.items()):
        result.append({
            "ps_id": ps_id,
            "note": data.get("note", ""),
            "reviewed": data.get("reviewed", False),
            "notes_updated_at": data.get("notes_updated_at"),
            "status_updated_at": data.get("status_updated_at"),
        })

    return {
        "total": len(result),
        "reviewed_count": sum(1 for r in result if r["reviewed"]),
        "with_notes_count": sum(1 for r in result if r["note"]),
        "records": result,
    }


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=PORT,
        reload=False,
        log_level="info",
    )
