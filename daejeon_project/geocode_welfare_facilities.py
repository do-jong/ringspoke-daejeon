"""daejeon_welfare_facilities_raw.json의 주소를 카카오 로컬 API로
지오코딩해서 public/data/welfare/daejeon_welfare_facilities.geojson으로
저장.

.env의 KAKAO_REST_API_KEY 사용. 도로명주소가 안 맞는 경우가 있어서
실패하면 지번 부분만 잘라서 한 번 더 시도하고, 그래도 실패하면 좌표 없이
스킵하고 끝에 몇 건 실패했는지 보고한다.
"""

import os
import re
import sys
import json
import time

import requests

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

INPUT_PATH = f"{ROOT}/public/data/daejeon_welfare_facilities_raw.json"
OUTPUT_PATH = f"{ROOT}/public/data/welfare/daejeon_welfare_facilities.geojson"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def load_api_key():
    env_path = f"{ROOT}/.env"
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("KAKAO_REST_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("KAKAO_REST_API_KEY가 .env에 없음")


def strip_trailing_building_name(address):
    """'대전 중구 보문산로 270 (문화동) 한밭복합문화체육센'처럼 건물명이
    괄호 뒤에 덧붙어 지오코딩을 방해하는 경우, 괄호까지만 남긴다."""
    match = re.match(r"^(.*\([^)]*\))", address)
    return match.group(1) if match else address


def geocode(session, headers, address):
    for query in (address, strip_trailing_building_name(address)):
        resp = session.get(GEOCODE_URL, params={"query": query}, headers=headers, timeout=10)
        resp.raise_for_status()
        docs = resp.json().get("documents")
        if docs:
            return float(docs[0]["x"]), float(docs[0]["y"])
    return None


def main():
    api_key = load_api_key()
    headers = {"Authorization": f"KakaoAK {api_key}"}
    session = requests.Session()

    with open(INPUT_PATH, encoding="utf-8") as f:
        facilities = json.load(f)

    print(f"지오코딩 시작: {len(facilities)}건")

    features = []
    failed = []

    for i, fac in enumerate(facilities):
        coords = geocode(session, headers, fac["address"])
        if coords is None:
            failed.append(fac)
            continue

        lng, lat = coords
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "name": fac["name"],
                "district": fac["district"],
                "facilityType": fac["facilityType"],
                "phone": fac["phone"],
                "address": fac["address"],
                "amenities": fac["amenities"],
            },
        })

        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(facilities)}")

        time.sleep(0.05)

    print(f"성공 {len(features)}건, 실패 {len(failed)}건")
    if failed:
        print("실패 목록:", [f["name"] for f in failed])

    geojson = {
        "type": "FeatureCollection",
        "name": "daejeon_welfare_facilities",
        "features": features,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"저장: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
