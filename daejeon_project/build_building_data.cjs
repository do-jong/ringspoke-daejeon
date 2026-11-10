const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");

// ========================================
// 설정
// ========================================
//
// 브이월드 "GIS건물통합정보"(대전광역시, AL_D010_30) shapefile을 GeoJSON으로
// 변환. OSM 건물 레이어는 원룸/다가구 같은 작은 주거 건물이 많이 빠져있어서
// (궁동 원룸촌 74개 vs 둔산 아파트지역 114개 - 실제론 원룸촌이 훨씬 밀집
// 돼있는데도 더 적게 그려짐) 공식 건물통합정보로 교체한다.
//
// 이 환경에 GDAL이 없어서 .shp를 직접 바이너리로 파싱(ESRI 포맷 문서
// 기준). .dbf는 안 읽는다 - 필드명이 A0~A28로만 돼있고 그 의미를 알려주는
// 컬럼정의서가 없어서 속성은 못 쓰고 지오메트리만 가져옴(이 레이어는
// 지도 배경용이라 속성이 당장 필요하지 않음).
//
// 좌표계는 .prj 확인 결과 EPSG:5186(판암/트램 데이터와 동일) - build_tram_data.cjs와
// 같은 proj4 정의 재사용.

const ROOT_DIR = __dirname;
const SHP_PATH = path.join(ROOT_DIR, "public", "data", "AL_D010_30_20261009.shp");
const OUTPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "buildings",
  "daejeon_buildings_official.geojson"
);

const EPSG_5186 =
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

function project([x, y]) {
  const [lng, lat] = proj4(EPSG_5186, "EPSG:4326", [x, y]);
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))]; // ~10cm 정밀도로 충분, 파일 용량 절감
}

// 링의 부호있는 면적으로 시계/반시계 방향 판별 (shapefile 폴리곤 규칙:
// 외곽 링은 시계방향, 구멍은 반시계방향 - 좌표 변환 전 원본 좌표계 기준으로 판별)
function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

// 같은 피처 안의 링들을 "외곽 링 + 그 뒤에 딸린 구멍들" 묶음(= 폴리곤들)으로 그룹핑
function ringsToPolygons(rings) {
  const polygons = [];
  for (const ring of rings) {
    const isOuter = signedArea(ring) < 0; // shapefile: 외곽=시계방향=음수 면적
    if (isOuter || polygons.length === 0) {
      polygons.push([ring]);
    } else {
      polygons[polygons.length - 1].push(ring);
    }
  }
  return polygons;
}

function main() {
  console.log("브이월드 건물통합정보(대전) 변환 시작");

  const buf = fs.readFileSync(SHP_PATH);
  const shapeType = buf.readInt32LE(32);
  if (shapeType !== 5) {
    throw new Error(`예상과 다른 shape type: ${shapeType} (폴리곤=5 예상)`);
  }

  const features = [];
  let pos = 100;
  let skipped = 0;

  while (pos < buf.length) {
    const contentLenWords = buf.readInt32BE(pos + 4);
    const contentStart = pos + 8;
    const recShapeType = buf.readInt32LE(contentStart);

    if (recShapeType === 5) {
      const numParts = buf.readInt32LE(contentStart + 36);
      const numPoints = buf.readInt32LE(contentStart + 40);
      const partsStart = contentStart + 44;
      const pointsStart = partsStart + 4 * numParts;

      const partOffsets = [];
      for (let i = 0; i < numParts; i++) partOffsets.push(buf.readInt32LE(partsStart + i * 4));
      partOffsets.push(numPoints);

      const rings = [];
      for (let i = 0; i < numParts; i++) {
        const ring = [];
        for (let j = partOffsets[i]; j < partOffsets[i + 1]; j++) {
          const x = buf.readDoubleLE(pointsStart + j * 16);
          const y = buf.readDoubleLE(pointsStart + j * 16 + 8);
          ring.push([x, y]);
        }
        rings.push(ring);
      }

      const polygons = ringsToPolygons(rings).map((poly) => poly.map((ring) => ring.map(project)));

      features.push({
        type: "Feature",
        geometry:
          polygons.length === 1
            ? { type: "Polygon", coordinates: polygons[0] }
            : { type: "MultiPolygon", coordinates: polygons },
        properties: {},
      });
    } else {
      skipped++;
    }

    pos = contentStart + contentLenWords * 2;
  }

  console.log(`건물 수: ${features.length.toLocaleString()}개 (건너뜀: ${skipped}개)`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ type: "FeatureCollection", name: "daejeon_buildings_official", features })
  );

  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
