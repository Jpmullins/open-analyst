"""Custom HTTP routes for the LangGraph Agent Server.

These routes are mounted alongside the Agent Server's built-in API
(threads, runs, assistants, store, etc.) via the ``http.app`` key in
``langgraph.json``.

Memory CRUD is handled by the Agent Server's built-in ``/store/*``
endpoints — no custom routes are needed.
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="open-analyst-custom-routes")


@app.get("/health")
async def health():
    return {"ok": True, "service": "langgraph-runtime"}
