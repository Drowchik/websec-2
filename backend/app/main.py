import json
import re

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.const import DEFAULT_FORECAST_DAYS, SETTLEMENTS_PATH, STATIC_DIR
from backend.app.models import ForecastResponse, HealthResponse, SettlementsResponse
from backend.app.services.weather import get_weather


app = FastAPI(
    title="Weather Atlas",
    description="Одностраничное приложение прогноза погоды по крупным населенным пунктам России.",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _load_settlements() -> dict:
    if not SETTLEMENTS_PATH.exists():
        raise RuntimeError("Run backend/scripts/build_settlements.py before starting the server")
    return json.loads(SETTLEMENTS_PATH.read_text(encoding="utf-8"))


SETTLEMENTS = _load_settlements()


def _normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/settlements", response_model=SettlementsResponse)
async def settlements(
    q: str = Query("", max_length=80),
    limit: int = Query(1000, ge=1, le=1000),
) -> dict:
    items = SETTLEMENTS["items"]
    query = _normalize_query(q)

    if query:
        items = [item for item in items if query in item["search"]]
        limit = min(limit, 60)

    return {
        "source": SETTLEMENTS["source"],
        "license": SETTLEMENTS["license"],
        "count": len(items[:limit]),
        "items": items[:limit],
    }


@app.get("/api/forecast", response_model=ForecastResponse)
async def forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: int = Query(DEFAULT_FORECAST_DAYS, ge=1, le=7),
) -> dict:
    try:
        return await get_weather(lat=lat, lon=lon, days=days)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось получить прогноз: {exc}") from exc


@app.get("/api/health", response_model=HealthResponse)
async def health() -> dict:
    return {"status": "ok", "settlements": SETTLEMENTS["count"]}
