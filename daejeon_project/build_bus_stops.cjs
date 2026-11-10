
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const { haversineMeters } = require("./lib_geo.cjs");

// ========================================
// 설정
// ========================================
//
// public/data/station_by_route_all/page_*.xml (getStaionByRouteAll 전체
// 페이지 원본)을 모아서 정류소 GeoJSON과 노선별 선형 GeoJSON을 만든다.

const ROOT_DIR = __dirname;

const INPUT_DIR = path.join(
  ROOT_DIR,
  "public",
  "data",
  "station_by_route_all"
);

const STOPS_OUTPUT = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_stops.geojson"
);

const ROUTES_OUTPUT = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_route_lines.geojson"
);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "itemList",
});

function printSection(title) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

// ========================================
// 메인
// ========================================

function main() {
  console.log("노선별 경유 정류소 XML 통합 시작");

  if (!fs.existsSync(INPUT_DIR)) {
    throw new Error(`입력 폴더가 없습니다: ${INPUT_DIR}`);
  }

  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((name) => name.endsWith(".xml"))
    .sort();

  const stopsById = new Map();
  const routeStops = new Map(); // routeId -> [{seq, lat, lng}]

  // stopId(짧은 번호)가 대전 시내버스 범위를 벗어나는 광역 구간(세종/계룡 등)
  // 에서 재사용되는 경우가 있음 - 같은 stopId라도 기존 저장된 좌표와
  // COLLISION_THRESHOLD_M 이상 떨어져 있으면 다른 정류장으로 보고 "#2",
  // "#3"... 키로 따로 저장한다(bus_route_stops.json과 대조해서 발견 - 42개
  // stopId가 수십 km 떨어진 서로 다른 정류장을 가리키고 있었음).
  const COLLISION_THRESHOLD_M = 500;
  let collisionSplits = 0;

  let rawItemCount = 0;

  for (const filename of files) {
    const xml = fs.readFileSync(
      path.join(INPUT_DIR, filename),
      "utf8"
    );

    const parsed = parser.parse(xml);
    const items = parsed.ServiceResult?.msgBody?.itemList || [];

    for (const item of items) {
      rawItemCount++;

      const lat = Number(item.GPS_LATI);
      const lng = Number(item.GPS_LONG);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      const stopId = String(item.BUS_STOP_ID ?? "");
      const routeId = String(item.ROUTE_CD ?? "");
      const seq = Number(item.BUSSTOP_SEQ) || 0;

      let key = stopId;
      if (stopId) {
        let suffix = 1;
        while (stopsById.has(key)) {
          const existing = stopsById.get(key);
          if (haversineMeters(lat, lng, existing.lat, existing.lng) <= COLLISION_THRESHOLD_M) break;
          suffix += 1;
          key = `${stopId}#${suffix}`;
        }
      }

      if (key && !stopsById.has(key)) {
        if (key !== stopId) collisionSplits++;
        stopsById.set(key, {
          stopId,
          nodeId: String(item.BUS_NODE_ID ?? ""),
          name: String(item.BUSSTOP_NM ?? "").trim(),
          nameEng: String(item.BUSSTOP_ENG_NM ?? "").trim(),
          roadName: String(item.ROAD_NM ?? "").trim(),
          lat,
          lng,
          routeIds: new Set(),
        });
      }

      if (key) {
        stopsById.get(key).routeIds.add(routeId);
      }

      if (routeId) {
        if (!routeStops.has(routeId)) {
          routeStops.set(routeId, []);
        }
        routeStops.get(routeId).push({ seq, lat, lng });
      }
    }
  }

  printSection("정류소 통합 결과");
  console.log(`원본 행 수: ${rawItemCount.toLocaleString()}개`);
  console.log(`고유 정류소: ${stopsById.size.toLocaleString()}개`);
  console.log(`stopId 재사용으로 분리한 정류소: ${collisionSplits}개`);
  console.log(`노선 수: ${routeStops.size.toLocaleString()}개`);

  const stopFeatures = [...stopsById.values()].map((stop) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
    properties: {
      stopId: stop.stopId,
      nodeId: stop.nodeId,
      name: stop.name,
      nameEng: stop.nameEng,
      roadName: stop.roadName,
      routeCount: stop.routeIds.size,
      routeIds: [...stop.routeIds],
    },
  }));

  fs.mkdirSync(path.dirname(STOPS_OUTPUT), { recursive: true });

  fs.writeFileSync(
    STOPS_OUTPUT,
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "daejeon_bus_stops",
        generatedAt: new Date().toISOString(),
        features: stopFeatures,
      },
      null,
      0
    ),
    "utf8"
  );

  const routeFeatures = [...routeStops.entries()]
    .map(([routeId, stops]) => {
      const sorted = stops
        .slice()
        .sort((a, b) => a.seq - b.seq);

      const coordinates = sorted.map((s) => [s.lng, s.lat]);

      return { routeId, coordinates };
    })
    .filter((route) => route.coordinates.length >= 2)
    .map((route) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.coordinates },
      properties: { routeId: route.routeId },
    }));

  fs.writeFileSync(
    ROUTES_OUTPUT,
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "daejeon_bus_route_lines",
        generatedAt: new Date().toISOString(),
        features: routeFeatures,
      },
      null,
      0
    ),
    "utf8"
  );

  printSection("저장 완료");
  console.log(`정류소: ${STOPS_OUTPUT}`);
  console.log(`노선 선형: ${ROUTES_OUTPUT} (${routeFeatures.length}개 노선)`);
}

try {
  main();
} catch (error) {
  console.error("\n통합 실패:");
  console.error(error);
  process.exitCode = 1;
}
