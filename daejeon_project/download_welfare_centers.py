"""대전장애인단체총연합회 정보드림(djid.or.kr) 복지시설 목록을 긁어와
public/data/daejeon_welfare_centers_raw.json으로 저장.

download_welfare_facilities.py(b_2, 편의시설 검색)와 같은 사이트의
다른 목록(b_1, 복지시설 검색)이라 구조가 비슷함 - 컬럼만 다름
(지역/기관유형/기관명/전화번호/주소/홈페이지).

좌표는 여기도 없음(상세페이지가 클라이언트에서 Kakao 지도로 지오코딩) -
geocode_welfare_facilities.py와 같은 방식으로 별도 지오코딩 필요.
"""

import sys
import time
import json

import requests
from bs4 import BeautifulSoup

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUTPUT_PATH = f"{ROOT}/public/data/daejeon_welfare_centers_raw.json"

BASE = "https://www.djid.or.kr/welfare_facility/b_1/list.do"


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for tr in soup.select("table.boardTypeCol tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        onclick = tds[0].get("onclick", "")
        seq = onclick.split("'")[1] if "'" in onclick else None
        homepage_link = tds[6].find("a")
        rows.append({
            "seq": seq,
            "district": tds[1].get_text(strip=True),
            "orgType": tds[2].get_text(strip=True),
            "name": tds[3].get_text(strip=True),
            "phone": tds[4].get_text(strip=True) or None,
            "address": tds[5].get_text(strip=True),
            "homepage": homepage_link["href"] if homepage_link else None,
        })
    return rows


def main():
    print("대전 복지시설 목록(djid.or.kr b_1) 수집 시작")

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
