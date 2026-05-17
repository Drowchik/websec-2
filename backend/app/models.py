from pydantic import BaseModel


class Settlement(BaseModel):
    id: str
    name: str
    short_name: str
    type: str
    region: str
    district: str
    population: int
    lat: float
    lon: float
    search: str


class SettlementsResponse(BaseModel):
    source: str
    license: str
    count: int
    items: list[Settlement]


class ForecastPoint(BaseModel):
    time: str
    temperature: float
    precipitation: float
    wind: float
    humidity: float | None
    condition: str


class DailyForecast(BaseModel):
    date: str
    temp_min: float
    temp_max: float
    rain_total: float
    wind_max: float
    condition: str


class ForecastResponse(BaseModel):
    timezone: str
    points: list[ForecastPoint]
    daily: list[DailyForecast]


class HealthResponse(BaseModel):
    status: str
    settlements: int
