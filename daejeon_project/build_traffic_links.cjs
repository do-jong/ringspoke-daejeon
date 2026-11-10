
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

const trafficPath = path.join(
  ROOT,
  "public",
  "data",
  "traffic",
  "road_traffic.json"
);

const nodelinkPath = path.join(
  ROOT,
  "public",
  "data",
  "nodelink",
  "daejeon_link.geojson"
);

const OUTPUT_PATH = path.join(
  ROOT,
  "public",
  "data",
  "traffic",
  "traffic_links.geojson"
);

// ========================================
// 파일 읽기
// ========================================

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function printSection(title) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

// ========================================
// 메인
// ========================================
//
// 표준노드링크(LINK_ID)와 도로소통정보(linkID)를 같은 ID로 직접 조인한다.
// 도로명 일치(42%)보다 신뢰도 높은 정확 ID 매칭이며, 매칭 안 된 링크는
// 버리지 않고 결과에 포함하되 교통정보 없이(geometry만) 남겨 지도에는
// 계속 표시되게 한다.

function main() {
  console.log("표준노드링크 - 도로소통정보 linkID 매칭 시작");

  const trafficData = readJson(trafficPath);
  const nodelinkData = readJson(nodelinkPath);

  const trafficRecords = trafficData.records || [];
  const nodelinkFeatures = nodelinkData.features || [];

  const trafficById = new Map();

  for (const record of trafficRecords) {
    trafficById.set(String(record.linkID), record);
  }

  let matched = 0;

  const outputFeatures = nodelinkFeatures.map((feature) => {
    const linkId = String(feature.properties?.LINK_ID ?? "");
    const traffic = trafficById.get(linkId);

    if (traffic) matched++;

    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        linkId,
        roadName: traffic?.roadName ?? null,
        speed: traffic?.speed ?? null,
        congestion: traffic?.congestion ?? null,
        travelT: traffic?.travelT ?? null,
      },
    };
  });

  const matchRate =
    trafficRecords.length > 0
      ? (matched / trafficRecords.length) * 100
      : 0;

  printSection("매칭 결과");

  console.log(
    `표준노드링크 전체: ${nodelinkFeatures.length.toLocaleString()}개`
  );

  console.log(
    `도로소통정보 전체: ${trafficRecords.length.toLocaleString()}개`
  );

  console.log(
    `linkID 매칭 성공: ${matched.toLocaleString()}개`
  );

  console.log(
    `도로소통정보 기준 매칭율: ${matchRate.toFixed(2)}%`
  );

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      type: "FeatureCollection",
      name: "daejeon_traffic_links",
      generatedAt: new Date().toISOString(),
      matchRate: Number(matchRate.toFixed(2)),
      features: outputFeatures,
    }),
    "utf8"
  );

  printSection("저장 완료");

  console.log(OUTPUT_PATH);
}

try {
  main();
} catch (error) {
  console.error("\n매칭 실패:");
  console.error(error);

  process.exitCode = 1;
}
