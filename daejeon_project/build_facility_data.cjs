/**
 * 트램-버스 공간 분석 제안서(3.3 활용 데이터)의 "주요 생활시설" 중
 * 아직 없던 학교/전통시장/행정기관을 OSM(daejeon_map.geojson)에서 뽑는다.
 * 병원·약국·복지시설은 이미 별도 공식 출처로 있어서 안 건드림.
 *
 * OSM은 같은 시설을 Point/LineString/MultiPolygon 여러 지오메트리로 중복
 * 기록해놔서(건물 윤곽 + 점 등), 이름(또는 농수산물도매시장처럼 여러
 * 동 건물이 한 시설인 경우는 operator)으로 묶어서 하나씩만 남긴다.
 *
 * OSM 추출 범위가 대전시 경계보다 넓어서(세종/옥천/계룡 일부 포함 -
 * 버스정류장 비교 때도 같은 문제 확인함) 대전시 집계구(인구데이터, 대전만
 * 커버) 폴리곤 안에 들어오는 것만 남긴다.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const MAP_PATH = path.join(ROOT_DIR, "public/data/daejeon_map.geojson");
const OA_PATH = path.join(ROOT_DIR, "public/data/population/daejeon_population_oa.geojson");
const OUTPUT_DIR = path.join(ROOT_DIR, "public/data/facilities");

function isSchool(p = {}) {
  return ["school", "university", "college", "kindergarten"].includes(p.amenity);
}

function isMarket(p = {}) {
  if (p.amenity !== "marketplace") return false;
  const name = p.name || "";
  return !/의원|병원|약국/.test(name); // 다솜의원처럼 잘못 태깅된 것 제외
}

function isGovOffice(p = {}) {
  return p.amenity === "townhall" || p.office === "government" || Boolean(p.government);
}

function centroidOf(geometry) {
  if (geometry.type === "Point") return geometry.coordinates;

  const rings =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "Polygon"
        ? [geometry.coordinates[0]]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates.map((poly) => poly[0])
          : [];

  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return n > 0 ? [sx / n, sy / n] : null;
}

// 그룹 키(이름 또는 operator)별로 하나만 남김 - Point 지오메트리가 있으면
// 그걸 우선 쓰고, 없으면 폴리곤/라인 중심점을 씀
function dedupe(features, keyFn) {
  const groups = new Map();
  for (const f of features) {
    const key = keyFn(f.properties || {});
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const result = [];
  for (const [key, group] of groups) {
    const pointFeature = group.find((f) => f.geometry.type === "Point");
    const coords = pointFeature ? pointFeature.geometry.coordinates : centroidOf(group[0].geometry);
    if (!coords) continue;
    result.push({ name: key, coords, properties: group[0].properties });
  }
  return result;
}

// ray casting
function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonFeature(pt, geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (pointInRing(pt, poly[0])) return true; // 구멍(내부 링)은 무시 - 집계구엔 없음
  }
  return false;
}

function buildDaejeonContainsCheck(oaData) {
  const entries = oaData.features.map((f) => {
    const coords = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const poly of coords) {
      for (const [lng, lat] of poly[0]) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { geometry: f.geometry, bbox: [minLng, minLat, maxLng, maxLat] };
  });

  return ([lng, lat]) => {
    for (const { geometry, bbox } of entries) {
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      if (pointInPolygonFeature([lng, lat], geometry)) return true;
    }
    return false;
  };
}

function toGeoJSON(entries, extraProps) {
  return {
    type: "FeatureCollection",
    features: entries.map((e) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: e.coords },
      properties: { name: e.name, ...extraProps(e.properties) },
    })),
  };
}

function main() {
  console.log("주요 생활시설(학교/전통시장/행정기관) 추출 시작");

  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));
  const oaData = JSON.parse(fs.readFileSync(OA_PATH, "utf-8"));
  const isInDaejeon = buildDaejeonContainsCheck(oaData);

  const schools = dedupe(mapData.features.filter((f) => isSchool(f.properties || {})), (p) => p.name)
    .filter((e) => isInDaejeon(e.coords));
  const markets = dedupe(
    mapData.features.filter((f) => isMarket(f.properties || {})),
    (p) => p.operator || p.name
  ).filter((e) => isInDaejeon(e.coords));
  const govOffices = dedupe(mapData.features.filter((f) => isGovOffice(f.properties || {})), (p) => p.name)
    .filter((e) => isInDaejeon(e.coords));

  console.log(`학교: ${schools.length}개, 전통시장/도매시장: ${markets.length}개, 행정기관: ${govOffices.length}개`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "daejeon_schools.geojson"),
    JSON.stringify(
      toGeoJSON(schools, (p) => ({
        schoolType: p.amenity === "kindergarten" ? "유치원" : p.amenity === "school" ? "초중고" : "대학",
      }))
    )
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "daejeon_markets.geojson"),
    JSON.stringify(toGeoJSON(markets, (p) => ({ operator: p.operator || null })))
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "daejeon_government_offices.geojson"),
    JSON.stringify(toGeoJSON(govOffices, () => ({})))
  );

  console.log(`저장: ${OUTPUT_DIR}`);
}

main();
