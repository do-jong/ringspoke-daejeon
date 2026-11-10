/**
 * 대전역 안내판 "역간 소요시간" 사진(사용자 제공)의 역별 대전역 기준
 * 누적 소요시간을 판암역 기준으로 환산해서 daejeon_subway_stations.geojson에
 * offsetFromPanamMin(판암 출발 기준 통과시각, 분) 필드로 추가.
 *
 * 공식 요약표(편도 20.5km, 소요시분 40분)와 합이 정확히 맞아서
 * (판암~대전 6분 + 대전~반석 34분 = 40분) 그대로 믿고 쓴다.
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || ".";
const STATIONS_PATH = path.join(ROOT, "public/data/subway/daejeon_subway_stations.geojson");

// 대전역(0분) 기준 누적 소요시간(분). 판암 방향은 음수.
const MIN_FROM_DAEJEON = {
  판암역: -6,
  신흥역: -4,
  대동역: -2,
  대전역: 0,
  중앙로역: 2,
  중구청역: 3,
  서대전네거리역: 5,
  오룡역: 7,
  용문역: 9,
  탄방역: 12,
  시청역: 13,
  정부청사역: 15,
  갈마역: 17,
  월평역: 19,
  갑천역: 21,
  유성온천역: 23,
  구암역: 25,
  현충원역: 26,
  월드컵경기장역: 28,
  노은역: 30,
  지족역: 32,
  반석역: 34,
};

const PANAM_TO_DAEJEON_MIN = 6; // 판암역 기준 0분으로 다시 잡기 위한 offset
const TOTAL_MIN = 40;

function main() {
  const data = JSON.parse(fs.readFileSync(STATIONS_PATH, "utf-8"));

  let cumulativeDistKm = 0;
  const sorted = [...data.features].sort(
    (a, b) => Number(a.properties.stationNo) - Number(b.properties.stationNo)
  );

  console.log("역명\t공식(분)\t거리비례추정(분)\t차이");
  for (const f of sorted) {
    const p = f.properties;
    const minFromDaejeon = MIN_FROM_DAEJEON[p.name];
    if (minFromDaejeon === undefined) {
      throw new Error(`역 이름 매칭 실패: ${p.name}`);
    }
    const offsetFromPanamMin = minFromDaejeon + PANAM_TO_DAEJEON_MIN;
    p.offsetFromPanamMin = offsetFromPanamMin;
    p.offsetFromBanseokMin = TOTAL_MIN - offsetFromPanamMin;

    // 거리 비례였다면 몇 분이었을지 (검증용 - 실제 속도가 균일하지 않다는 걸
    // 보여주려는 목적이라 큰 차이가 나도 데이터 오류는 아님)
    const distRatioMin = (cumulativeDistKm / 20.5) * TOTAL_MIN;
    console.log(
      `${p.name}\t${offsetFromPanamMin}\t${distRatioMin.toFixed(1)}\t${(offsetFromPanamMin - distRatioMin).toFixed(1)}`
    );
    cumulativeDistKm += p.upDistanceKm || 0;
  }

  fs.writeFileSync(STATIONS_PATH, JSON.stringify(data));
  console.log(`저장: ${STATIONS_PATH}`);
}

main();
