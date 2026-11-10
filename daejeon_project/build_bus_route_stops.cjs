
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// ========================================
// 설정
// ========================================
//
// public/data/station_by_route_all/page_*.xml에서 노선별 "정류소를 순서
// 대로 지나가는 목록"만 뽑는다. bus_route_lines.geojson(도로 스냅 완료)은
// 건드리지 않는다 - 그거 다시 만들려면 build_bus_route_shapes.cjs를 또
// 돌려야 해서, 이 스크립트는 완전히 별도 출력만 만든다.

const ROOT_DIR = __dirname;

const INPUT_DIR = path.join(
  ROOT_DIR,
  "public",
  "data",
  "station_by_route_all"
);

const OUTPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_route_stops.json"
);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "itemList",
});

function main() {
  console.log("노선별 정류소 순서 목록 생성 시작");

  if (!fs.existsSync(INPUT_DIR)) {
    throw new Error(`입력 폴더가 없습니다: ${INPUT_DIR}`);
  }

  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((name) => name.endsWith(".xml"))
    .sort();

  const routeStops = new Map(); // routeId -> [{seq, stopId, name, lat, lng}]

  for (const filename of files) {
    const xml = fs.readFileSync(path.join(INPUT_DIR, filename), "utf8");
    const parsed = parser.parse(xml);
    const items = parsed.ServiceResult?.msgBody?.itemList || [];

    for (const item of items) {
      const routeId = String(item.ROUTE_CD ?? "");
      const lat = Number(item.GPS_LATI);
      const lng = Number(item.GPS_LONG);

      if (!routeId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      if (!routeStops.has(routeId)) routeStops.set(routeId, []);

      routeStops.get(routeId).push({
        seq: Number(item.BUSSTOP_SEQ) || 0,
        stopId: String(item.BUS_STOP_ID ?? ""),
        name: String(item.BUSSTOP_NM ?? "").trim(),
        lat,
        lng,
      });
    }
  }

  const result = {};

  for (const [routeId, stops] of routeStops) {
    result[routeId] = stops
      .slice()
      .sort((a, b) => a.seq - b.seq);
  }

  console.log(`노선 수: ${Object.keys(result).length.toLocaleString()}개`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result), "utf8");

  console.log(`저장 위치: ${OUTPUT_PATH}`);
}

main();
