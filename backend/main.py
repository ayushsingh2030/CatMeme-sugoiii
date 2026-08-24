from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

app = FastAPI(title="CatMeme-sugoiii")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    """Serve the web application."""
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Confirm that the backend is running."""
    return {"status": "ok", "message": "CatMeme-sugoiii server is running"}