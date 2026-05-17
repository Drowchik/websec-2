import csv
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path


DATASET_API = "https://api.tochno.st/v4/data_sets/allsettlements"
OUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "settlements_top_1000.json"


def normalize_search_text(*parts: str) -> str:
    text = " ".join(part for part in parts if part)
    return re.sub(r"\s+", " ", text.casefold()).strip()


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "WeatherAtlasLab/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "WeatherAtlasLab/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def as_float(value: str) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def as_int(value: str) -> int:
    try:
        return int(float(value.replace(",", ".")))
    except (TypeError, ValueError):
        return 0


def build_top_settlements(limit: int = 1000) -> list[dict]:
    metadata = fetch_json(DATASET_API)
    csv_attachment = next(
        item for item in metadata["attachments"] if item.get("ext") == "csv" and item.get("url")
    )

    archive = zipfile.ZipFile(io.BytesIO(fetch_bytes(csv_attachment["url"])))
    csv_name = next(name for name in archive.namelist() if name.endswith(".csv") and "__MACOSX" not in name)

    settlements = []
    with archive.open(csv_name) as raw_file:
        reader = csv.DictReader(io.TextIOWrapper(raw_file, encoding="utf-8-sig"), delimiter=";")
        for row in reader:
            if row.get("object_level") != "Населенный пункт":
                continue

            lat = as_float(row.get("latitude_dadata", ""))
            lon = as_float(row.get("longitude_dadata", ""))
            population = as_int(row.get("population", ""))
            if lat is None or lon is None or population <= 0:
                continue

            settlement_name = row.get("settlement") or row.get("object_name") or row.get("settlement_dadata")
            region = row.get("region") or ""
            district = row.get("mun_upper") or row.get("mun_lower") or ""

            settlements.append(
                {
                    "id": row.get("oktmo") or row.get("fias_id_dadata") or f"{lat}:{lon}",
                    "name": settlement_name,
                    "short_name": row.get("settlement_dadata") or settlement_name,
                    "type": row.get("settlement_type_full_dadata") or "населенный пункт",
                    "region": region,
                    "district": district,
                    "population": population,
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "search": normalize_search_text(settlement_name, region, district),
                }
            )

    return sorted(settlements, key=lambda item: item["population"], reverse=True)[:limit]


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    settlements = build_top_settlements()
    OUT_PATH.write_text(
        json.dumps(
            {
                "source": DATASET_API,
                "license": "Creative Commons BY 4.0",
                "count": len(settlements),
                "items": settlements,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Saved {len(settlements)} settlements to {OUT_PATH}")


if __name__ == "__main__":
    main()
