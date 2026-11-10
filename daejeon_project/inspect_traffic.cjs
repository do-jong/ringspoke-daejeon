
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

const osmPath = path.join(
  ROOT,
  "public",
  "data",
  "daejeon_map.geojson"
);

const OUTPUT_DIR = path.join(
  ROOT,
  "public",
  "data",
  "traffic"
);

const REPORT_PATH = path.join(
  OUTPUT_DIR,
  "osm_traffic_inspection.json"
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

// ========================================
// 공통 함수
// ========================================

function normalizeName(value) {
  if (!value) return "";

  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/[-_]/g, "")
    .toLowerCase();
}

function haversineDistance(a, b) {
  const R = 6371000;

  const toRad = (value) =>
    (value * Math.PI) / 180;

  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const deltaLat = toRad(b[1] - a[1]);
  const deltaLng = toRad(b[0] - a[0]);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function calculateLineLength(coordinates) {
  let total = 0;

  for (let i = 1; i < coordinates.length; i++) {
    total += haversineDistance(
      coordinates[i - 1],
      coordinates[i]
    );
  }

  return total;
}

function getGeometryLength(geometry) {
  if (!geometry) return 0;

  if (geometry.type === "LineString") {
    return calculateLineLength(
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.reduce(
      (sum, line) =>
        sum + calculateLineLength(line),
      0
    );
  }

  return 0;
}

function printSection(title) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

// ========================================
// 메인
// ========================================

function main() {
  console.log("대전 도로 데이터 구조 및 연결 가능성 검사 시작");

  const trafficData = readJson(trafficPath);
  const osmData = readJson(osmPath);

  const trafficRecords =
    trafficData.records || [];

  const osmFeatures =
    osmData.features || [];

  // ======================================
  // 1. OSM 선형 도로만 추출
  // ======================================

  const roadLines = osmFeatures.filter((feature) => {
    const geometry = feature.geometry;
    const properties = feature.properties || {};

    return (
      (geometry?.type === "LineString" ||
        geometry?.type === "MultiLineString") &&
      typeof properties.highway === "string"
    );
  });

  printSection("1. OSM 실제 도로 선형");

  console.log(
    `전체 OSM 객체: ${osmFeatures.length.toLocaleString()}개`
  );

  console.log(
    `실제 도로 선형: ${roadLines.length.toLocaleString()}개`
  );

  console.log(
    `교통정보 링크: ${trafficRecords.length.toLocaleString()}개`
  );

  console.log("\nOSM 도로 샘플:");

  console.log(
    JSON.stringify(
      roadLines.slice(0, 5).map((feature) => ({
        geometryType: feature.geometry.type,
        highway: feature.properties.highway,
        name: feature.properties.name || null,
        nameKo: feature.properties["name:ko"] || null,
        ref: feature.properties.ref || null,
        coordinates:
          feature.geometry.coordinates.slice(0, 3),
      })),
      null,
      2
    )
  );

  // ======================================
  // 2. OSM 도로 유형별 통계
  // ======================================

  const highwayCounts = {};

  for (const feature of roadLines) {
    const highway = feature.properties.highway;

    highwayCounts[highway] =
      (highwayCounts[highway] || 0) + 1;
  }

  printSection("2. OSM 도로 유형별 통계");

  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(highwayCounts)
          .sort((a, b) => b[1] - a[1])
      ),
      null,
      2
    )
  );

  // ======================================
  // 3. 도로명 비교용 인덱스
  // ======================================

  const osmNameMap = new Map();

  for (const feature of roadLines) {
    const properties = feature.properties || {};

    const names = [
      properties.name,
      properties["name:ko"],
      properties.official_name,
      properties.alt_name,
    ];

    const length = getGeometryLength(
      feature.geometry
    );

    for (const name of names) {
      const normalized = normalizeName(name);

      if (!normalized) continue;

      if (!osmNameMap.has(normalized)) {
        osmNameMap.set(normalized, []);
      }

      osmNameMap.get(normalized).push({
        name,
        length,
        highway: properties.highway,
        geometryType: feature.geometry.type,
      });
    }
  }

  // ======================================
  // 4. 교통정보 도로명 비교
  // ======================================

  let exactNameMatches = 0;
  let unmatchedNames = 0;

  const matchedExamples = [];
  const unmatchedExamples = [];

  const trafficNameCounts = {};

  for (const record of trafficRecords) {
    const originalName = record.roadName;

    const normalized = normalizeName(originalName);

    trafficNameCounts[originalName] =
      (trafficNameCounts[originalName] || 0) + 1;

    if (
      !normalized ||
      normalized === "none" ||
      normalized === "-"
    ) {
      unmatchedNames++;

      if (unmatchedExamples.length < 30) {
        unmatchedExamples.push({
          linkID: record.linkID,
          roadName: originalName,
          linkLength: record.linkLength,
        });
      }

      continue;
    }

    const candidates = osmNameMap.get(normalized);

    if (candidates && candidates.length > 0) {
      exactNameMatches++;

      if (matchedExamples.length < 30) {
        matchedExamples.push({
          linkID: record.linkID,
          roadName: originalName,
          linkLength: record.linkLength,
          osmCandidateCount: candidates.length,
          osmCandidates: candidates.slice(0, 3),
        });
      }
    } else {
      unmatchedNames++;

      if (unmatchedExamples.length < 30) {
        unmatchedExamples.push({
          linkID: record.linkID,
          roadName: originalName,
          linkLength: record.linkLength,
        });
      }
    }
  }

  const nameMatchRate =
    trafficRecords.length > 0
      ? (
          (exactNameMatches /
            trafficRecords.length) *
          100
        )
      : 0;

  printSection("3. 도로명 일치 검사");

  console.log(
    `도로명 일치 링크: ${exactNameMatches.toLocaleString()}개`
  );

  console.log(
    `도로명 미일치 링크: ${unmatchedNames.toLocaleString()}개`
  );

  console.log(
    `전체 기준 단순 도로명 일치율: ${nameMatchRate.toFixed(2)}%`
  );

  console.log("\n일치 샘플:");

  console.log(
    JSON.stringify(matchedExamples, null, 2)
  );

  console.log("\n미일치 샘플:");

  console.log(
    JSON.stringify(unmatchedExamples, null, 2)
  );

  // ======================================
  // 5. 교통정보 도로명 상위 통계
  // ======================================

  const popularTrafficNames = Object.entries(
    trafficNameCounts
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({
      roadName: name,
      count,
      osmNameExists: osmNameMap.has(
        normalizeName(name)
      ),
    }));

  printSection("4. 교통정보 도로명 상위 50개");

  console.log(
    JSON.stringify(
      popularTrafficNames,
      null,
      2
    )
  );

  // ======================================
  // 6. 길이 비교 가능성 검사
  // ======================================

  const trafficLengthStats = {
    min: Infinity,
    max: 0,
    average: 0,
    total: 0,
    validCount: 0,
  };

  for (const record of trafficRecords) {
    const length = record.linkLength;

    if (
      typeof length !== "number" ||
      !Number.isFinite(length) ||
      length <= 0
    ) {
      continue;
    }

    trafficLengthStats.min = Math.min(
      trafficLengthStats.min,
      length
    );

    trafficLengthStats.max = Math.max(
      trafficLengthStats.max,
      length
    );

    trafficLengthStats.total += length;
    trafficLengthStats.validCount++;
  }

  trafficLengthStats.average =
    trafficLengthStats.validCount > 0
      ? trafficLengthStats.total /
        trafficLengthStats.validCount
      : 0;

  if (trafficLengthStats.validCount === 0) {
    trafficLengthStats.min = 0;
  }

  printSection("5. API 도로 길이 통계");

  console.log(
    JSON.stringify(
      trafficLengthStats,
      null,
      2
    )
  );

  // ======================================
  // 7. OSM 도로 길이 통계
  // ======================================

  const osmLengthStats = {
    min: Infinity,
    max: 0,
    average: 0,
    total: 0,
    validCount: 0,
  };

  for (const feature of roadLines) {
    const length = getGeometryLength(
      feature.geometry
    );

    if (!Number.isFinite(length) || length <= 0) {
      continue;
    }

    osmLengthStats.min = Math.min(
      osmLengthStats.min,
      length
    );

    osmLengthStats.max = Math.max(
      osmLengthStats.max,
      length
    );

    osmLengthStats.total += length;
    osmLengthStats.validCount++;
  }

  osmLengthStats.average =
    osmLengthStats.validCount > 0
      ? osmLengthStats.total /
        osmLengthStats.validCount
      : 0;

  if (osmLengthStats.validCount === 0) {
    osmLengthStats.min = 0;
  }

  printSection("6. OSM 도로 길이 통계");

  console.log(
    JSON.stringify(
      osmLengthStats,
      null,
      2
    )
  );

  // ======================================
  // 8. 보고서 저장
  // ======================================

  const report = {
    inspectedAt: new Date().toISOString(),

    summary: {
      osmTotalFeatures: osmFeatures.length,
      osmRoadLineFeatures: roadLines.length,
      trafficLinkCount: trafficRecords.length,

      exactNameMatches,
      unmatchedNames,

      nameMatchRate: Number(
        nameMatchRate.toFixed(2)
      ),
    },

    highwayCounts,

    trafficLengthStats,

    osmLengthStats,

    popularTrafficNames,

    matchedExamples,

    unmatchedExamples,

    osmRoadSamples: roadLines
      .slice(0, 30)
      .map((feature) => ({
        geometryType: feature.geometry.type,
        properties: feature.properties,
        calculatedLength: Number(
          getGeometryLength(feature.geometry).toFixed(2)
        ),
      })),
  };

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true,
  });

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  printSection("7. 검사 완료");

  console.log("보고서 저장 위치:");
  console.log(REPORT_PATH);

  console.log("\n이제 OSM과 교통정보의 비교 기초 자료가 준비됐습니다.");
}

try {
  main();
} catch (error) {
  console.error("\n검사 실패:");
  console.error(error);

  process.exitCode = 1;
}
