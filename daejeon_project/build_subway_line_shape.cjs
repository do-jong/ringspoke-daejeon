/**
 * 지하철 열차 마커가 "지하철(OSM 추정)" 실제 선로 위를 따라가도록,
 * OSM 1호선 선로(이름 "대전 도시철도 1호선")를 판암<->반석 순서로
 * 이어붙이고 각 역이 이 선 위 몇 번째 점에 가장 가까운지 계산.
 *
 * 같은 이름의 way가 3개 있는데, 복선이라 실제로 서로 다른 두 선로다:
 * - 2개(56점+101점, 끝점이 정확히 맞닿음)를 이어붙이면 판암->반석 한쪽 선로
 * - 나머지 1개(183점)는 역 순서와 반대로(반석->판암) 단조증가하게 스냅돼서
 *   그게 반대쪽(판암행) 선로임을 확인함
 * 그래서 반석행/판암행을 서로 다른 선 위에서 움직이게 만든다.
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || ".";
const MAP_PATH = path.join(ROOT, "public/data/daejeon_map.geojson");
const STATIONS_PATH = path.join(ROOT, "public/data/subway/daejeon_subway_stations.geojson");
const OUTPUT_PATH = path.join(ROOT, "public/data/subway/daejeon_subway_line_shape.json");

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestIndex(path, pt) {
  let best = 0;
  let bestDist = Infinity;
  path.forEach((c, i) => {
    const d = haversineMeters(pt[1], pt[0], c[1], c[0]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return { index: best, dist: bestDist };
}

// stations는 열차가 지나는 순서(line과 같은 방향)여야 함
function snapStations(line, stations, label) {
  let prevIndex = -1;
  const stationIndex = {};
  for (const f of stations) {
    const { index, dist } = nearestIndex(line, f.geometry.coordinates);
    if (index <= prevIndex) {
      throw new Error(`[${label}] ${f.properties.name}의 스냅 위치가 역 순서랑 안 맞음`);
    }
    stationIndex[f.properties.name] = index;
    console.log(`[${label}] ${f.properties.name}: 선 위 ${index}번째 점 (${dist.toFixed(1)}m)`);
    prevIndex = index;
  }
  return stationIndex;
}

function main() {
  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));
  const named = mapData.features.filter((f) => f.properties?.name === "대전 도시철도 1호선");

  if (named.length !== 3) {
    throw new Error(`예상과 다름: "대전 도시철도 1호선" feature ${named.length}개 (3개 예상)`);
  }

  const byLength = [...named].sort(
    (a, b) => a.geometry.coordinates.length - b.geometry.coordinates.length
  );
  const [panamSide, banseokSide, otherTrack] = byLength; // 56점, 101점, 183점(반대쪽 선로)

  const joinEnd = panamSide.geometry.coordinates[panamSide.geometry.coordinates.length - 1];
  const joinStart = banseokSide.geometry.coordinates[0];
  const joinGapM = haversineMeters(joinEnd[1], joinEnd[0], joinStart[1], joinStart[0]);
  if (joinGapM > 5) {
    throw new Error(`두 way가 안 이어짐 (간격 ${joinGapM.toFixed(1)}m) - 순서/방향 재확인 필요`);
  }

  // 판암쪽(56점) + 반석쪽(101점) = 반석행 선로 (판암->반석 순서)
  const toBanseok = panamSide.geometry.coordinates.concat(
    banseokSide.geometry.coordinates.slice(1)
  );
  // 183점짜리는 그 자체로 이미 반석->판암 순서인 반대쪽 선로
  const toPanam = otherTrack.geometry.coordinates;

  const stationsData = JSON.parse(fs.readFileSync(STATIONS_PATH, "utf-8"));
  const stationsSorted = [...stationsData.features].sort(
    (a, b) => Number(a.properties.stationNo) - Number(b.properties.stationNo)
  );
  const stationsReversed = [...stationsSorted].reverse();

  const output = {
    toBanseok: {
      line: toBanseok,
      stationIndex: snapStations(toBanseok, stationsSorted, "반석행"),
    },
    toPanam: {
      line: toPanam,
      stationIndex: snapStations(toPanam, stationsReversed, "판암행"),
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
