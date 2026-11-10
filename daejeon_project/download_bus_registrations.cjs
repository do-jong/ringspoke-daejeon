
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
require("dotenv").config();

const SERVICE_KEY = process.env.DATA_GO_KR_BUSREG_SERVICE_KEY;

const BASE_URL = "https://apis.data.go.kr/6300000/busreginfo";

const OUTPUT_DIR = path.join(
  __dirname,
  "public",
  "data",
  "traffic"
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "bus_registration.json"
);

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getKey(obj, name) {
  if (!obj || typeof obj !== "object") return undefined;

  const key = Object.keys(obj).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );

  return key ? obj[key] : undefined;
}

function collectRecords(node, records = []) {
  if (!node || typeof node !== "object") return records;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectRecords(item, records);
    }
    return records;
  }

  const keys = Object.keys(node).map((key) => key.toLowerCase());

  if (
    keys.includes("car_reg_no") ||
    keys.includes("bus_type") ||
    keys.includes("comp_cd")
  ) {
    records.push(node);
    return records;
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectRecords(value, records);
    }
  }

  return records;
}

function getField(record, name) {
  const value = getKey(record, name);

  return value === undefined || value === null
    ? null
    : String(value).trim();
}

async function requestPage(page) {
  const url = new URL(`${BASE_URL}/getBusRegInfoAll`);

  url.searchParams.set("serviceKey", SERVICE_KEY);
  url.searchParams.set("reqPage", String(page));

  console.log(`요청 URL: ${BASE_URL}/getBusRegInfoAll?reqPage=${page}`);

  const response = await fetch(url);

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${xml}`);
  }

  const parsed = parser.parse(xml);

  const result =
    getKey(parsed, "ServiceResult") || parsed;

  const header = getKey(result, "msgHeader") || {};
  const body = getKey(result, "msgBody") || {};

  const headerCode = String(
    getKey(header, "headerCd") ?? ""
  );

  const headerMessage =
    getKey(header, "headerMsg") || "";

  if (headerCode !== "0") {
    const debugFile = path.join(
      OUTPUT_DIR,
      `bus_registration_error_page_${page}.xml`
    );

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(debugFile, xml, "utf8");

    throw new Error(
      `API 오류 코드: ${headerCode}\n` +
      `메시지: ${headerMessage}\n` +
      `원본 XML: ${debugFile}`
    );
  }

  const itemCount = Number(
    getKey(header, "itemCnt") || 0
  );

  const pageCount = Number(
    getKey(header, "itemPageCnt") || 0
  );

  const itemList =
    getKey(body, "itemList") ||
    getKey(body, "item") ||
    body;

  const records = collectRecords(itemList);

  return {
    records,
    itemCount,
    pageCount,
    raw: xml,
  };
}

async function main() {
  if (!SERVICE_KEY) {
    throw new Error(
      ".env에 DATA_GO_KR_BUSREG_SERVICE_KEY가 없습니다."
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("==================================");
  console.log(" 대전광역시 차량 등록정보 수집");
  console.log("==================================");

  // 중요: 0페이지가 아닌 1페이지부터 시작
  console.log("\n[1/3] 첫 페이지 조회");

  const firstPage = await requestPage(1);

  console.log(`첫 페이지 데이터: ${firstPage.records.length}건`);
  console.log(`전체 데이터: ${firstPage.itemCount}건`);
  console.log(`전체 페이지: ${firstPage.pageCount}페이지`);

  if (firstPage.pageCount <= 0) {
    throw new Error("전체 페이지 수가 올바르지 않습니다.");
  }

  if (firstPage.records.length === 0) {
    const debugFile = path.join(
      OUTPUT_DIR,
      "bus_registration_empty_page_1.xml"
    );

    fs.writeFileSync(debugFile, firstPage.raw, "utf8");

    throw new Error(
      `1페이지 데이터가 없습니다. XML 확인: ${debugFile}`
    );
  }

  const allRecords = [...firstPage.records];

  console.log("\n[2/3] 나머지 페이지 다운로드");

  for (
    let page = 2;
    page <= firstPage.pageCount;
    page++
  ) {
    const result = await requestPage(page);

    if (result.records.length === 0) {
      const debugFile = path.join(
        OUTPUT_DIR,
        `bus_registration_empty_page_${page}.xml`
      );

      fs.writeFileSync(debugFile, result.raw, "utf8");

      throw new Error(
        `${page}페이지 데이터가 없습니다. XML 확인: ${debugFile}`
      );
    }

    allRecords.push(...result.records);

    console.log(
      `페이지 ${page}/${firstPage.pageCount}: ` +
      `${result.records.length}건 ` +
      `(누적 ${allRecords.length}건)`
    );

    await sleep(100);
  }

  console.log("\n[3/3] 데이터 저장");

  const records = allRecords.map((item) => ({
    busType: getField(item, "BUS_TYPE"),
    character: getField(item, "CHARACTER"),
    companyCode: getField(item, "COMP_CD"),
    routeId: getField(item, "ROUTE_CD"),
    vehicleNumber: getField(item, "CAR_REG_NO"),
  }));

  const uniqueVehicleNumbers = new Set(
    records
      .map((item) => item.vehicleNumber)
      .filter(Boolean)
  );

  const output = {
    metadata: {
      source: "대전광역시 차량등록정보 조회",
      downloadedAt: new Date().toISOString(),
      apiTotalCount: firstPage.itemCount,
      totalPages: firstPage.pageCount,
      downloadedCount: records.length,
      uniqueVehicleNumberCount: uniqueVehicleNumbers.size,
    },
    records,
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log("\n==================================");
  console.log(" 다운로드 완료");
  console.log("==================================");
  console.log(`전체 건수: ${records.length}`);
  console.log(`고유 차량번호: ${uniqueVehicleNumbers.size}`);
  console.log(`저장 위치: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("\n다운로드 실패:");
  console.error(error.message);
  process.exitCode = 1;
});
