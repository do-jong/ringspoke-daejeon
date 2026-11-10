
const fs = require("fs");
const path = require("path");

// ========================================
// 설정
// ========================================
//
// 지금까지 만든 버스 데이터(노선 목록/정류소/노선선형)가 서로 앞뒤가
// 맞는지 교차 검증한다. 배차간격을 빠뜨렸던 실수 재발 방지용.

const ROOT_DIR = __dirname;
const BUS_DIR = path.join(ROOT_DIR, "public", "data", "bus");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(BUS_DIR, name), "utf8"));
}

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

function lineLengthMeters(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    total += haversineMeters(lat1, lng1, lat2, lng2);
  }
  return total;
}

function printSection(title) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

function main() {
  const routeList = readJson("bus_route_list.json").routes;
  const routeStops = readJson("bus_route_stops.json");
  const routeLines = readJson("bus_route_lines.geojson").features;

  const stopsByRoute = routeStops;
  const lineByRoute = new Map(
    routeLines.map((f) => [f.properties.routeId, f.geometry.coordinates])
  );

  // ------------------------------------
  // 1. ID 중복/누락
  // ------------------------------------

  printSection("1. 노선 ID 커버리지");

  const listIds = new Set(routeList.map((r) => r.routeId));
  const stopIds = new Set(Object.keys(stopsByRoute));
  const lineIds = new Set(lineByRoute.keys());

  const seen = new Set();
  const duplicates = routeList.filter((r) => {
    if (seen.has(r.routeId)) return true;
    seen.add(r.routeId);
    return false;
  });

  console.log(`route_list: ${listIds.size}개, route_stops: ${stopIds.size}개, route_lines: ${lineIds.size}개`);
  console.log(`route_list 중복 routeId: ${duplicates.length}개`, duplicates.map((d) => d.routeId));

  const stopsNotInList = [...stopIds].filter((id) => !listIds.has(id));
  console.log(`route_stops엔 있지만 route_list엔 없는 노선: ${stopsNotInList.length}개`);

  const listNotInStops = [...listIds].filter((id) => !stopIds.has(id));
  console.log(`route_list엔 있지만 route_stops엔 없는 노선: ${listNotInStops.length}개`, listNotInStops);

  // ------------------------------------
  // 2. 정류소 개수 일치
  // ------------------------------------

  printSection("2. busStopCount vs 실제 정류소 수");

  const stopCountMismatches = [];
  for (const route of routeList) {
    const actual = stopsByRoute[route.routeId]?.length;
    if (actual != null && actual !== route.busStopCount) {
      stopCountMismatches.push({
        routeId: route.routeId,
        routeNo: route.routeNo,
        reported: route.busStopCount,
        actual,
      });
    }
  }

  console.log(`불일치: ${stopCountMismatches.length}개 / ${routeList.length}개`);
  console.log(JSON.stringify(stopCountMismatches.slice(0, 10), null, 2));

  // ------------------------------------
  // 3. 운행거리 vs 실제 노선 선형 길이
  // ------------------------------------

  printSection("3. runDistKm vs 도로-스냅 선형 길이");

  const distMismatches = [];
  for (const route of routeList) {
    const coords = lineByRoute.get(route.routeId);
    if (!coords || route.runDistKm == null) continue;

    const actualKm = lineLengthMeters(coords) / 1000;
    const diffPct = (Math.abs(actualKm - route.runDistKm) / route.runDistKm) * 100;

    if (diffPct > 30) {
      distMismatches.push({
        routeId: route.routeId,
        routeNo: route.routeNo,
        reportedKm: route.runDistKm,
        snappedLineKm: Number(actualKm.toFixed(2)),
        diffPct: Number(diffPct.toFixed(1)),
      });
    }
  }

  console.log(`30% 이상 차이나는 노선: ${distMismatches.length}개 / ${routeList.length}개`);
  console.log(
    "(편도 거리 vs 왕복 스냅 라인일 수 있어서 2배 근처 차이는 정상일 가능성 있음)"
  );
  console.log(JSON.stringify(distMismatches.slice(0, 15), null, 2));

  // ------------------------------------
  // 4. 값 범위 이상치
  // ------------------------------------

  printSection("4. 값 범위 이상치");

  const badInterval = routeList.filter(
    (r) => r.intervalMin == null || r.intervalMin <= 0 || r.intervalMin > 180
  );
  const badRunTime = routeList.filter(
    (r) => r.runTimeMin == null || r.runTimeMin <= 0 || r.runTimeMin > 300
  );
  const badBusTime = routeList.filter(
    (r) => !/^\d{3,4}$/.test(r.firstBus) || !/^\d{3,4}$/.test(r.lastBus)
  );

  console.log(`배차간격 이상(없음/0 이하/180분 초과): ${badInterval.length}개`);
  console.log(JSON.stringify(badInterval.slice(0, 5), null, 2));

  console.log(`\n운행시간 이상(없음/0 이하/300분 초과): ${badRunTime.length}개`);
  console.log(JSON.stringify(badRunTime.slice(0, 5), null, 2));

  console.log(`\n첫차/막차 시각 형식 이상: ${badBusTime.length}개`);
  console.log(JSON.stringify(badBusTime.slice(0, 5), null, 2));

  printSection("검증 완료");
}

main();
