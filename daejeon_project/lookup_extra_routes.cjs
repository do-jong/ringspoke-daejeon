const fs = require("fs");
const path = require("path");

// ========================================
// 노선 목록(141개)에 없는데 노선 모양/정류소 순서만 있는 노선 32개를
// 대전 BIS 노선정보 API(getRouteInfo)로 하나씩 조회해서 번호/종류/
// 운행시간/배차간격을 확인한다.
//
// - 기존 데이터 파일은 하나도 안 바꾼다. 결과는 새 파일에만 저장:
//   public/data/bus/extra_routes_lookup.json
// - .env의 DATA_GO_KR_SERVICE_KEY 사용(화면에 키를 출력하지 않음)
//
// 사용법: daejeon_project 폴더에서  node lookup_extra_routes.cjs
// ========================================

const ROOT = __dirname;
const BASE_URL = "https://apis.data.go.kr/6300000/busRouteInfo";
const ROUTE_LIST_PATH = path.join(ROOT, "public", "data", "bus", "bus_route_list.json");
const ROUTE_STOPS_PATH = path.join(ROOT, "public", "data", "bus", "bus_route_stops.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "bus", "extra_routes_lookup.json");
const DELAY_MS = 200;

function loadServiceKey() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env 파일을 찾을 수 없습니다.");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    const i = t.indexOf("=");
    if (!t || t.startsWith("#") || i === -1) continue;
    if (t.slice(0, i).trim() === "DATA_GO_KR_SERVICE_KEY") {
      return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(".env에 DATA_GO_KR_SERVICE_KEY가 없습니다.");
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ROUTE_TP 코드 → 앱에서 쓰는 이름 접두어(앱과 같은 규칙)
const TYPE_PREFIX = { 1: "급행", 5: "마을", 6: "첨단" };

async function main() {
  const key = loadServiceKey();
  const listed = new Set(JSON.parse(fs.readFileSync(ROUTE_LIST_PATH, "utf8")).routes.map((r) => r.routeId));
  const stops = JSON.parse(fs.readFileSync(ROUTE_STOPS_PATH, "utf8"));
  const extra = Object.keys(stops).filter((id) => !listed.has(id)).sort();

  console.log(`조회 대상: ${extra.length}개 노선\n`);

  const results = [];
  for (const routeId of extra) {
    const s = stops[routeId] || [];
    const row = {
      routeId,
      firstStop: s[0]?.name ?? null,
      midStop: s[Math.floor(s.length / 2)]?.name ?? null,
      stopCount: s.length,
      found: false,
    };

    try {
      const url = new URL(`${BASE_URL}/getRouteInfo`);
      url.searchParams.set("serviceKey", key);
      url.searchParams.set("busRouteId", routeId);
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const xml = await res.text();

      const routeNo = tag(xml, "ROUTE_NO");
      if (routeNo) {
        const tp = tag(xml, "ROUTE_TP");
        Object.assign(row, {
          found: true,
          routeNo,
          routeType: tp,
          displayName: `${TYPE_PREFIX[tp] || ""}${routeNo}번`,
          firstBus: tag(xml, "ORIGIN_START"),
          lastBus: tag(xml, "ORIGIN_END"),
          intervalMin: Number(tag(xml, "ALLO_INTERVAL")) || null,
          intervalMinSat: Number(tag(xml, "ALLO_INTERVAL_SAT")) || null,
          intervalMinSun: Number(tag(xml, "ALLO_INTERVAL_SUN")) || null,
          runTimeMin: Number(tag(xml, "RUN_TM")) || null,
          busStopCount: Number(tag(xml, "BUSSTOP_CNT")) || null,
        });
      } else {
        row.apiMessage = tag(xml, "headerMsg") || tag(xml, "returnAuthMsg") || xml.slice(0, 120);
      }
    } catch (e) {
      row.error = String(e.message || e);
    }

    results.push(row);
    console.log(
      row.found
        ? `${routeId}  ${row.displayName.padEnd(10)} ${row.firstBus}~${row.lastBus}  배차 ${row.intervalMin ?? "?"}분  (${row.firstStop} → ${row.midStop})`
        : `${routeId}  [조회 안 됨] ${row.apiMessage || row.error || ""}  (${row.firstStop} → ${row.midStop})`
    );
    await sleep(DELAY_MS);
  }

  const found = results.filter((r) => r.found).length;
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, found, routes: results }, null, 1),
    "utf8"
  );
  console.log(`\n조회됨 ${found}개 / 안 됨 ${results.length - found}개`);
  console.log(`저장: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
