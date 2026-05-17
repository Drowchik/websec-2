from typing import Any

import httpx

from backend.app.const import MAX_FORECAST_DAYS, OPEN_METEO_HOURLY, OPEN_METEO_TIMEOUT, OPEN_METEO_URL, WMO_WEATHER_CODES
from backend.app.models import DailyForecast, ForecastPoint, ForecastResponse


def _number(value: Any, default: float | None = 0) -> float | None:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return default


def _condition(code: Any) -> str:
    try:
        return WMO_WEATHER_CODES.get(int(code), "Неопределенная погода")
    except (TypeError, ValueError):
        return "Неопределенная погода"


def _from_open_meteo(payload: dict[str, Any]) -> list[ForecastPoint]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    temperatures = hourly.get("temperature_2m") or []
    precipitation = hourly.get("precipitation") or []
    wind = hourly.get("wind_speed_10m") or []
    humidity = hourly.get("relative_humidity_2m") or []
    codes = hourly.get("weather_code") or []

    points = []
    for index, moment in enumerate(times):
        if index >= len(temperatures):
            continue

        points.append(
            ForecastPoint(
                time=str(moment),
                temperature=_number(temperatures[index]) or 0,
                precipitation=_number(precipitation[index] if index < len(precipitation) else 0) or 0,
                wind=_number(wind[index] if index < len(wind) else 0) or 0,
                humidity=_number(humidity[index], None) if index < len(humidity) else None,
                condition=_condition(codes[index] if index < len(codes) else None),
            )
        )

    return points


async def _open_meteo_forecast(lat: float, lon: float, days: int) -> tuple[list[ForecastPoint], str]:
    params = {
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "hourly": OPEN_METEO_HOURLY,
        "forecast_days": days,
        "timezone": "auto",
        "wind_speed_unit": "ms",
        "precipitation_unit": "mm",
    }

    async with httpx.AsyncClient(timeout=OPEN_METEO_TIMEOUT) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    return _from_open_meteo(payload), payload.get("timezone") or "auto"


def _daily_summary(points: list[ForecastPoint]) -> list[DailyForecast]:
    groups: dict[str, list[ForecastPoint]] = {}
    for point in points:
        groups.setdefault(point.time[:10], []).append(point)

    daily = []
    for day, values in groups.items():
        conditions = [value.condition for value in values]
        daily.append(
            DailyForecast(
                date=day,
                temp_min=round(min(value.temperature for value in values), 1),
                temp_max=round(max(value.temperature for value in values), 1),
                rain_total=round(sum(value.precipitation for value in values), 1),
                wind_max=round(max(value.wind for value in values), 1),
                condition=max(conditions, key=conditions.count),
            )
        )

    return daily


async def get_weather(lat: float, lon: float, days: int = 5) -> ForecastResponse:
    days = max(1, min(days, MAX_FORECAST_DAYS))
    points, timezone = await _open_meteo_forecast(lat, lon, days)
    if not points:
        raise ValueError("Open-Meteo вернул пустой прогноз")

    return ForecastResponse(
        timezone=timezone,
        points=points,
        daily=_daily_summary(points),
    )
