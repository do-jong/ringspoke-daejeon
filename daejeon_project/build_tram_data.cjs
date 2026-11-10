
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const proj4 = require("proj4");

// ========================================
// 설정
// ========================================
//
// 사용자가 직접 만든 daejeon_tram.gpkg(트램 2호선 역/노선, 공식 데이터
// 없어서 직접 구축한 것)을 GeoJSON으로 변환한다. GDAL이 이 환경에 없어서
// GeoPackage(=SQLite)를 Node 내장 sqlite로 직접 읽고, 좌표(EPSG:5186)는
// proj4로 변환한다.

const ROOT_DIR = __dirname;

const GPKG_PATH = path.join(ROOT_DIR, "public", "data", "daejeon_tram.gpkg");

const STATIONS_OUTPUT = path.join(
  ROOT_DIR,
  "public",
  "data",
  "tram",
  "daejeon_tram_stations.geojson"
);

// EPSG:5186 - KGD2002 / Central Belt 2010
const EPSG_5186 =
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

function project([x, y]) {
  const [lng, lat] = proj4(EPSG_5186, "EPSG:4326", [x, y]);
  return [Number(lng.toFixed(7)), Number(lat.toFixed(7))];
}

// ========================================
// GeoPackage 지오메트리 블롭 파서
// ========================================
//
// GPKG 바이너리 헤더(매직 "GP" + 버전 + 플래그 + srs_id (+envelope)) 뒤에
// 표준 WKB가 이어지는 구조. Point/LineString만 지원 - 지금 데이터에 그것만
// 있음.

function parseGpkgGeometry(rawBlob) {
  const buffer = Buffer.from(rawBlob); // node:sqlite gives Uint8Array, not Buffer

  if (buffer[0] !== 0x47 || buffer[1] !== 0x50) {
    throw new Error("GPKG 지오메트리 매직 헤더가 아님");
  }

  const flags = buffer[3];
  const headerLittleEndian = Boolean(flags & 0x01);
  const envelopeIndicator = (flags >> 1) & 0x07;
  const envelopeSizes = [0, 32, 48, 48, 64];
  const envelopeBytes = envelopeSizes[envelopeIndicator] || 0;

  let offset = 8 + envelopeBytes; // magic(2)+version(1)+flags(1)+srs_id(4)

  const wkbLittleEndian = buffer[offset] === 1;
  offset += 1;

  const readUInt32 = () => {
    const v = wkbLittleEndian
      ? buffer.readUInt32LE(offset)
      : buffer.readUInt32BE(offset);
    offset += 4;
    return v;
  };

  const readDouble = () => {
    const v = wkbLittleEndian
      ? buffer.readDoubleLE(offset)
      : buffer.readDoubleBE(offset);
    offset += 8;
    return v;
  };

  const geomType = readUInt32();

  if (geomType === 1) {
    // Point
    const x = readDouble();
    const y = readDouble();
    return { type: "Point", coordinates: project([x, y]) };
  }

  throw new Error(`지원하지 않는 지오메트리 타입: ${geomType}`);
}

// ========================================
// 메인
// ========================================

function main() {
  console.log("트램 데이터 변환 시작");

  const db = new DatabaseSync(GPKG_PATH, { readOnly: true });

  const stations = db.prepare("SELECT * FROM tram_stations").all();

  console.log(`정거장: ${stations.length}개`);

  const stationFeatures = stations.map((row) => ({
    type: "Feature",
    geometry: parseGpkgGeometry(row.geometry),
    properties: {
      stationId: row.stationm_id,
      name: row.station_name,
      lineType: row.line_type,
    },
  }));

  fs.mkdirSync(path.dirname(STATIONS_OUTPUT), { recursive: true });

  fs.writeFileSync(
    STATIONS_OUTPUT,
    JSON.stringify({
      type: "FeatureCollection",
      name: "daejeon_tram_stations",
      features: stationFeatures,
    }),
    "utf8"
  );

  console.log("샘플 정거장:", JSON.stringify(stationFeatures[0], null, 2));
  console.log(`저장: ${STATIONS_OUTPUT}`);
}

main();
