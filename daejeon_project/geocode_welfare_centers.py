"""daejeon_welfare_centers_raw.json의 주소를 카카오 로컬 API로
지오코딩해서 public/data/welfare/daejeon_welfare_centers.geojson으로
저장.

geocode_welfare_facilities.py와 같은 방식 (같은 .env KAKAO_REST_API_KEY).
"""

import re
import sys
import json
import time

import requests

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

INPUT_PATH = f"{ROOT}/public/data/daejeon_welfare_centers_raw.json"
OUTPUT_PATH = f"{ROOT}/public/data/welfare/daejeon_welfare_centers.geojson"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def load_api_key():
    with open(f"{ROOT}/.env", encoding="utf-8") as f:
        for line in f:
            if line.startswith("KAKAO_REST_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("KAKAO_REST_API_KEY가 .env에 없음")


def strip_trailing_building_name(address):
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
        centers = json.load(f)

    print(f"지오코딩 시작: {len(centers)}건")

    features = []
    failed = []

    for i, c in enumerate(centers):
        coords = geocode(session, headers, c["address"])
        if coords is None:
            failed.append(c)
            continue

        lng, lat = coords
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "name": c["name"],
                "district": c["district"],
                "orgType": c["orgType"],
                "phone": c["phone"],
                "address": c["address"],
                "homepage": c["homepage"],
            },
        })

        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(centers)}")

        time.sleep(0.05)

    print(f"성공 {len(features)}건, 실패 {len(failed)}건")
    if failed:
        print("실패 목록:", [f["name"] for f in failed])

    geojson = {
        "type": "FeatureCollection",
        "name": "daejeon_welfare_centers",
        "features": features,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"저장: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
