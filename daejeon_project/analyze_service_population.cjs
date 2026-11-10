/**
 * 트램-버스 공간 분석 제안서 4.3 "정류장 공간적 접근성 및 인구 분석".
 *
 * 버스/트램 정류장 기준 300m·500m 서비스 범위를 만들고, 인구격자(집계구)
 * 중심점이 그 범위 안에 들어오면 그 격자의 인구 전체를 "서비스 범위 내
 * 잠재 영향 인구"로 집계한다(제안서 4.3 "격자 중심점 기준" 방식 채택 -
 * 보행 네트워크 없어서 직선거리 기준, 9.2에서 이미 허용한 방식).
 *
 * 중심점 기준이라 여러 정류장 범위가 겹쳐도 같은 격자가 두 번 집계되지
 * 않음(집계구당 "커버됨/안됨" 한 번만 판정).
 *
 * A 시나리오(기존 버스+트램 유지) 기준값을 만든다 - B/C 시나리오(일부
 * 노선 조정)는 이 함수를 재사용해서 나중에 정류장 목록만 바꿔 비교하면 됨.
 */

const fs = require("fs");
const path = require("path");
const { centroidOfMultiPolygon, buildGrid, nearestDist, computeCoverage } = require("./lib_geo.cjs");

const ROOT_DIR = __dirname;
const POPULATION_PATH = path.join(ROOT_DIR, "public/data/population/daejeon_population_oa.geojson");
const BUS_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_stops.geojson");
const TRAM_STATIONS_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_stations.geojson");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/analysis/service_population.json");

const RADII_M = [300, 500];

function main() {
  console.log("정류장 서비스범위-인구 결합 분석 시작");

  const popData = JSON.parse(fs.readFileSync(POPULATION_PATH, "utf-8"));
  const oaList = popData.features.map((f) => {
    const [lng, lat] = centroidOfMultiPolygon(f.geometry);
    return { code: f.properties.oaCode, lng, lat, totalPop: f.properties.totalPop, elderlyPop: f.properties.elderlyPop };
  });

  const grandTotalPop = oaList.reduce((s, o) => s + o.totalPop, 0);
  const grandElderlyPop = oaList.reduce((s, o) => s + o.elderlyPop, 0);

  const busStops = JSON.parse(fs.readFileSync(BUS_STOPS_PATH, "utf-8"));
  const busPoints = busStops.features.map((f) => f.geometry.coordinates);

  const tramStations = JSON.parse(fs.readFileSync(TRAM_STATIONS_PATH, "utf-8"));
  const tramPoints = tramStations.features.map((f) => f.geometry.coordinates);

  const combinedPoints = [...busPoints, ...tramPoints];

  const result = {
    generatedAt: new Date().toISOString(),
    totalOaCount: oaList.length,
    grandTotalPop,
    grandElderlyPop,
    byRadius: {},
  };

  console.log(`집계구 ${oaList.length}개, 전체 인구 ${grandTotalPop.toLocaleString()}명(65세이상 ${grandElderlyPop.toLocaleString()}명)`);
  console.log(`버스정류소 ${busPoints.length}개, 트램정거장 ${tramPoints.length}개\n`);

  for (const radius of RADII_M) {
    const busOnly = computeCoverage(oaList, busPoints, radius);
    const tramOnly = computeCoverage(oaList, tramPoints, radius);
    const combined = computeCoverage(oaList, combinedPoints, radius);

    result.byRadius[radius] = { busOnly, tramOnly, combined };

    console.log(`=== 서비스 범위 ${radius}m ===`);
    console.log(
      `버스만: 집계구 ${busOnly.coveredOa}/${oaList.length}개(${((busOnly.coveredOa / oaList.length) * 100).toFixed(1)}%), ` +
        `인구 ${busOnly.totalPop.toLocaleString()}명(${((busOnly.totalPop / grandTotalPop) * 100).toFixed(1)}%), ` +
        `65세이상 ${busOnly.elderlyPop.toLocaleString()}명(${((busOnly.elderlyPop / grandElderlyPop) * 100).toFixed(1)}%)`
    );
    console.log(
      `트램만: 집계구 ${tramOnly.coveredOa}/${oaList.length}개(${((tramOnly.coveredOa / oaList.length) * 100).toFixed(1)}%), ` +
        `인구 ${tramOnly.totalPop.toLocaleString()}명(${((tramOnly.totalPop / grandTotalPop) * 100).toFixed(1)}%), ` +
        `65세이상 ${tramOnly.elderlyPop.toLocaleString()}명(${((tramOnly.elderlyPop / grandElderlyPop) * 100).toFixed(1)}%)`
    );
    console.log(
      `버스+트램 합: 집계구 ${combined.coveredOa}/${oaList.length}개(${((combined.coveredOa / oaList.length) * 100).toFixed(1)}%), ` +
        `인구 ${combined.totalPop.toLocaleString()}명(${((combined.totalPop / grandTotalPop) * 100).toFixed(1)}%), ` +
        `65세이상 ${combined.elderlyPop.toLocaleString()}명(${((combined.elderlyPop / grandElderlyPop) * 100).toFixed(1)}%)\n`
    );
  }

  const uncovered500 = oaList.filter((oa) => nearestDist(buildGrid(combinedPoints, 0.005), oa.lng, oa.lat) > 500);
  console.log(`500m 안에 버스도 트램도 없는 집계구: ${uncovered500.length}개`);
  const uncoveredPop = uncovered500.reduce((s, o) => s + o.totalPop, 0);
  const uncoveredElderly = uncovered500.reduce((s, o) => s + o.elderlyPop, 0);
  console.log(`그 지역 인구: ${uncoveredPop.toLocaleString()}명(65세이상 ${uncoveredElderly.toLocaleString()}명)`);

  result.uncovered500m = {
    oaCount: uncovered500.length,
    totalPop: uncoveredPop,
    elderlyPop: uncoveredElderly,
    oaCodes: uncovered500.map((o) => o.code),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));
  console.log(`\n저장: ${OUTPUT_PATH}`);
}

main();
