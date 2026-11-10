"""대전 시내버스 실제 운행 시간표(차량운용표)에서 노선별 요일별 평균
배차간격을 뽑아 public/data/bus/bus_route_timetable.json으로 저장.

build_subway_timetable.py와 같은 이유로 Python/pandas 사용 (xlsx 패키지
취약점 회피). 시간표 시트는 노선 하나당 40행짜리 블록이 반복되는
구조라 (노선당 요일구분별 1~3블록) 40행 단위로 끊어서 읽는다.
"""

import sys
import json
import re
import datetime

import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

TIMETABLE_PATH = f"{ROOT}/public/data/daejeon_bus_timetable_raw.xlsx"
OUTPUT_PATH = f"{ROOT}/public/data/bus/bus_route_timetable.json"

BLOCK_SIZE = 40

DAYTYPE_MAP = {
    "평일": "평일",
    "토요일": "토요일",
    "휴일": "휴일",
    "휴,토": "휴일,토요일",
    "휴.토": "휴일,토요일",
    "ALL": "전일",
}


def clean(value):
    return None if pd.isna(value) else value


def to_minutes(value):
    """셀에 기록된 배차간격을 분 단위 정수로 변환.

    엑셀 서식이 노선마다 달라서 timedelta/time/int/str(예: '32(16)')가
    섞여 있다.
    """
    if isinstance(value, datetime.timedelta):
        return round(value.total_seconds() / 60)
    if isinstance(value, datetime.time):
        return value.hour * 60 + value.minute
    if isinstance(value, (int, float)):
        return round(value)
    match = re.match(r"\d+", str(value))
    return int(match.group()) if match else None


def main():
    print("대전 버스 실제 시간표로 배차간격 추출 시작")

    df = pd.read_excel(TIMETABLE_PATH, sheet_name="시간표", header=None)
    n_blocks = len(df) // BLOCK_SIZE
    print(f"총 {n_blocks}개 블록")

    routes = {}

    for i in range(n_blocks):
        b = i * BLOCK_SIZE
        route = df.iloc[b, 0]
        if pd.isna(route):
            continue

        daytype_raw = str(df.iloc[b, 19]).strip()
        daytype = DAYTYPE_MAP.get(daytype_raw, daytype_raw)

        entry = routes.setdefault(route, {
            "category": clean(df.iloc[b, 5]),
            "origin": clean(df.iloc[b, 7]),
            "dest": clean(df.iloc[b, 11]),
            "operator": clean(df.iloc[b + 2, 2]),
            "schedule": {},
        })

        entry["schedule"][daytype] = {
            "headwayMin": to_minutes(df.iloc[b + 2, 15]),
            "onewayMin": to_minutes(df.iloc[b + 2, 19]),
        }

    print(f"노선 수: {len(routes)}")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)

    print(f"저장: {OUTPUT_PATH}")
    print("샘플:", json.dumps(routes.get("급행1번"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
