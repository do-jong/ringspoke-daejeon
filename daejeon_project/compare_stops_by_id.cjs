
const fs = require("fs");
const path = require("path");

// ========================================
// 설정
// ========================================
//
// OSM highway=bus_stop의 ref 태그와 공식 정류소(bus_stops.geojson)의
// stopId를 직접 비교한다 (이름 매칭보다 신뢰도 높음 - 양방향 정류장이
// 같은 이름을 쓰는 문제가 없음).

const ROOT_DIR = __dirname;

const OSM_MAP_PATH = path.join(ROOT_DIR, "public", "data", "daejeon_map.geojson");
const OFFICIAL_STOPS_PATH = path.join(ROOT_DIR, "public", "data", "bus", "bus_stops.geojson");

const OUT_DIR = path.join(ROOT_DIR, "public", "data", "bus");
const MISSING_FROM_OSM_CSV = path.join(OUT_DIR, "missing_from_osm_by_id.csv");
const MISSING_FROM_OFFICIAL_CSV = path.join(OUT_DIR, "missing_from_official_by_id.csv");

function toCsv(headers, rows) {
  return (
    "﻿" + // 엑셀이 UTF-8로 인식하도록 BOM 추가 (없으면 한글 깨짐)
    headers.join(",") +
    "\n" +
    rows
      .map((row) =>
        row
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n")
  );
}

function main() {
  console.log("ID 기준 정류장 비교 시작");

  const osmData = JSON.parse(fs.readFileSync(OSM_MAP_PATH, "utf8"));
  const officialData = JSON.parse(fs.readFileSync(OFFICIAL_STOPS_PATH, "utf8"));

  const osmStops = osmData.features.filter(
    (f) => f.geometry?.type === "Point" && f.properties?.highway === "bus_stop"
  );

  const officialStopIds = new Set(
    officialData.features.map((f) => f.properties.stopId)
  );

  const osmRefs = new Set(
    osmStops.map((f) => String(f.properties.ref || "")).filter(Boolean)
  );

  console.log(`OSM 버스정류장: ${osmStops.length.toLocaleString()}개`);
  console.log(`공식 정류소: ${officialData.features.length.toLocaleString()}개`);

  // ------------------------------------
  // 공식에는 있는데 OSM(ref)에는 없는 것
  // ------------------------------------

  const missingFromOsm = officialData.features.filter(
    (f) => !osmRefs.has(f.properties.stopId)
  );

  fs.writeFileSync(
    MISSING_FROM_OSM_CSV,
    toCsv(
      ["stopId", "name", "lat", "lng"],
      missingFromOsm.map((f) => [
        f.properties.stopId,
        f.properties.name,
        f.geometry.coordinates[1],
        f.geometry.coordinates[0],
      ])
    ),
    "utf8"
  );

  console.log(
    `\n공식에 있지만 OSM ref로 못 찾은 정류소: ${missingFromOsm.length.toLocaleString()}개`
  );

  // ------------------------------------
  // OSM(ref)에는 있는데 공식에는 없는 것
  // ------------------------------------

  const missingFromOfficial = osmStops.filter((f) => {
    const ref = String(f.properties.ref || "");
    return !ref || !officialStopIds.has(ref);
  });

  fs.writeFileSync(
    MISSING_FROM_OFFICIAL_CSV,
    toCsv(
      ["ref", "hasRef", "name", "lat", "lng"],
      missingFromOfficial.map((f) => [
        f.properties.ref || "",
        Boolean(f.properties.ref),
        f.properties.name || f.properties["name:ko"] || "",
        f.geometry.coordinates[1],
        f.geometry.coordinates[0],
      ])
    ),
    "utf8"
  );

  const noRefCount = missingFromOfficial.filter((f) => !f.properties.ref).length;

  console.log(
    `OSM에 있지만 공식 stopId로 못 찾은 정류장: ${missingFromOfficial.length.toLocaleString()}개 ` +
      `(그 중 ref 태그 자체가 없는 것 ${noRefCount.toLocaleString()}개)`
  );

  console.log("\n저장 위치:");
  console.log(MISSING_FROM_OSM_CSV);
  console.log(MISSING_FROM_OFFICIAL_CSV);
}

main();
