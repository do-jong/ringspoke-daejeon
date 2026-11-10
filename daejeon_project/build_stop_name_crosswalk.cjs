/**
 * 버스정류장 이름/ID가 소스마다 다르게 보이는 케이스를 한곳에 모아두는
 * 매칭표. bus_stops.geojson(data.go.kr 공식 API 기반) 원본은 건드리지
 * 않고, "이 stopId/이 이름은 다른 소스에선 이렇게 불린다"만 기록한다 -
 * 승하차 데이터(대전교통포털 xlsx) 조인하거나 비교할 때 매번 수작업으로
 * 다시 찾지 않도록.
 *
 * 세 가지 케이스:
 *   1. sameStopDifferentName - 같은 stopId인데 포털 승하차 xlsx와
 *      우리 bus_stops.geojson의 정류장 이름이 다름(스냅샷 시점 차이로
 *      보임 - 둘 중 하나가 틀린 게 아니라 각자 다른 시점 기준).
 *   2. tportalUnresolvedId - xlsx에서 stopId를 못 찾아서 "99999"로
 *      찍힌 행들을, 이름으로 우리 쪽 실제 stopId와 매칭.
 *   3. reusedStopIds - build_bus_stops.cjs에서 "stopId 재사용 충돌"로
 *      분리한 43개 - 같은 공식 번호를 쓰는 서로 다른 물리적 정류장.
 */

const fs = require("fs");
const path = require("path");
const { haversineMeters } = require("./lib_geo.cjs");

const ROOT_DIR = __dirname;
const BUS_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_stops.geojson");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/bus/stop_name_crosswalk.json");
// xlsx에서 stopId가 "99999"(미해결)로 찍힌 행들의 실제 좌표 - 같은 이름이
// 여러 stopId에 걸쳐 있는 경우(예: "정부청사광장"이 양방향 정류장 2곳에
// 다 있음) 이름만으론 역매칭이 모호해서 좌표로 가장 가까운 걸 고른다.
const TPORTAL_99999_ROWS_PATH = "/tmp/xls_99999_rows.json";

// 이전 분석(이 세션)에서 사람이 직접 확인한 케이스 - 재현 불가능한 수작업
// 결과라 여기 값으로 고정 기록함(출처: 대전교통포털 정류장승하차이용정보 xlsx).
const SAME_STOP_DIFFERENT_NAME = [
  { stopId: "41500", tportalName: "유성중학교", note: "학교 이름 변경으로 추정 - 스냅샷 시점 차이" },
  { stopId: "51030", tportalName: "선비마을5단지", note: "스냅샷 시점 차이로 추정" },
];


function main() {
  console.log("정류장 이름 크로스워크 생성 시작");

  const busStops = JSON.parse(fs.readFileSync(BUS_STOPS_PATH, "utf-8"));
  const byStopId = new Map();
  const byName = new Map();
  for (const f of busStops.features) {
    const id = f.properties.stopId;
    if (!byStopId.has(id)) byStopId.set(id, []);
    byStopId.get(id).push(f);
    if (!byName.has(f.properties.name)) byName.set(f.properties.name, []);
    byName.get(f.properties.name).push(f);
  }

  // 1. 같은 stopId, 이름만 다름
  const sameStopDifferentName = SAME_STOP_DIFFERENT_NAME.map((entry) => {
    const match = (byStopId.get(entry.stopId) || [])[0];
    return {
      stopId: entry.stopId,
      ourName: match ? match.properties.name : null,
      tportalName: entry.tportalName,
      note: entry.note,
    };
  });

  // 2. xlsx의 "99999"(ID 미해결) 행 -> 좌표로 가장 가까운 우리 쪽 정류장 역매칭
  const tportal99999Rows = JSON.parse(fs.readFileSync(TPORTAL_99999_ROWS_PATH, "utf-8"));
  const tportalUnresolvedId = tportal99999Rows.map((row) => {
    const candidates = byName.get(row.name) || [];
    let best = null;
    let bestDist = Infinity;
    for (const f of candidates) {
      const [lng, lat] = f.geometry.coordinates;
      const d = haversineMeters(lat, lng, row.lat, row.lng);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return {
      tportalName: row.name,
      tportalCoordinates: [row.lng, row.lat],
      resolvedStopId: best ? best.properties.stopId : null,
      distanceM: best ? Math.round(bestDist) : null,
      candidateCount: candidates.length,
    };
  });
  const unresolvedCount = tportalUnresolvedId.filter((e) => e.resolvedStopId === null).length;

  // 3. stopId 재사용으로 분리된 43개 - 같은 번호, 다른 물리적 위치
  const reusedStopIds = [...byStopId.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([stopId, list]) => ({
      stopId,
      variants: list.map((f) => ({
        name: f.properties.name,
        nodeId: f.properties.nodeId,
        coordinates: f.geometry.coordinates,
        routeCount: f.properties.routeCount,
      })),
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    description:
      "정류장 이름/ID가 소스마다 다르게 보이는 케이스 모음. bus_stops.geojson 원본은 그대로 두고 매칭 정보만 기록함.",
    sameStopDifferentName,
    tportalUnresolvedId,
    reusedStopIds,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`이름만 다른 케이스: ${sameStopDifferentName.length}건`);
  console.log(`xlsx 99999 -> 실제 stopId 역매칭: ${tportalUnresolvedId.length}건 (매칭 실패 ${unresolvedCount}건)`);
  const farMatches = tportalUnresolvedId.filter((e) => e.distanceM != null && e.distanceM > 500);
  console.log(`  그 중 매칭 거리 500m 초과(불확실): ${farMatches.length}건`);
  console.log(`stopId 재사용(분리됨): ${reusedStopIds.length}건`);
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
