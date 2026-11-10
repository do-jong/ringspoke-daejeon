
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// ========================================
// 설정
// ========================================
//
// public/data/route_info_all/page_*.xml (getRouteInfoAll 전체 페이지
// 원본)을 모아서 노선 목록 JSON을 만든다. 버스 목록 탭에서 쓸 노선번호,
// 정류소 수, 운행거리/시간을 담는다.

const ROOT_DIR = __dirname;

const INPUT_DIR = path.join(ROOT_DIR, "public", "data", "route_info_all");

const OUTPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_route_list.json"
);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "itemList",
});

function main() {
  console.log("노선 기본정보 통합 시작");

  if (!fs.existsSync(INPUT_DIR)) {
    throw new Error(`입력 폴더가 없습니다: ${INPUT_DIR}`);
  }

  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((name) => name.endsWith(".xml"))
    .sort();

  const routes = [];

  for (const filename of files) {
    const xml = fs.readFileSync(path.join(INPUT_DIR, filename), "utf8");
    const parsed = parser.parse(xml);
    const items = parsed.ServiceResult?.msgBody?.itemList || [];

    for (const item of items) {
      routes.push({
        routeId: String(item.ROUTE_CD ?? ""),
        routeNo: String(item.ROUTE_NO ?? "").trim(),
        // routeType: 공식 코드 의미를 확인 못해서 원본 코드값 그대로 둠
        routeType: String(item.ROUTE_TP ?? "").trim(),
        busStopCount: Number(item.BUSSTOP_CNT) || 0,
        runDistKm: Number(item.RUN_DIST_HALF) || null,
        runTimeMin: Number(item.RUN_TM) || null,
        firstBus: String(item.ORIGIN_START ?? "").trim(),
        lastBus: String(item.ORIGIN_END ?? "").trim(),
        intervalMin: Number(item.ALLO_INTERVAL) || null,
        intervalMinSat: Number(item.ALLO_INTERVAL_SAT) || null,
        intervalMinSun: Number(item.ALLO_INTERVAL_SUN) || null,
      });
    }
  }

  routes.sort((a, b) =>
    a.routeNo.localeCompare(b.routeNo, "ko", { numeric: true })
  );

  console.log(`노선 수: ${routes.length.toLocaleString()}개`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), routes },
      null,
      0
    ),
    "utf8"
  );

  console.log(`저장 위치: ${OUTPUT_PATH}`);
}

main();
