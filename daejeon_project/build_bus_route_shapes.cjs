
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ========================================
// 설정
// ========================================
//
// bus_route_lines.geojson은 정류소 좌표를 순서대로 직선으로 이은 것이라
// 도로를 안 따라간다. OSRM 공개 데모 서버(router.project-osrm.org)에
// 정류소 순서를 넘겨서 실제 도로를 따르는 경로로 바꾼다.
//
// shortcut: OSRM 공개 데모 서버는 가벼운 테스트용이지 상시 운영용이 아님.
// 지금은 한 번 실행해서 정적 파일로 저장하는 용도라 괜찮지만, 나중에
// 데이터를 자주 갱신해야 하면 자체 OSRM 서버를 띄우는 걸 고려할 것.

const ROOT_DIR = __dirname;

const INPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_route_lines.geojson"
);

const OUTPUT_PATH = INPUT_PATH; // 같은 파일을 도로-스냅 버전으로 교체

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

const CHUNK_SIZE = 90; // OSRM 공개 서버의 실용적 좌표 개수 한도보다 여유있게
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================================
// 좌표 묶음을 겹치게 나누기 (연결부가 끊기지 않도록 1개씩 겹침)
// ========================================

function chunkCoordinates(coords, size) {
  if (coords.length <= size) return [coords];

  const chunks = [];
  let start = 0;

  while (start < coords.length - 1) {
    const end = Math.min(start + size, coords.length);
    chunks.push(coords.slice(start, end));

    if (end === coords.length) break;

    start = end - 1; // 마지막 점을 다음 묶음의 첫 점으로 겹침
  }

  return chunks;
}

// ========================================
// OSRM 호출
// ========================================

async function snapChunk(coords) {
  const coordStr = coords
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");

  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`;

  // shortcut: 이 샌드박스에서 Node 기본 fetch()가 외부 호스트 DNS를 못 풀어서
  // (HTTPS_PROXY 미지원) curl로 대체함 - 다른 환경에서 돌릴 땐 fetch로 되돌려도 됨
  const raw = execSync(`curl -sS --max-time 15 "${url}"`, { encoding: "utf-8", maxBuffer: 1024 * 1024 * 50 });
  const json = JSON.parse(raw);

  if (json.code !== "Ok" || !json.routes?.[0]) {
    throw new Error(`OSRM 오류: ${json.code} / ${json.message || ""}`);
  }

  return json.routes[0].geometry.coordinates;
}

async function snapRoute(coords) {
  const chunks = chunkCoordinates(coords, CHUNK_SIZE);

  let result = [];

  for (let i = 0; i < chunks.length; i++) {
    const snapped = await snapChunk(chunks[i]);

    if (i > 0 && result.length > 0) {
      // 겹치는 연결점 중복 제거
      result = result.concat(snapped.slice(1));
    } else {
      result = result.concat(snapped);
    }

    if (i < chunks.length - 1) await sleep(DELAY_MS);
  }

  return result;
}

// ========================================
// 메인
// ========================================

async function main() {
  console.log("버스 노선 도로-스냅 시작");

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < data.features.length; i++) {
    const feature = data.features[i];
    const routeId = feature.properties?.routeId;
    const originalCoords = feature.geometry.coordinates;

    try {
      const snapped = await snapRoute(originalCoords);
      feature.geometry.coordinates = snapped;
      succeeded++;

      console.log(
        `[${i + 1}/${data.features.length}] ${routeId}: ` +
          `${originalCoords.length}개 정류소 -> ${snapped.length}개 좌표`
      );
    } catch (error) {
      failed++;

      console.error(
        `[${i + 1}/${data.features.length}] ${routeId} 실패 (직선 유지): ${error.message}`
      );
    }

    await sleep(DELAY_MS);
  }

  data.generatedAt = new Date().toISOString();
  data.snappedToRoads = true;

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data), "utf8");

  console.log(`\n완료: 성공 ${succeeded}개, 실패(직선 유지) ${failed}개`);
  console.log(`저장 위치: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("\n도로-스냅 실패:");
  console.error(error);
  process.exitCode = 1;
});
