"""대전장애인단체총연합회 정보드림(djid.or.kr) 장애인 편의시설 목록을
긁어와 public/data/daejeon_welfare_facilities_raw.json으로 저장.

다른 데이터는 download_*.cjs(Node)로 받지만 이건 API가 아니라 HTML
목록 페이지를 긁어야 해서 예외로 Python 사용 (requests/bs4가 샌드박스에
이미 있어서 package.json에 스크래핑용 의존성을 추가 안 해도 됨).

좌표는 이 사이트에 없음 - 상세페이지도 주소를 Kakao 지도 SDK로 클라이언트
단에서 지오코딩하는 방식이라 서버에 좌표가 없다. 좌표는 별도 지오코딩
단계에서 채운다.
"""

import re
import sys
import time
import json

import requests
from bs4 import BeautifulSoup

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUTPUT_PATH = f"{ROOT}/public/data/daejeon_welfare_facilities_raw.json"

BASE = "https://www.djid.or.kr/welfare_facility/b_2/list.do"

# 상세페이지 체크박스 목록(facility01~15)에서 가져온 고정 어휘 - 목록
# 페이지의 편의시설 칸은 구분자 없이 이 라벨들이 그대로 이어붙어 있다.
AMENITY_LABELS = [
    "장애인 화장실", "엘리베이터", "장애인전용 주차구역", "주출입구 단차없음",
    "장애인이용 매표소", "지하철 접근가능", "저상버스 접근가능",
    "장애인단독 접근가능", "장애인이용시 동반자 권장", "휠체어 대여",
    "시각장애인 편의서비스", "청각장애인 편의서비스", "장애인객실",
    "장애인 이용 안내소", "장애인지정석",
]
AMENITY_PATTERN = re.compile("|".join(re.escape(label) for label in AMENITY_LABELS))


def split_amenities(text):
    return AMENITY_PATTERN.findall(text)


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for tr in soup.select("table.boardTypeCol tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        onclick = tds[0].get("onclick", "")
        seq = onclick.split("'")[1] if "'" in onclick else None
        rows.append({
            "seq": seq,
            "district": tds[1].get_text(strip=True),
            "facilityType": tds[2].get_text(strip=True),
            "name": tds[3].get_text(strip=True),
            "phone": None if tds[4].get_text(strip=True) in ("", "-") else tds[4].get_text(strip=True),
            "address": tds[5].get_text(strip=True),
            "amenities": split_amenities(tds[6].get_text(strip=True)),
        })
    return rows


def main():
    print("대전 장애인 편의시설 목록(djid.or.kr) 수집 시작")

    session = requests.Session()
    all_rows = []

    first = session.get(BASE, timeout=20)
    first.raise_for_status()
    total_text = BeautifulSoup(first.text, "html.parser").select_one(".textRight").get_text()
    print("사이트 표시 총건수:", total_text)

    all_rows.extend(parse_page(first.text))

    page = 2
    while True:
        resp = session.get(BASE, params={"page": page, "pagelistno": 1, "gubun": "facility"}, timeout=20)
        resp.raise_for_status()
        rows = parse_page(resp.text)
        if not rows:
            break
        all_rows.extend(rows)
        page += 1
        time.sleep(0.3)
        if page > 200:
            break

    assert len({r["seq"] for r in all_rows}) == len(all_rows), "중복 seq 있음"
    print(f"수집 완료: {len(all_rows)}건 (사이트 표시 건수와 일치해야 함)")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

    print(f"저장: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
