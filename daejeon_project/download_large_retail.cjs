const fs = require("fs");
const path = require("path");

// ========================================
// 행정안전부_생활_대규모점포 조회서비스(공공데이터포털 API, /info)로
// 대전의 대규모점포(대형마트·백화점·쇼핑센터·복합쇼핑몰)를 받아
// raw 폴더에 원본 그대로 저장한다. (좌표 변환·지도 파일은 다음 단계)
//
// - 기존 데이터 파일은 하나도 안 바꾼다. 결과는 새 파일에만 저장:
//   raw/large_retail/large_retail_daejeon_raw.json
// - .env의 DATA_GO_KR_SERVICE_KEY 사용(화면에 키를 출력하지 않음)
// - 빠지는 곳이 없게 두 가지로 받아서 합친다
//   ① 도로명주소에 '대전광역시'가 들어간 것
//   ② 개방자치단체코드가 대전시·5개 구인 것(도로명주소가 비어 있는 옛 점포까지)
//
// 사용법: daejeon_project 폴더에서  node download_large_retail.cjs
// ========================================

const ROOT = __dirname;
const URL_INFO = "https://apis.data.go.kr/1741000/large_scale_retail_stores/info";
const OUT_DIR = path.join(ROOT, "raw", "large_retail");
const OUT = path.join(OUT_DIR, "large_retail_daejeon_raw.json");
const ROWS = 100; // API 최대값
const DELAY_MS = 400;

// 대전광역시(본청)·동구·중구·서구·유성구·대덕구 개방자치단체코드
const DJ_CODES = { 6300000: "대전광역시", 3000000: "동구", 3010000: "중구", 3020000: "서구", 3030000: "유성구", 3040000: "대덕구" };

function loadKey() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env 파일을 찾을 수 없습니다.");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    const i = t.indexOf("=");
    if (!t || t.startsWith("#") || i === -1) continue;
    if (t.slice(0, i).trim() === "DATA_GO_KR_SERVICE_KEY") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(".env에 DATA_GO_KR_SERVICE_KEY가 없습니다.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 응답 JSON 안에서 "객체들의 배열" 중 가장 긴 것을 데이터 목록으로 본다
function findItems(obj) {
  let best = [];
  const walk = (o) => {
    if (Array.isArray(o)) {
      if (o.length && typeof o[0] === "object" && o.length > best.length) best = o;
      o.forEach(walk);
    } else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(obj);
  return best;
}

function findTotal(obj) {
  let total = null;
  const walk = (o) => {
    if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        if (/^total_?count$/i.test(k)) total = Number(v);
        else walk(v);
      }
  };
  walk(obj);
  return total;
}

async function getPage(key, cond, pageNo) {
  const url = new URL(URL_INFO);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(ROWS));
  url.searchParams.set("returnType", "json");
  for (const [k, v] of Object.entries(cond)) url.searchParams.set(k, v);
  for (let t = 0; t < 4; t++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`JSON 아님(HTTP ${res.status}): ${text.slice(0, 150).replace(/\s+/g, " ")}`);
      }
      return { items: findItems(body), total: findTotal(body) };
    } catch (e) {
      if (t === 3) throw e;
      console.log(`    다시 시도(${e.message})`);
      await sleep(3000 * (t + 1));
    }
  }
}

async function getAll(key, cond, label) {
  const first = await getPage(key, cond, 1);
  const all = [...first.items];
  const pages = first.total ? Math.ceil(first.total / ROWS) : 1;
  for (let p = 2; p <= pages; p++) {
    await sleep(DELAY_MS);
    all.push(...(await getPage(key, cond, p)).items);
  }
  console.log(`${label}: ${all.length}건 (전체 ${first.total ?? "?"}건)`);
  return all;
}

async function main() {
  const key = loadKey();
  const merged = new Map();
  const add = (list) => {
    for (const x of list) {
      const id = x.MNG_NO || x.mngNo || `${x.BPLC_NM}|${x.LCPMT_YMD}|${x.ROAD_NM_ADDR || x.LOTNO_ADDR || ""}`;
      merged.set(id, x);
    }
  };

  add(await getAll(key, { "cond[ROAD_NM_ADDR::LIKE]": "대전광역시" }, "① 도로명주소 '대전광역시'"));
  for (const [code, name] of Object.entries(DJ_CODES)) {
    await sleep(DELAY_MS);
    add(await getAll(key, { "cond[OPN_ATMY_GRP_CD::EQ]": code }, `② 자치단체코드 ${code}(${name})`));
  }

  const items = [...merged.values()];
  if (!items.length) throw new Error("대전 자료가 0건입니다. 위에 찍힌 메시지를 캡처해서 보여주세요.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ downloadedAt: new Date().toISOString(), count: items.length, items }, null, 1), "utf8");

  console.log(`\n항목 이름: ${Object.keys(items[0]).join(", ")}`);
  const byState = {};
  for (const x of items) {
    const s = x.SALS_STTS_NM || x.DTL_SALS_STTS_NM || x.SALS_STTS_CD || "?";
    byState[s] = (byState[s] || 0) + 1;
  }
  console.log("영업상태별:", JSON.stringify(byState));
  console.log(`\n대전 합계 ${items.length}건 저장: ${OUT}`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
