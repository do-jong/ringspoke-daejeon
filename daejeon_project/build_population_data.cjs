
const fs = require("fs");
const path = require("path");

// ========================================
// 설정
// ========================================
//
// SGIS 집계구 성연령별인구(남녀 합계, in_age_001~021) + 집계구 경계를
// 합쳐서 집계구별 총인구/65세이상 인구 GeoJSON을 만든다.
//
// shortcut: 일부 값이 "N/A"(소규모 비공개 처리)로 와서 0으로 취급한다.
// 즉 고령인구가 적은 집계구는 실제보다 과소 집계될 수 있다.

const ROOT_DIR = __dirname;

// 사용법: node build_population_data.cjs <성연령별인구 csv> <집계구경계 geojson>
const POPULATION_CSV = process.argv[2];
const BOUNDARY_GEOJSON = process.argv[3];

if (!POPULATION_CSV || !BOUNDARY_GEOJSON) {
  console.error(
    "사용법: node build_population_data.cjs <성연령별인구 csv> <집계구경계 geojson>"
  );
  process.exit(1);
}

const OUTPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "population",
  "daejeon_population_oa.geojson"
);

// 양성 합계(둘 다 성별 아닌 전체) 연령대 코드만 쓴다 - 남/여 코드(031~,
// 061~)까지 더하면 같은 사람이 두 번 들어감
const TOTAL_CODES = Array.from(
  { length: 21 },
  (_, i) => `in_age_${String(i + 1).padStart(3, "0")}`
);

// 65세 이상: in_age_014(65~69) ~ in_age_021(100세 이상)
const ELDERLY_CODES = TOTAL_CODES.slice(13);

function main() {
  console.log("집계구 인구 데이터 생성 시작");

  const csvLines = fs
    .readFileSync(POPULATION_CSV, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  const byOa = new Map(); // oaCode -> { values: Map(code -> number), suppressed: number }

  for (const line of csvLines) {
    const [, oaCode, ageCode, rawValue] = line.split(",");

    if (!TOTAL_CODES.includes(ageCode)) continue; // 남/여 breakdown은 스킵

    if (!byOa.has(oaCode)) {
      byOa.set(oaCode, { values: new Map(), suppressed: 0 });
    }

    const entry = byOa.get(oaCode);

    if (rawValue === "N/A") {
      entry.suppressed++;
      entry.values.set(ageCode, 0);
    } else {
      entry.values.set(ageCode, Number(rawValue) || 0);
    }
  }

  const boundary = JSON.parse(fs.readFileSync(BOUNDARY_GEOJSON, "utf8"));

  let totalPopSum = 0;
  let elderlyPopSum = 0;
  let matched = 0;

  const features = boundary.features.map((feature) => {
    const oaCode = feature.properties.TOT_OA_CD;
    const entry = byOa.get(oaCode);

    if (!entry) {
      return {
        ...feature,
        properties: {
          oaCode,
          totalPop: null,
          elderlyPop: null,
          elderlyRatio: null,
          suppressedBins: null,
        },
      };
    }

    matched++;

    const totalPop = TOTAL_CODES.reduce(
      (sum, code) => sum + (entry.values.get(code) || 0),
      0
    );

    const elderlyPop = ELDERLY_CODES.reduce(
      (sum, code) => sum + (entry.values.get(code) || 0),
      0
    );

    totalPopSum += totalPop;
    elderlyPopSum += elderlyPop;

    return {
      ...feature,
      properties: {
        oaCode,
        totalPop,
        elderlyPop,
        elderlyRatio:
          totalPop > 0
            ? Number(((elderlyPop / totalPop) * 100).toFixed(1))
            : null,
        suppressedBins: entry.suppressed,
      },
    };
  });

  console.log(`경계 피처: ${boundary.features.length.toLocaleString()}개`);
  console.log(`인구 데이터 매칭: ${matched.toLocaleString()}개`);
  console.log(`대전 총인구 합계: ${totalPopSum.toLocaleString()}명`);
  console.log(`대전 65세 이상 합계: ${elderlyPopSum.toLocaleString()}명`);
  console.log(
    `고령인구 비율: ${((elderlyPopSum / totalPopSum) * 100).toFixed(1)}%`
  );
  console.log(
    "(실제 대전 인구 통계와 대략 비슷한지 눈으로 확인할 것 - N/A를 0으로 처리해서 약간 과소집계됐을 수 있음)"
  );

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      type: "FeatureCollection",
      name: "daejeon_population_by_oa",
      generatedAt: new Date().toISOString(),
      note: "65세 이상 인구는 SGIS 집계구 성연령별인구 in_age_014~021 합산. N/A(소규모 비공개)는 0으로 처리해 일부 지역 과소집계 가능.",
      features,
    }),
    "utf8"
  );

  console.log(`저장 위치: ${OUTPUT_PATH}`);
}

main();
