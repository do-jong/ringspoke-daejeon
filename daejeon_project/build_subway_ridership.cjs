/**
 * 대전 1호선 22개 역의 2026-01-01~10-31(304일) 시간대별 승하차 인원
 * CSV(사용자 업로드, EUC-KR)를 파싱해서 (역, 요일구분, 시간대)별 평균
 * 승하차 인원으로 압축한다.
 *
 * build_route_stop_ridership.cjs와 같은 이유로 304일치 원본을 그대로
 * 커밋하지 않고, 날짜 축을 평일/토/일 3단계 평균으로 접은 압축본만 둔다
 * (원본은 요일당 샘플이 충분해서 사실 7일 전부 나눠도 되지만, 이 프로젝트
 * 전체가 이미 평일/토/일 3단계 - bus_route_list.json의 intervalMin/
 * Sat/Sun과 동일 - 로 통일돼 있어서 그 관례를 그대로 따른다).
 *
 * 입력 CSV 컬럼: 날짜,역번호,역명,구분(승차/하차),03-04시,04-05시,...,02-03시
 * 역번호는 "11XX"(1호선 접두어 1 + daejeon_subway_stations.geojson의
 * stationNo "1XX")라서 앞자리 하나를 떼서 stationNo로 맞춘다.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const CSV_PATH =
  process.argv[2] ||
  "/tmp/claude-0/-home-user-daejeon-project/754fb04c-8122-53e4-a358-9f54dfd38aa0/scratchpad/subway_ridership/converted.csv";
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/subway/subway_station_ridership.json");

// build_route_stop_ridership.cjs와 동일(평일/토/일 3단계)
function dayTypeOf(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (day === 6) return "토";
  if (day === 0) return "일";
  return "평일";
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  const hourCols = header.slice(4).map((h) => `${h.split("-")[0].padStart(2, "0")}:00`);
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    const [date, stationCode, stationName, kind, ...values] = cells;
    return {
      date,
      stationNo: stationCode.slice(1), // "11XX" -> "1XX"
      stationName,
      kind, // 승차/하차
      values: values.map(Number),
    };
  });
  return { hourCols, rows };
}

function main() {
  console.log("지하철역 승하차 인원 파싱 시작");
  if (!fs.existsSync(CSV_PATH)) throw new Error(`입력 CSV가 없습니다: ${CSV_PATH}`);

  const text = fs.readFileSync(CSV_PATH, "utf-8");
  const { hourCols, rows } = parseCsv(text);
  console.log(`행 ${rows.length}개, 시간대 ${hourCols.length}개`);

  const stations = {}; // stationNo -> { name, byDay: { dayType: { hour: {board,alight} } } }

  for (const row of rows) {
    const dayType = dayTypeOf(row.date);
    if (!dayType) continue;

    const station = (stations[row.stationNo] ||= { name: row.stationName, byDay: {} });
    const dayBucket = (station.byDay[dayType] ||= {});

    hourCols.forEach((hour, i) => {
      const v = row.values[i];
      if (!Number.isFinite(v)) return
      const bucket = (dayBucket[hour] ||= { boardSum: 0, boardN: 0, alightSum: 0, alightN: 0 });
      if (row.kind === "승차") {
        bucket.boardSum += v;
        bucket.boardN += 1;
      } else if (row.kind === "하차") {
        bucket.alightSum += v;
        bucket.alightN += 1;
      }
    });
  }

  for (const stationNo of Object.keys(stations)) {
    const byDay = stations[stationNo].byDay;
    for (const dayType of Object.keys(byDay)) {
      for (const hour of Object.keys(byDay[dayType])) {
        const b = byDay[dayType][hour];
        byDay[dayType][hour] = {
          board: b.boardN ? Math.round((b.boardSum / b.boardN) * 10) / 10 : 0,
          alight: b.alightN ? Math.round((b.alightSum / b.alightN) * 10) / 10 : 0,
        };
      }
    }
  }

  console.log(`역 ${Object.keys(stations).length}개 처리 완료`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), stations }, null, 0)
  );
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
