/**
 * 버스 운행 시뮬레이션용 정류소 위치 인덱스/소요시간 오프셋 계산.
 *
 * bus_route_lines.geojson(노선 1개 = 왕복 전체 선형, OSRM 도로 스냅 완료)과
 * bus_route_stops.json(같은 왕복 전체 정류소 순서 - 기점에서 종점 갔다가
 * 같은 기점으로 복귀)은 이미 있어서 다시 안 만듦 - 여기선 그 둘을 이어주는
 * 얇은 인덱스만 만든다.
 *
 * 공식 runDistKm/runTimeMin이 "RUN_DIST_HALF"(편도) 필드라서 실제 선형
 * 길이가 그 2배 정도로 나옴(확인 완료, 비율 2.0~2.2) - 그래서 왕복 전체
 * 소요시간은 runTimeMin*2로 추정.
 *
 * 인덱스를 stopId가 아니라 "몇 번째 정류소인지"(배열 위치)로 저장한다 -
 * 왕복 중 막다른 지선 구간은 같은 정류소(같은 stopId)를 가는 길/오는 길에
 * 두 번 지나는데, stopId를 키로 쓰면 두 번째 방문이 첫 번째 방문의 결과를
 * 덮어써서 그 구간이 통째로 틀어지는 버그가 있었음(실측 확인).
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const LINES_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_lines.geojson");
const STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_stops.json");
const ROUTE_LIST_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_list.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_line_shape.json");

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

function pathLengthMeters(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1] = points[i];
    const [lng2, lat2] = points[i + 1];
    total += haversineMeters(lat1, lng1, lat2, lng2);
  }
  return total;
}

// 정류소들을 선형 위에 순서대로 스냅해서, "몇 번째 정류소"(배열 위치) ->
// "선 위 몇 번째 점"인 배열을 만든다. stopId로 안 쓰는 이유: 왕복 노선 중
// 일부(막다른 지선 구간)는 같은 정류소(같은 stopId)를 가는 길/오는 길에
// 두 번 지나는데, stopId를 키로 쓰면 두 번째 방문이 첫 번째 방문의 인덱스를
// 덮어써서 그 구간이 통째로 틀어지는 버그가 있었음(실측 확인 - route
// 30300014의 "목달동/송곡가든" 정류소가 그 경우).
//
// 직전 정류소부터 "실제 누적 거리"가 일정 한도를 넘기 전까지만 최근접점을
// 찾는다(점 개수 기준 창은 처음에 썼는데, 고속도로/외곽처럼 점 간격이
// 넓은 구간에서 창이 같이 커져서 왕복 반대편까지 닿아버리는 문제가 9개
// 노선에 남아있었음 - 점 개수가 아니라 실제 거리(m)로 막아야 함).
// 한도는 "직전 정류소~이번 정류소 직선거리"의 10배(최소 1km, 최대
// 8km) - 실제 도로는 직선보다 돌아가니 여유를 주되, 왕복 반대쪽
// 구간까지는 안 닿을 만큼만.
function buildStopIndexByPosition(line, stops) {
  const stopIndex = new Array(stops.length);
  let from = 0;
  let prevLat = stops[0].lat;
  let prevLng = stops[0].lng;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const straightM = haversineMeters(prevLat, prevLng, stop.lat, stop.lng);
    const capM = Math.min(8000, Math.max(1000, straightM * 10));

    let best = from;
    let bestDist = haversineMeters(stop.lat, stop.lng, line[from][1], line[from][0]);
    let accumM = 0;

    for (let j = from; j < line.length; j++) {
      const [lng, lat] = line[j];
      const d = haversineMeters(stop.lat, stop.lng, lat, lng);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
      if (j < line.length - 1) {
        const [nLng, nLat] = line[j + 1];
        accumM += haversineMeters(lat, lng, nLat, nLng);
        if (accumM > capM) break;
      }
    }

    stopIndex[i] = best;
    from = best;
    prevLat = stop.lat;
    prevLng = stop.lng;
  }

  return stopIndex;
}

function main() {
  console.log("버스 노선 선형 인덱스 생성 시작");

  const lines = JSON.parse(fs.readFileSync(LINES_PATH, "utf-8"));
  const stopsByRoute = JSON.parse(fs.readFileSync(STOPS_PATH, "utf-8"));
  const routeList = JSON.parse(fs.readFileSync(ROUTE_LIST_PATH, "utf-8")).routes;
  const lineByRoute = new Map(lines.features.map((f) => [f.properties.routeId, f.geometry.coordinates]));
  const routeInfoById = new Map(routeList.map((r) => [r.routeId, r]));

  const result = {};
  let skipped = 0;

  for (const [routeId, stops] of Object.entries(stopsByRoute)) {
    const line = lineByRoute.get(routeId);
    const info = routeInfoById.get(routeId);
    if (!line || !info || !info.runTimeMin) {
      skipped++;
      continue;
    }

    const stopIndex = buildStopIndexByPosition(line, stops);

    const totalDistM = pathLengthMeters(line);
    const totalMin = info.runTimeMin * 2; // RUN_TM은 편도 - 왕복 전체 선형이라 2배

    // 정류소 "몇 번째인지"(배열 위치) 기준으로 나란히 저장 - stopId를 키로
    // 쓰면 왕복 중 같은 정류소를 두 번 지나는 구간에서 덮어써짐(위 설명 참고)
    const stopOffsetMin = stopIndex.map((idx) => {
      const distSoFar = pathLengthMeters(line.slice(0, idx + 1));
      return Math.round((distSoFar / totalDistM) * totalMin * 10) / 10;
    });

    result[routeId] = {
      stopIds: stops.map((s) => s.stopId),
      stopIndex,
      stopOffsetMin,
      totalMin: Math.round(totalMin * 10) / 10,
    };
  }

  console.log(`완료: ${Object.keys(result).length}개 노선 (건너뜀: ${skipped}개 - 선형/소요시간 없음)`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
