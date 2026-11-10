/**
 * 트램-버스 공간 분석 제안서 4.1 "노선 중복률 및 독립 서비스 구간 분석".
 *
 * 중복률(%) = (버스와 트램이 공유하는 도로 구간 길이 / 버스 노선 전체 길이) × 100
 *
 * 버스·트램 둘 다 같은 "도로 링크 ID"를 갖고 있지 않아서(각자 다른
 * 스크립트로 OSRM/OSM 선형을 따로 만듦), 도로 링크 매칭 대신 근접도
 * 기반으로 추정한다: 버스 노선 선형의 각 구간이 트램 선형(본선+연축+
 * 진잠 전부)과 THRESHOLD_M 이내로 가까우면 "공유 구간"으로 본다.
 * 트램이 전용궤도로 도로 위/옆에 깔리는 걸 감안해 30m로 잡음(차로 폭
 * 몇 개 + 약간의 OSRM/OSM 스냅 오차 정도).
 *
 * 버스 노선 선형은 왕복 전체(기점→종점→기점)라서 방향 구분 없이 전체
 * 기준으로 집계함(제안서 4.2 "방향별 공유 구간 우선, 전체는 별도 집계"
 * 중 전체 집계 버전 - 방향별은 추후 필요하면 추가).
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const BUS_LINES_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_lines.geojson");
const ROUTE_LIST_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_list.json");
const TRAM_SHAPE_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_line_shape.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/analysis/bus_tram_overlap.json");

const THRESHOLD_M = 30;

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

// 간단한 그리드 인덱스 - 트램 점이 494개뿐이라 없어도 되지만, 버스
// 노선이 141개라 전체로는 수천만 번 비교라 그리드로 속도 확보
function buildGrid(points, cellDeg) {
  const grid = new Map();
  const key = (lng, lat) => `${Math.floor(lng / cellDeg)},${Math.floor(lat / cellDeg)}`;
  for (const pt of points) {
    const k = key(pt[0], pt[1]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(pt);
  }
  return { grid, key, cellDeg };
}

function nearestTramDist(index, lng, lat) {
  const cx = Math.floor(lng / index.cellDeg);
  const cy = Math.floor(lat / index.cellDeg);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const pts = index.grid.get(`${cx + dx},${cy + dy}`);
      if (!pts) continue;
      for (const [tLng, tLat] of pts) {
        const d = haversineMeters(lat, lng, tLat, tLng);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function main() {
  console.log("버스-트램 노선 중복률 분석 시작");

  const busLines = JSON.parse(fs.readFileSync(BUS_LINES_PATH, "utf-8"));
  const routeList = JSON.parse(fs.readFileSync(ROUTE_LIST_PATH, "utf-8")).routes;
  const routeInfoById = new Map(routeList.map((r) => [r.routeId, r]));
  const tramShape = JSON.parse(fs.readFileSync(TRAM_SHAPE_PATH, "utf-8"));

  const tramPoints = [...tramShape.mainline.line, ...tramShape.yeonchuk.line, ...tramShape.jinjam.line];
  const cellDeg = 0.0015; // 약 150m 셀
  const tramIndex = buildGrid(tramPoints, cellDeg);

  const results = [];

  for (const feature of busLines.features) {
    const routeId = feature.properties.routeId;
    const info = routeInfoById.get(routeId);
    if (!info) continue; // 지난번에 확인한 "현재 공식 노선 목록에 없는" 32개 제외

    const line = feature.geometry.coordinates;
    let totalM = 0;
    let overlapM = 0;

    for (let i = 0; i < line.length - 1; i++) {
      const [lng1, lat1] = line[i];
      const [lng2, lat2] = line[i + 1];
      const segM = haversineMeters(lat1, lng1, lat2, lng2);
      totalM += segM;

      // 구간 양 끝점이 둘 다 트램 근처면 그 구간 전체를 공유로 봄
      const d1 = nearestTramDist(tramIndex, lng1, lat1);
      const d2 = nearestTramDist(tramIndex, lng2, lat2);
      if (d1 <= THRESHOLD_M && d2 <= THRESHOLD_M) overlapM += segM;
    }

    results.push({
      routeId,
      routeNo: info.routeNo,
      totalKm: Math.round((totalM / 1000) * 100) / 100,
      overlapKm: Math.round((overlapM / 1000) * 100) / 100,
      overlapPercent: totalM > 0 ? Math.round((overlapM / totalM) * 1000) / 10 : 0,
    });
  }

  results.sort((a, b) => b.overlapPercent - a.overlapPercent);

  console.log(`분석 완료: ${results.length}개 노선 (근접 기준 ${THRESHOLD_M}m)`);
  console.log("\n중복률 상위 15개 노선:");
  console.log("노선번호\t중복률(%)\t중복거리(km)\t전체거리(km)");
  for (const r of results.slice(0, 15)) {
    console.log(`${r.routeNo}\t${r.overlapPercent}\t${r.overlapKm}\t${r.totalKm}`);
  }

  const zeroOverlap = results.filter((r) => r.overlapPercent === 0).length;
  console.log(`\n중복 구간 전혀 없는 노선(완전 독립 서비스): ${zeroOverlap}개`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ thresholdMeters: THRESHOLD_M, generatedAt: new Date().toISOString(), routes: results })
  );
  console.log(`\n저장: ${OUTPUT_PATH}`);
}

main();
