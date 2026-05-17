from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT_DIR / "frontend" / "static"
SETTLEMENTS_PATH = Path(__file__).resolve().parent / "data" / "settlements_top_1000.json"

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HOURLY = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code"
MAX_FORECAST_DAYS = 7
DEFAULT_FORECAST_DAYS = 5
OPEN_METEO_TIMEOUT = 15.0

WMO_WEATHER_CODES = {
    0: "Ясно",
    1: "Почти ясно",
    2: "Переменная облачность",
    3: "Пасмурно",
    45: "Туман",
    48: "Изморозь",
    51: "Слабая морось",
    53: "Морось",
    55: "Сильная морось",
    61: "Слабый дождь",
    63: "Дождь",
    65: "Сильный дождь",
    71: "Слабый снег",
    73: "Снег",
    75: "Сильный снег",
    80: "Слабый ливень",
    81: "Ливень",
    82: "Сильный ливень",
    95: "Гроза",
    96: "Гроза с градом",
    99: "Сильная гроза с градом",
}
