"""대전 도시철도 1호선 역 정보(KRIC 레일포털 조사서)를 GeoJSON으로 변환.

Python/pandas로 작성한 이유: 이 xlsx를 읽으려면 파서가 필요한데, npm의
xlsx(SheetJS) 패키지는 고쳐지지 않은 high 취약점이 있어서(No fix
available) 안 쓰기로 했다. pandas/openpyxl은 이미 안전하게 쓰고 있어서
그대로 활용. 다른 데이터는 다 .cjs(Node)로 만들지만 이것만 예외.
"""

import sys
import json
import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

INPUT_PATH = f"{ROOT}/public/data/daejeon_subway_stations_raw.xlsx"
STATIONS_OUTPUT = f"{ROOT}/public/data/subway/daejeon_subway_stations.geojson"
ROUTE_OUTPUT = f"{ROOT}/public/data/subway/daejeon_subway_route.geojson"


def main():
    print("대전 지하철 1호선 역 정보 변환 시작")

    df = pd.read_excel(INPUT_PATH, header=3)
    daejeon = df[df["철도운영기관명"] == "대전교통공사"].sort_values("역 번호")

    print(f"역 수: {len(daejeon)}개")

    station_features = []
    coords = []

    for _, row in daejeon.iterrows():
        lng = float(row["역 위치(경도)"])
        lat = float(row["역 위치(위도)"])
        coords.append([lng, lat])

        station_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "stationNo": str(row["역 번호"]),
                "name": row["역명(한글)"],
                "nameEn": row["역명(영어)"] if pd.notna(row["역명(영어)"]) else None,
                "line": row["운영노선"],
                "isTransfer": bool(row["환승역 여부"]) if pd.notna(row["환승역 여부"]) else False,
                "upDistanceKm": float(row["상행거리"]) if pd.notna(row["상행거리"]) else None,
                "downDistanceKm": float(row["하행거리"]) if pd.notna(row["하행거리"]) else None,
                "openedAt": str(row["신설일자"]) if pd.notna(row["신설일자"]) else None,
            },
        })

    stations_geojson = {
        "type": "FeatureCollection",
        "name": "daejeon_subway_stations",
        "features": station_features,
    }

    route_geojson = {
        "type": "FeatureCollection",
        "name": "daejeon_subway_route",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"line": "1호선"},
        }],
    }

    with open(STATIONS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(stations_geojson, f, ensure_ascii=False)

    with open(ROUTE_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(route_geojson, f, ensure_ascii=False)

    print(f"저장: {STATIONS_OUTPUT}")
    print(f"저장: {ROUTE_OUTPUT}")
    print("샘플:", json.dumps(station_features[0], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
