
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// ========================================
// 설정
// ========================================
//
// 데이터명: 대전광역시_정류소별 도착정보 조회 (getArrInfoByStopID)
// 실시간 도착예정 정보라서 "한 번 수집해서 커밋"하는 정적 데이터가 아니다.
// 정류소ID 하나를 인자로 받아 그 시점의 스냅샷만 찍어서 확인용으로 저장한다.
// 실제 서비스에 쓰려면 Vercel 서버리스 프록시에서 그때그때 호출해야 한다.
//
// 사용법: node fetch_bus_arrival.cjs <정류소ID 7자리, 예: 8001378>
//
// 파라미터명은 data.go.kr 요청변수 안내에서 확인: BusStopID (응답의
// BUS_NODE_ID 필드와 같은 값). 응답의 BUS_STOP_ID는 별개의 내부 코드다.

const stopId = process.argv[2];

if (!stopId) {
  console.error("사용법: node fetch_bus_arrival.cjs <정류소ID>");
  process.exitCode = 1;
  return;
}

const BASE_URL = "https://apis.data.go.kr/6300000/arrive/getArrInfoByStopID";

const ROOT_DIR = __dirname;
const ENV_PATH = path.join(ROOT_DIR, ".env");

const OUTPUT_DIR = path.join(ROOT_DIR, "public", "data", "bus");

// ========================================
// .env 읽기
// ========================================

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(".env 파일을 찾을 수 없습니다.");
  }

  const content = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    value = value.replace(/^["']|["']$/g, "");

    env[key] = value;
  }

  return env;
}

const env = loadEnv();
const SERVICE_KEY = env.DATA_GO_KR_SERVICE_KEY;

if (!SERVICE_KEY) {
  throw new Error(".env에 DATA_GO_KR_SERVICE_KEY를 설정해 주세요.");
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "itemList",
});

async function main() {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    BusStopID: stopId,
  });

  const url = `${BASE_URL}?${params.toString()}`;

  console.log(`정류소 ${stopId} 도착정보 요청 중...`);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/xml, text/xml" },
  });

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP 오류: ${response.status} ${response.statusText}`);
  }

  const parsed = parser.parse(xml);

  if (parsed.OpenAPI_ServiceResponse) {
    const header = parsed.OpenAPI_ServiceResponse.cmmMsgHeader || {};
    throw new Error(
      `게이트웨이 오류(${header.returnReasonCode}): ${header.returnAuthMsg}`
    );
  }

  const result = parsed.ServiceResult;

  if (!result) {
    throw new Error("응답에서 ServiceResult를 찾을 수 없습니다.");
  }

  const header = result.msgHeader || {};
  const headerCd = String(header.headerCd ?? "");

  if (headerCd !== "0") {
    throw new Error(
      `API 오류(headerCd=${headerCd}): ${header.headerMsg || "메시지 없음"}`
    );
  }

  const items = result.msgBody?.itemList || [];

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputPath = path.join(
    OUTPUT_DIR,
    `bus_arrival_sample_${stopId}.json`
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        note: "실시간 스냅샷 - 수집 시점의 도착예정 정보일 뿐, 계속 갱신되는 값이 아님",
        stopId,
        fetchedAt: new Date().toISOString(),
        items,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`도착예정 ${items.length}건 저장: ${outputPath}`);
}

main().catch((error) => {
  console.error("\n조회 실패:");
  console.error(error);

  process.exitCode = 1;
});
