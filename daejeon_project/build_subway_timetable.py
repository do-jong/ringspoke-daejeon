"""대전 1호선 열차 시각표(KRIC)로 요일별 배차간격을 계산해서
daejeon_subway_route.geojson에 붙인다.

build_subway_data.py와 같은 이유로 Python 사용 (xlsx 패키지 취약점 회피).
"""

import sys
import json

import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

TIMETABLE_PATH = f"{ROOT}/public/data/daejeon_subway_timetable_raw.xlsx"
ROUTE_PATH = f"{ROOT}/public/data/subway/daejeon_subway_route.geojson"

# 전체 구간을 뛰는 기본 방향만 배차간격 계산에 쓴다 (정부청사/서대전네거리/
# 구암발은 단거리 임시 운행이라 끼면 배차간격이 실제보다 촘촘하게 나옴)
MAIN_DIRECTIONS = ["반석(칠성대)", "판암(대전대)"]


def to_minutes(hhmmss):
    s = str(hhmmss).zfill(6)
    return int(s[0:2]) * 60 + int(s[2:4])


def main():
    print("대전 1호선 시각표로 배차간격 계산 시작")

    df = pd.read_excel(TIMETABLE_PATH, header=0, dtype=str)
    df = df[df["시발역명"].isin(MAIN_DIRECTIONS)]

    headway = {}

    for day in df["요일"].unique():
        day_df = df[df["요일"] == day]
        headway[day] = {}

        for direction in MAIN_DIRECTIONS:
            times = sorted(
                to_minutes(t) for t in day_df[day_df["시발역명"] == direction]["시발시각"]
            )

            if len(times) < 2:
                continue

            gaps = [b - a for a, b in zip(times, times[1:])]

            headway[day][direction] = {
                "tripCount": len(times),
                "firstDeparture": f"{times[0] // 60:02d}:{times[0] % 60:02d}",
                "lastDeparture": f"{times[-1] // 60:02d}:{times[-1] % 60:02d}",
                "avgHeadwayMin": round(sum(gaps) / len(gaps), 1),
                "minHeadwayMin": min(gaps),
                "maxHeadwayMin": max(gaps),
            }

    print(json.dumps(headway, ensure_ascii=False, indent=2))

    with open(ROUTE_PATH, encoding="utf-8") as f:
        route = json.load(f)

    route["features"][0]["properties"]["headway"] = headway

    with open(ROUTE_PATH, "w", encoding="utf-8") as f:
        json.dump(route, f, ensure_ascii=False)

    print(f"\n{ROUTE_PATH}의 properties.headway에 저장 완료")


if __name__ == "__main__":
    main()
