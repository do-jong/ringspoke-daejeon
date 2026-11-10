/**
 * 대전교통포털 "도시철도 승하차" xls(HTML 표) 26개(13일 × 승차/하차)를
 * 파싱해서 (역, 요일구분, 시간대)별 평균 승하차 인원을 "노인"과 "합계"
 * 두 카테고리만 뽑아 압축한다. 원본은 일반/청소년/어린이/노인/장애인/
 * 기타/합계 7개 구분이 있지만, 지금 필요한 건 "지금 차내 인원 중 노인
 * 비율"뿐이라 그 둘만 남긴다.
 *
 * 13일(평일 9일+토 2일+일 2일)을 build_route_stop_ridership.cjs와 같은
 * 이유로 평일/토/일 3단계로 나눠 따로 평균낸다.
 *
 * 표 구조: 파일 하나 = 날짜 하나 × 방향 하나(승차 또는 하차, 둘 다
 * rowspan="154"로 테이블 전체에 걸침) + 역(rowspan="7", 7개 구분행) +
 * 00:00/05:00~23:00 20개 칸. <tr>당 <td> 개수로 "파일 첫 행"(24개),
 * "새 역 시작"(22개), "같은 역 다음 구분"(21개)을 구분하는 상태머신으로 읽음.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const RAW_DIR = process.argv[2] || path.join(ROOT_DIR, "raw_subway_ridership_by_age");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/subway/subway_station_ridership_by_age.json");

const WANTED_CATEGORIES = new Set(["노인", "합계"]);

function parseCells(tr) {
  const cells = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(tr))) cells.push(m[1].replace(/<[^>]*>/g, "").trim());
  return cells;
}

// build_route_stop_ridership.cjs와 동일(평일/토/일 3단계)
function dayTypeOf(dateStr) {
  const m = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (day === 6) return "토";
  if (day === 0) return "일";
  return "평일";
}

function parseFile(html) {
  const header = (html.match(/<th[^>]*>([^<]*)<\/th>/g) || []).map((h) => h.replace(/<[^>]*>/g, "").trim());
  const hourCols = header.slice(4); // 일자,승/하차,역명,구분 제외
  const rows = [];
  let date = null;
  let kind = null; // 승차/하차
  let stationNo = null;

  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html))) {
    const tr = m[1];
    const cells = parseCells(tr);
    let category, values;

    if (cells.length === hourCols.length + 4) {
      date = cells[0];
      kind = cells[1];
      const idMatch = tr.match(/id="(\d+)"/);
      stationNo = idMatch ? idMatch[1].slice(1) : null; // "11XX" -> "1XX"
      [, , , category, ...values] = cells;
    } else if (cells.length === hourCols.length + 2) {
      const idMatch = tr.match(/id="(\d+)"/);
      stationNo = idMatch ? idMatch[1].slice(1) : stationNo;
      [, category, ...values] = cells;
    } else if (cells.length === hourCols.length + 1) {
      [category, ...values] = cells;
    } else {
      continue;
    }

    if (!WANTED_CATEGORIES.has(category)) continue;

    rows.push({
      dayType: dayTypeOf(date),
      kind,
      stationNo,
      category,
      values: values.map((v) => Number(String(v).replace(/,/g, "")) || 0),
    });
  }

  return { hourCols, rows };
}

function main() {
  console.log("지하철역 연령별 승하차 인원(노인 비율용) 파싱 시작");
  if (!fs.existsSync(RAW_DIR)) throw new Error(`입력 폴더가 없습니다: ${RAW_DIR}`);

  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".xls"));
  console.log(`파일 ${files.length}개 발견`);

  // stationNo -> byDay -> dayType -> hour -> { board:{elderlySum,elderlyN,totalSum,totalN}, alight:{...} }
  const stations = {};
  let hourCols = null;

  for (const filename of files) {
    const html = fs.readFileSync(path.join(RAW_DIR, filename), "utf-8");
    const parsed = parseFile(html);
    hourCols = parsed.hourCols;

    for (const row of parsed.rows) {
      if (!row.dayType || !row.stationNo) continue;
      const kindKey = row.kind === "승차" ? "board" : row.kind === "하차" ? "alight" : null;
      if (!kindKey) continue;

      const station = (stations[row.stationNo] ||= { byDay: {} });
      const dayBucket = (station.byDay[row.dayType] ||= {});

      hourCols.forEach((hour, i) => {
        const v = row.values[i];
        const bucket = (dayBucket[hour] ||= {
          board: { elderlySum: 0, elderlyN: 0, totalSum: 0, totalN: 0 },
          alight: { elderlySum: 0, elderlyN: 0, totalSum: 0, totalN: 0 },
        });
        const target = bucket[kindKey];
        if (row.category === "노인") {
          target.elderlySum += v;
          target.elderlyN += 1;
        } else if (row.category === "합계") {
          target.totalSum += v;
          target.totalN += 1;
        }
      });
    }
  }

  for (const stationNo of Object.keys(stations)) {
    const byDay = stations[stationNo].byDay;
    for (const dayType of Object.keys(byDay)) {
      for (const hour of Object.keys(byDay[dayType])) {
        const b = byDay[dayType][hour];
        byDay[dayType][hour] = {
          board: {
            elderly: b.board.elderlyN ? Math.round((b.board.elderlySum / b.board.elderlyN) * 10) / 10 : 0,
            total: b.board.totalN ? Math.round((b.board.totalSum / b.board.totalN) * 10) / 10 : 0,
          },
          alight: {
            elderly: b.alight.elderlyN ? Math.round((b.alight.elderlySum / b.alight.elderlyN) * 10) / 10 : 0,
            total: b.alight.totalN ? Math.round((b.alight.totalSum / b.alight.totalN) * 10) / 10 : 0,
          },
        };
      }
    }
  }

  console.log(`역 ${Object.keys(stations).length}개 처리 완료`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), stations })
  );
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
