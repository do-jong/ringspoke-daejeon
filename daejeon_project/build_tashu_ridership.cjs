/**
 * 대전시 공영자전거 타슈 대여이력(2026년 10월, 개별 대여 96만 건)을 파싱해서
 * (대여소, 요일구분, 시간대)별 평균 대여/반납 건수로 압축한다.
 *
 * 한 달치(평일 22일+토 4일+일 5일 - 10월 1일이 목요일)만 있어서 다른
 * 데이터(버스 14일, 지하철 304일)보다 요일당 샘플이 적지만, 이 프로젝트가
 * 이미 쓰는 평일/토/일 3단계 구분을 그대로 따른다.
 *
 * 원본(302MB)은 build_route_stop_ridership.cjs와 같은 이유로 커밋하지
 * 않고, 날짜 축을 평균으로 접은 압축본 두 개만 둔다:
 *  - tashu_stations.geojson: 대여소 위치(최초 등장 좌표/이름 기준)
 *  - tashu_station_usage.json: 대여소별 시간대 평균 대여/반납 건수
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT_DIR = __dirname;
const CSV_PATH = process.argv[2];
if (!CSV_PATH) throw new Error("사용법: node build_tashu_ridership.cjs <csv경로>");

const OUTPUT_STATIONS = path.join(ROOT_DIR, "public/data/tashu/tashu_stations.geojson");
const OUTPUT_USAGE = path.join(ROOT_DIR, "public/data/tashu/tashu_station_usage.json");

// build_route_stop_ridership.cjs와 동일(평일/토/일 3단계)
function dayTypeOf(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (day === 6) return "토";
  if (day === 0) return "일";
  return "평일";
}

function hourOf(dateStr) {
  const m = dateStr.match(/^\d{4}-\d{2}-\d{2} (\d{2}):/);
  return m ? `${m[1]}:00` : null;
}

// 따옴표로 감싼 필드(쉼표 포함 가능) + 안 감싼 필드가 섞여 있어서 간단한
// 상태머신으로 쪼갠다(이 파일엔 필드 안에 큰따옴표 자체는 안 나옴).
function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

async function main() {
  console.log("타슈 대여이력 파싱 시작");
  if (!fs.existsSync(CSV_PATH)) throw new Error(`입력 CSV가 없습니다: ${CSV_PATH}`);

  const stations = {}; // stationId -> {name, lat, lng, gu, dong}
  const usage = {}; // stationId -> byDay -> dayType -> hour -> {rentals, returns}

  const bumpUsage = (stationId, dayType, hour, field) => {
    if (!stationId || !dayType || !hour) return;
    const station = (usage[stationId] ||= {});
    const dayBucket = (station[dayType] ||= {});
    const hourBucket = (dayBucket[hour] ||= { rentals: 0, returns: 0 });
    hourBucket[field] += 1;
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let header = null;
  let rowCount = 0;
  for await (const rawLine of rl) {
    if (!rawLine) continue;
    const line = rowCount === 0 ? rawLine.replace(/^﻿/, "") : rawLine;
    const cells = parseCsvLine(line);

    if (!header) {
      header = cells;
      rowCount++;
      continue;
    }
    rowCount++;

    const [
      ,
      rentDatetime,
      rentStationId,
      rentStationName,
      rentLat,
      rentLng,
      rentGu,
      rentDong,
      ,
      returnDatetime,
      returnStationId,
      returnStationName,
      returnLat,
      returnLng,
      returnGu,
      returnDong,
    ] = cells;

    if (rentStationId && !stations[rentStationId]) {
      stations[rentStationId] = {
        name: rentStationName,
        lat: Number(rentLat),
        lng: Number(rentLng),
        gu: rentGu,
        dong: rentDong,
      };
    }
    if (returnStationId && !stations[returnStationId]) {
      stations[returnStationId] = {
        name: returnStationName,
        lat: Number(returnLat),
        lng: Number(returnLng),
        gu: returnGu,
        dong: returnDong,
      };
    }

    const rentDayType = dayTypeOf(rentDatetime);
    bumpUsage(rentStationId, rentDayType, hourOf(rentDatetime), "rentals");

    const returnDayType = dayTypeOf(returnDatetime);
    bumpUsage(returnStationId, returnDayType, hourOf(returnDatetime), "returns");

    if (rowCount % 200000 === 0) console.log(`  ${rowCount}행 처리...`);
  }

  console.log(`총 ${rowCount - 1}건, 대여소 ${Object.keys(stations).length}개`);

  // 날짜 수(dayType별 일수)로 평균
  const dayCounts = { 평일: 0, 토: 0, 일: 0 };
  for (let d = 1; d <= 31; d++) {
    const dt = dayTypeOf(`2026-10-${String(d).padStart(2, "0")}`);
    if (dt) dayCounts[dt] = (dayCounts[dt] || 0) + 1;
  }
  console.log("날짜 수:", dayCounts);

  for (const stationId of Object.keys(usage)) {
    const byDay = usage[stationId];
    for (const dayType of Object.keys(byDay)) {
      const n = dayCounts[dayType] || 1;
      for (const hour of Object.keys(byDay[dayType])) {
        const b = byDay[dayType][hour];
        byDay[dayType][hour] = {
          rentals: Math.round((b.rentals / n) * 10) / 10,
          returns: Math.round((b.returns / n) * 10) / 10,
        };
      }
    }
  }

  const stationFeatures = Object.entries(stations)
    .filter(([, s]) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map(([stationId, s]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { stationId, name: s.name, gu: s.gu, dong: s.dong },
    }));

  fs.mkdirSync(path.dirname(OUTPUT_STATIONS), { recursive: true });
  fs.writeFileSync(
    OUTPUT_STATIONS,
    JSON.stringify({ type: "FeatureCollection", name: "tashu_stations", features: stationFeatures })
  );
  fs.writeFileSync(
    OUTPUT_USAGE,
    JSON.stringify({ generatedAt: new Date().toISOString(), dayCounts, stations: usage })
  );

  console.log(`저장: ${OUTPUT_STATIONS}`);
  console.log(`저장: ${OUTPUT_USAGE}`);
}

main();
