/**
 * 트램-버스 공간 분석 - 시간 기반 접근성 재분석.
 *
 * analyze_service_population.cjs/analyze_scenario_b.cjs는 "정류장 300m/500m
 * 이내면 커버됨"이라는 직선거리 기준 이진 지표를 썼다. 그런데 직선거리는
 * 실제 도보 경로와 다르고(강/철로/건물을 가로지름), "커버됨/안됨"만 보면
 * 같은 정류장군(허브)을 쓰는 한 A/B 시나리오 차이가 거의 안 드러난다
 * (실제로 두 시나리오 모두 정류장 커버 집계구 수가 똑같이 나왔음).
 *
 * 그래서 집계구 중심점 → 가장 가까운 정류장까지 "실제 도보시간(OSRM foot
 * 라우팅) + 배차 대기시간(배차간격/2, 표준 대중교통 접근성 가정)"을 더한
 * 값을 접근성 지표로 쓴다. 승하차 인원 데이터 없이도 계산 가능(배차표만
 * 있으면 됨 - 트램은 아직 미개통이라 TransitMap.jsx 시뮬레이션에 쓴 계획
 * 배차간격을 그대로 가져옴).
 *
 * 정류장 하나에 여러 노선이 겹치면(허브) "합산 배차"로 대기시간을 더
 * 정확히 반영한다: 두 독립적인 h1,h2분 배차 노선이 같은 정류장에 있으면
 * 평균 대기시간은 더 짧아짐 - effectiveHeadway = 1 / Σ(1/h_i).
 *
 * shortcut: OSRM 공개 데모 서버 1회성 배치 호출(집계구당 1번, table API로
 * 후보 정류장 여러 개를 한 번에 조회). Node 기본 fetch()는 이 샌드박스에서
 * 외부 호스트 DNS를 못 풀어서(HTTPS_PROXY 미지원) curl로 호출함.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { centroidOfMultiPolygon, buildIndexedGrid, nearestK } = require("./lib_geo.cjs");

const ROOT_DIR = __dirname;
const POPULATION_PATH = path.join(ROOT_DIR, "public/data/population/daejeon_population_oa.geojson");
const BUS_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_stops.geojson");
const ROUTE_LIST_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_list.json");
const TRAM_STATIONS_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_stations.geojson");
const SCENARIO_B_PATH = path.join(ROOT_DIR, "public/data/analysis/scenario_b.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/analysis/travel_time_accessibility.json");

const K_CANDIDATES = 6; // 집계구당 직선거리로 뽑는 후보 정류장 수
const DELAY_MS = 150;
// src/components/TransitMap.jsx의 트램 시뮬레이션 배차(TRAM_MAINLINE_OFFPEAK_HEADWAY/
// TRAM_BRANCH_HEADWAY) - 트램이 아직 미개통이라 실제 배차표가 없어서 그 계획값을 그대로 씀.
const TRAM_MAINLINE_HEADWAY = 10.67;
const TRAM_BRANCH_HEADWAY = 10.67;
const OSRM_TABLE_BASE = "https://router.project-osrm.org/table/v1/foot";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combinedHeadway(headways) {
  const valid = headways.filter((h) => h > 0);
  if (valid.length === 0) return null;
  return 1 / valid.reduce((s, h) => s + 1 / h, 0);
}

function fetchTable(sourceLngLat, destLngLats) {
  const coords = [sourceLngLat, ...destLngLats].map(([lng, lat]) => `${lng},${lat}`).join(";");
  const destinations = destLngLats.map((_, i) => i + 1).join(";");
  const url = `${OSRM_TABLE_BASE}/${coords}?sources=0&destinations=${destinations}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = execSync(`curl -sS --max-time 10 "${url}"`, { encoding: "utf-8" });
      const json = JSON.parse(raw);
      if (json.code === "Ok") return json.durations[0]; // seconds, 목적지 순서대로
    } catch (e) {
      // 재시도
    }
  }
  return null;
}

async function main() {
  console.log("시간 기반 접근성(실제 도보시간 + 배차 대기시간) 분석 시작");

  const popData = JSON.parse(fs.readFileSync(POPULATION_PATH, "utf-8"));
  const oaList = popData.features.map((f) => {
    const [lng, lat] = centroidOfMultiPolygon(f.geometry);
    return { code: f.properties.oaCode, lng, lat, totalPop: f.properties.totalPop, elderlyPop: f.properties.elderlyPop };
  });

  const routeHeadway = new Map(
    JSON.parse(fs.readFileSync(ROUTE_LIST_PATH, "utf-8")).routes.map((r) => [r.routeId, r.intervalMin])
  );
  const busStops = JSON.parse(fs.readFileSync(BUS_STOPS_PATH, "utf-8"));
  const tramStations = JSON.parse(fs.readFileSync(TRAM_STATIONS_PATH, "utf-8"));
  const scenarioB = JSON.parse(fs.readFileSync(SCENARIO_B_PATH, "utf-8"));
  const removedStopIds = new Set(scenarioB.removedStops.map((s) => s.stopId));

  // 통합 정류장 목록(A 시나리오 = 전체). B 시나리오는 removedInB로 표시만
  // 해두고 같은 목록/같은 OSRM 호출 결과를 재사용(아래 B_best 계산 참고).
  const stops = [];
  for (const f of busStops.features) {
    const headways = f.properties.routeIds.map((rid) => routeHeadway.get(rid)).filter(Boolean);
    const headwayMin = combinedHeadway(headways);
    if (headwayMin == null) continue;
    stops.push({
      coords: f.geometry.coordinates,
      headwayMin,
      removedInB: removedStopIds.has(f.properties.stopId),
    });
  }
  for (const f of tramStations.features) {
    stops.push({
      coords: f.geometry.coordinates,
      headwayMin: f.properties.lineType === "본선" ? TRAM_MAINLINE_HEADWAY : TRAM_BRANCH_HEADWAY,
      removedInB: false,
    });
  }

  console.log(`집계구 ${oaList.length}개, 정류장(버스+트램) ${stops.length}개, 집계구당 후보 ${K_CANDIDATES}개 조회\n`);

  const stopIndex = buildIndexedGrid(stops.map((s) => s.coords), 0.005);
  const results = [];

  for (let i = 0; i < oaList.length; i++) {
    const oa = oaList[i];
    const candidates = nearestK(stopIndex, oa.lng, oa.lat, K_CANDIDATES);

    let aMin = null;
    let bMin = null;

    if (candidates.length > 0) {
      const durations = fetchTable(
        [oa.lng, oa.lat],
        candidates.map((c) => stops[c.idx].coords)
      );

      if (durations) {
        for (let j = 0; j < candidates.length; j++) {
          const walkSec = durations[j];
          if (walkSec == null) continue;
          const stop = stops[candidates[j].idx];
          const total = walkSec / 60 + stop.headwayMin / 2;
          if (aMin == null || total < aMin) aMin = total;
          if (!stop.removedInB && (bMin == null || total < bMin)) bMin = total;
        }
      }
    }

    results.push({ code: oa.code, totalPop: oa.totalPop, elderlyPop: oa.elderlyPop, aMin, bMin });

    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${oaList.length} 집계구 처리됨...`);
    await sleep(DELAY_MS);
  }

  // ========================================
  // 집계
  // ========================================

  function summarize(field) {
    const reachable = results.filter((r) => r[field] != null);
    const unreachable = results.filter((r) => r[field] == null);
    const totalPop = reachable.reduce((s, r) => s + r.totalPop, 0);
    const weightedMeanMin = totalPop > 0 ? reachable.reduce((s, r) => s + r[field] * r.totalPop, 0) / totalPop : null;
    const thresholds = [10, 15, 20].map((t) => ({
      maxMin: t,
      pop: reachable.filter((r) => r[field] <= t).reduce((s, r) => s + r.totalPop, 0),
      elderlyPop: reachable.filter((r) => r[field] <= t).reduce((s, r) => s + r.elderlyPop, 0),
    }));
    return {
      oaCount: reachable.length,
      weightedMeanMin: weightedMeanMin != null ? Math.round(weightedMeanMin * 10) / 10 : null,
      thresholds,
      unreachableOaCount: unreachable.length,
      unreachablePop: unreachable.reduce((s, r) => s + r.totalPop, 0),
    };
  }

  const aSummary = summarize("aMin");
  const bSummary = summarize("bMin");

  const degraded = results
    .filter((r) => r.aMin != null && r.bMin != null && r.bMin > r.aMin + 0.05)
    .map((r) => ({ code: r.code, totalPop: r.totalPop, deltaMin: Math.round((r.bMin - r.aMin) * 10) / 10 }))
    .sort((a, b) => b.deltaMin - a.deltaMin);
  const degradedPop = degraded.reduce((s, d) => s + d.totalPop, 0);

  console.log("\n=== A(기존) vs B(조정 후) 시간 기반 접근성 ===");
  console.log(`A: 평균 접근시간 ${aSummary.weightedMeanMin}분(인구가중), 10분 이내 인구 ${aSummary.thresholds[0].pop.toLocaleString()}명`);
  console.log(`B: 평균 접근시간 ${bSummary.weightedMeanMin}분(인구가중), 10분 이내 인구 ${bSummary.thresholds[0].pop.toLocaleString()}명`);
  console.log(`접근성 저하 집계구: ${degraded.length}개, 영향 인구 ${degradedPop.toLocaleString()}명`);
  console.log("저하 상위 5개:", degraded.slice(0, 5).map((d) => `${d.code}(+${d.deltaMin}분)`).join(", "));

  const output = {
    generatedAt: new Date().toISOString(),
    method: {
      kCandidates: K_CANDIDATES,
      walkTime: "OSRM foot routing (router.project-osrm.org)",
      waitTime: "combined headway / 2 (합산 배차 Σ(1/h_i)의 역수 ÷ 2)",
    },
    aScenario: aSummary,
    bScenario: bSummary,
    degraded: { oaCount: degraded.length, totalPop: degradedPop, oaList: degraded },
    byOa: results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\n저장: ${OUTPUT_PATH}`);
}

main();
