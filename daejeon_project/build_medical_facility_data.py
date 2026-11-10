"""대전 병원·약국 데이터(건강보험심사평가원 병원정보서비스/약국정보서비스)를
GeoJSON으로 변환.

원본은 전국 데이터(병원 79,899건/16.8MB, 약국 25,850건/4MB)라 대전만 걸러서
public/data/daejeon_hospitals_raw.csv, daejeon_pharmacies_raw.csv로 미리
추출해뒀다 (이 스크립트는 그 결과물을 입력으로 쓴다).

xlsx 대신 csv를 쓰는 이유는 build_subway_data.py와 다름: 원본이 nationwide라
전체를 리포에 올리기엔 너무 크고, 대전만 추출하고 나면 더 이상 xlsx일 필요가
없어서 csv로 저장함.
"""

import sys
import json

import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

HOSPITALS_RAW = f"{ROOT}/public/data/daejeon_hospitals_raw.csv"
PHARMACIES_RAW = f"{ROOT}/public/data/daejeon_pharmacies_raw.csv"

HOSPITALS_OUTPUT = f"{ROOT}/public/data/medical/daejeon_hospitals.geojson"
PHARMACIES_OUTPUT = f"{ROOT}/public/data/medical/daejeon_pharmacies.geojson"


def to_geojson(df, name):
    features = []
    for _, row in df.iterrows():
        lng = float(row["좌표(X)"])
        lat = float(row["좌표(Y)"])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "name": row["요양기관명"],
                "type": row["종별코드명"],
                "district": row["시군구코드명"],
                "address": row["주소"],
                "phone": row["전화번호"] if pd.notna(row["전화번호"]) else None,
                "openedAt": str(row["개설일자"])[:10] if pd.notna(row["개설일자"]) else None,
            },
        })

    return {"type": "FeatureCollection", "name": name, "features": features}


def main():
    print("대전 병원·약국 데이터 변환 시작")

    hospitals = pd.read_csv(HOSPITALS_RAW, dtype=str)
    pharmacies = pd.read_csv(PHARMACIES_RAW, dtype=str)

    print(f"병원 {len(hospitals)}개, 약국 {len(pharmacies)}개")
    print("병원 종별:", hospitals["종별코드명"].value_counts().to_dict())

    hospitals_geojson = to_geojson(hospitals, "daejeon_hospitals")
    pharmacies_geojson = to_geojson(pharmacies, "daejeon_pharmacies")

    with open(HOSPITALS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(hospitals_geojson, f, ensure_ascii=False)

    with open(PHARMACIES_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(pharmacies_geojson, f, ensure_ascii=False)

    print(f"저장: {HOSPITALS_OUTPUT}")
    print(f"저장: {PHARMACIES_OUTPUT}")


if __name__ == "__main__":
    main()
