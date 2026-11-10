
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// ========================================
// 설정
// ========================================

const BASE_URL =
  "https://apis.data.go.kr/6300000/rest/getTrafficInfoAll";

const PAGE_SIZE = 1000;
const DELAY_MS = 200;
const MAX_RETRIES = 3;

const ROOT_DIR = __dirname;
const ENV_PATH = path.join(ROOT_DIR, ".env");

const OUTPUT_DIR = path.join(
  ROOT_DIR,
  "public",
  "data",
  "traffic"
);

const OUTPUT_JSON = path.join(
  OUTPUT_DIR,
  "road_traffic.json"
);

const OUTPUT_REPORT = path.join(
  OUTPUT_DIR,
  "road_traffic_report.json"
);

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

const SERVICE_KEY =
  env.DATA_GO_KR_TRAFFIC_SERVICE_KEY ||
  env.DATA_GO_KR_SERVICE_KEY;

if (!SERVICE_KEY) {
  throw new Error(
    ".env에 인증키를 설정해 주세요."
  );
}

// ========================================
// XML 파서
// ========================================

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "TRAFFIC",
});

// ========================================
// 공통 함수
// ========================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function toStringValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

// ========================================
// API 요청
// ========================================

async function requestPage(pageNo) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
  });

  const url = `${BASE_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `페이지 ${pageNo} 요청 중... (${attempt}/${MAX_RETRIES})`
      );

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/xml, text/xml",
        },
      });

      const xml = await response.text();

      if (!response.ok) {
        throw new Error(
          `HTTP 오류: ${response.status} ${response.statusText}`
        );
      }

      const parsed = parser.parse(xml);

      const root = parsed.response || parsed.Response;

      if (!root) {
        throw new Error(
          "응답 XML에서 response 요소를 찾을 수 없습니다."
        );
      }

      const header = root.header || root.Header;

      if (!header) {
        throw new Error("응답에 header가 없습니다.");
      }

      // 숫자 0으로 파싱되어도 문자열 "00"으로 정규화
      const resultCode = String(
        header.resultCode ?? ""
      ).padStart(2, "0");

      if (resultCode !== "00") {
        throw new Error(
          `API 오류: ${resultCode} / ${
            header.resultMsg || "메시지 없음"
          }`
        );
      }

      const body = root.body || root.Body || {};

      const trafficList =
        body["TRAFFIC-LIST"] ||
        body.TRAFFIC_LIST ||
        {};

      let records = trafficList.TRAFFIC || [];

      if (!Array.isArray(records)) {
        records = [records];
      }

      return {
        records,
        totalCount: toNumber(header.totalCnt) || 0,
        pageNo: toNumber(header.pageNo) || pageNo,
        numOfRows: toNumber(header.numOfRows) || PAGE_SIZE,
      };
    } catch (error) {
      console.error(
        `페이지 ${pageNo} 요청 실패: ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(1000 * attempt);
    }
  }
}

// ========================================
// 데이터 정리
// ========================================

function normalizeTraffic(item) {
  return {
    linkID: toStringValue(item.linkID),

    linkLength: toNumber(item.linkLength),

    roadName: toStringValue(item.roadName),

    speed: toNumber(item.speed),

    travelT: toNumber(item.travelT),

    congestion: toNumber(item.congestion),

    startNodeId: toStringValue(item.startNodeId),

    startNodeName: toStringValue(item.startNodeName),

    endNodeID: toStringValue(item.endNodeID),

    endNodeName: toStringValue(item.endNodeName),

    linkSqc: toNumber(item.linkSqc),

    linkCount: toNumber(item.linkCount),

    udType: toNumber(item.udType),
  };
}

// ========================================
// 데이터 검증
// ========================================

