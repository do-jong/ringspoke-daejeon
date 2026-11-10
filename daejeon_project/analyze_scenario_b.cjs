/**
 * 트램-버스 공간 분석 제안서 5.2 "B 시나리오: 일부 버스 노선 조정".
 *
 * 조정 규칙(분석 전에 확정, 결과 보고 임의로 안 바꿈):
 *   1. 버스-트램 중복률 15% 이상인 노선(analyze_route_overlap.cjs 결과
 *      기준 - 104/1/115/102/706번, 5개)을 조정 후보로 삼는다.
 *   2. 그 노선들의 정류장 중 트램 정거장으로부터 300m 이내에 있는
 *      정류장은 "트램이 사실상 대체한다"고 보고 뺀다.
 *   3. 단, 그 정류장을 중복률 15% 미만인 다른(독립적인) 노선도 같이
 *      쓰고 있으면 그 노선을 통한 서비스는 그대로 남으므로 전체
 *      정류장 집합에서는 빼지 않는다(한 노선만 보고 정류장 자체를
 *      없애버리면 그 정류장을 쓰는 다른 노선 승객까지 영향받기 때문).
 *
 * A 시나리오(기존 유지, analyze_service_population.cjs 결과)와 똑같은
 * 지표로 비교해서 접근성/잠재영향인구 변화를 본다.
 */

const fs = require("fs");
const path = require("path");
const { centroidOfMultiPolygon, computeCoverage, buildGrid, nearestDist } = require("./lib_geo.cjs");

const ROOT_DIR = __dirname;
const OVERLAP_PATH = path.join(ROOT_DIR, "public/data/analysis/bus_tram_overlap.json");
const POPULATION_PATH = path.join(ROOT_DIR, "public/data/population/daejeon_population_oa.geojson");
const BUS_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_stops.geojson");
const TRAM_STATIONS_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_stations.geojson");
const SCENARIO_A_PATH = path.join(ROOT_DIR, "public/data/analysis/service_population.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/analysis/scenario_b.json");

const OVERLAP_THRESHOLD_PERCENT = 15;
const TRAM_PROXIMITY_M = 300;
const RADII_M = [300, 500];

function main() {
  console.log("B 시나리오(일부 버스 노선 조정) 분석 시작");

  const overlap = JSON.parse(fs.readFileSync(OVERLAP_PATH, "utf-8"));
  const candidateRouteIds = new Set(
    overlap.routes.filter((r) => r.overlapPercent >= OVERLAP_THRESHOLD_PERCENT).map((r) => r.routeId)
  );
  console.log(
    `조정 후보 노선(중복률 ${OVERLAP_THRESHOLD_PERCENT}% 이상): ${candidateRouteIds.size}개 - ` +
      overlap.routes
        .filter((r) => candidateRouteIds.has(r.routeId))
        .map((r) => `${r.routeNo}(${r.overlapPercent}%)`)
        .join(", ")
  );

  const busStops = JSON.parse(fs.readFileSync(BUS_STOPS_PATH, "utf-8"));
  const tramStations = JSON.parse(fs.readFileSync(TRAM_STATIONS_PATH, "utf-8"));
  const tramPoints = tramStations.features.map((f) => f.geometry.coordinates);
  const tramIndex = buildGrid(tramPoints, 0.005);

  const removedStops = [];
  const keptStops = [];

  for (const f of busStops.features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const nearTram = nearestDist(tramIndex, lng, lat) <= TRAM_PROXIMITY_M;
    const allRoutesAreCandidates = p.routeIds.every((rid) => candidateRouteIds.has(rid));
    const touchesCandidateRoute = p.routeIds.some((rid) => candidateRouteIds.has(rid));

    if (nearTram && touchesCandidateRoute && allRoutesAreCandidates) {
      removedStops.push(f);
    } else {
      keptStops.push(f);
    }
  }

  console.log(
    `\n정류장 ${busStops.features.length}개 중 ${removedStops.length}개 제외(트램 ${TRAM_PROXIMITY_M}m 이내 + 서비스 노선 전부 조정후보), ${keptStops.length}개 유지`
  );
  console.log("제외된 정류장 예시:", removedStops.slice(0, 8).map((f) => f.properties.name).join(", "));

  const popData = JSON.parse(fs.readFileSync(POPULATION_PATH, "utf-8"));
  const oaList = popData.features.map((f) => {
    const [lng, lat] = centroidOfMultiPolygon(f.geometry);
    return { code: f.properties.oaCode, lng, lat, totalPop: f.properties.totalPop, elderlyPop: f.properties.elderlyPop };
  });
  const grandTotalPop = oaList.reduce((s, o) => s + o.totalPop, 0);
  const grandElderlyPop = oaList.reduce((s, o) => s + o.elderlyPop, 0);

  const adjustedBusPoints = keptStops.map((f) => f.geometry.coordinates);
  const combinedPoints = [...adjustedBusPoints, ...tramPoints];

  const scenarioA = JSON.parse(fs.readFileSync(SCENARIO_A_PATH, "utf-8"));

  const result = { generatedAt: new Date().toISOString(), rule: { OVERLAP_THRESHOLD_PERCENT, TRAM_PROXIMITY_M }, removedStopCount: removedStops.length, byRadius: {} };

  for (const radius of RADII_M) {
    const bScenario = computeCoverage(oaList, combinedPoints, radius);
    const aScenario = scenarioA.byRadius[radius].combined;

    result.byRadius[radius] = { aScenario, bScenario };

    console.log(`\n=== 서비스 범위 ${radius}m: A(기존) vs B(조정 후) ===`);
    console.log(
      `A: 집계구 ${aScenario.coveredOa}개, 인구 ${aScenario.totalPop.toLocaleString()}명(65세이상 ${aScenario.elderlyPop.toLocaleString()}명)`
    );
    console.log(
      `B: 집계구 ${bScenario.coveredOa}개, 인구 ${bScenario.totalPop.toLocaleString()}명(65세이상 ${bScenario.elderlyPop.toLocaleString()}명)`
    );
    console.log(
      `변화: 집계구 ${bScenario.coveredOa - aScenario.coveredOa}개, ` +
        `인구 ${(bScenario.totalPop - aScenario.totalPop).toLocaleString()}명, ` +
        `65세이상 ${(bScenario.elderlyPop - aScenario.elderlyPop).toLocaleString()}명`
    );
  }

  // 접근성 저하 지역: A에선 커버됐는데 B에선 빠지는 집계구
  const degraded500 = oaList.filter((oa) => {
    const inA = nearestDist(buildGrid([...JSON.parse(fs.readFileSync(BUS_STOPS_PATH, "utf-8")).features.map((f) => f.geometry.coordinates), ...tramPoints], 0.005), oa.lng, oa.lat) <= 500;
    const inB = nearestDist(buildGrid(combinedPoints, 0.005), oa.lng, oa.lat) <= 500;
    return inA && !inB;
  });
  console.log(`\n500m 기준 접근성 저하 지역(A엔 있었는데 B에선 빠짐): ${degraded500.length}개 집계구`);
  const degradedPop = degraded500.reduce((s, o) => s + o.totalPop, 0);
  console.log(`그 지역 인구: ${degradedPop.toLocaleString()}명`);

  result.degraded500m = { oaCount: degraded500.length, totalPop: degradedPop, oaCodes: degraded500.map((o) => o.code) };
  result.removedStops = removedStops.map((f) => ({ stopId: f.properties.stopId, name: f.properties.name }));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));
  console.log(`\n저장: ${OUTPUT_PATH}`);
}

main();