function validateRecords(records) {
  const linkIds = new Set();

  const duplicateLinkIds = [];
  const missingLinkIds = [];
  const missingSpeed = [];
  const missingCongestion = [];
  const invalidSpeed = [];

  for (const record of records) {
    if (!record.linkID) {
      missingLinkIds.push(record);
      continue;
    }

    if (linkIds.has(record.linkID)) {
      duplicateLinkIds.push(record.linkID);
    }

    linkIds.add(record.linkID);

    if (record.speed === null) {
      missingSpeed.push(record.linkID);
    }

    if (record.congestion === null) {
      missingCongestion.push(record.linkID);
    }

    if (record.speed !== null && record.speed < 0) {
      invalidSpeed.push(record.linkID);
    }
  }

  return {
    totalRecords: records.length,
    uniqueLinkIds: linkIds.size,

    duplicateCount: duplicateLinkIds.length,
    duplicateLinkIds,

    missingLinkIdCount: missingLinkIds.length,

    missingSpeedCount: missingSpeed.length,
    missingSpeedLinkIds: missingSpeed,

    missingCongestionCount: missingCongestion.length,
    missingCongestionLinkIds: missingCongestion,

    invalidSpeedCount: invalidSpeed.length,
    invalidSpeedLinkIds: invalidSpeed,
  };
}

// ========================================
// 전체 수집
// ========================================

async function main() {
  console.log("");
  console.log("======================================");
  console.log(" 대전광역시 도로소통정보 수집 시작");
  console.log("======================================");
  console.log("");

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true,
  });

  const allRecords = [];

  let totalCount = 0;
  let totalPages = 0;
  let currentPage = 1;

  while (true) {
    const result = await requestPage(currentPage);

    if (currentPage === 1) {
      totalCount = result.totalCount;

      totalPages = Math.ceil(
        totalCount / PAGE_SIZE
      );

      console.log("");
      console.log(
        `전체 도로 링크: ${totalCount.toLocaleString()}개`
      );

      console.log(
        `예상 페이지: ${totalPages}페이지`
      );

      console.log("");
    }

    const normalized = result.records.map(
      normalizeTraffic
    );

    allRecords.push(...normalized);

    console.log(
      `페이지 ${currentPage}/${totalPages} 완료: ` +
      `${normalized.length}개 수집 / 누적 ${allRecords.length}개`
    );

    if (
      allRecords.length >= totalCount ||
      normalized.length === 0 ||
      currentPage >= totalPages
    ) {
      break;
    }

    currentPage++;

    await sleep(DELAY_MS);
  }

  // ======================================
  // 최종 데이터 저장
  // ======================================

  const report = validateRecords(allRecords);

  const output = {
    metadata: {
      source: "대전광역시 대전교통정보 서비스",
      endpoint: BASE_URL,
      collectedAt: new Date().toISOString(),
      totalCountFromAPI: totalCount,
      collectedCount: allRecords.length,
      pageSize: PAGE_SIZE,
      totalPages: currentPage,
    },

    records: allRecords,
  };

  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    OUTPUT_REPORT,
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        expectedCount: totalCount,
        validation: report,
      },
      null,
      2
    ),
    "utf8"
  );

  // ======================================
  // 결과 출력
  // ======================================

  console.log("");
  console.log("======================================");
  console.log(" 수집 완료");
  console.log("======================================");

  console.log(
    `API 전체 개수: ${totalCount.toLocaleString()}개`
  );

  console.log(
    `실제 수집 개수: ${allRecords.length.toLocaleString()}개`
  );

  console.log(
    `고유 링크 ID: ${report.uniqueLinkIds.toLocaleString()}개`
  );

  console.log(
    `중복 링크 ID: ${report.duplicateCount}개`
  );

  console.log(
    `속도 누락: ${report.missingSpeedCount}개`
  );

  console.log(
    `소통등급 누락: ${report.missingCongestionCount}개`
  );

  console.log("");
  console.log("저장 파일:");
  console.log(OUTPUT_JSON);
  console.log(OUTPUT_REPORT);

  console.log("");
  console.log("첫 번째 도로 데이터:");

  console.log(
    JSON.stringify(
      allRecords[0] || null,
      null,
      2
    )
  );

  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("도로소통정보 수집 실패");
  console.error(error);

  process.exitCode = 1;
});
