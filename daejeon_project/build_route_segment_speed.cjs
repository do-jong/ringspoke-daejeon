/**
 * 대전교통포털 "버스통행속도(정류장별)" xls(HTML 표) 125개를 파싱해서
 * (노선, 정류장구간, 요일구분, 15분 단위 시간대)별 평균 속도(km/h)로
 * 압축한다.
 *
 * build_route_stop_ridership.cjs와 같은 이유로 원본(날짜별로 풀려서
 * 전체 130MB대)은 커밋하지 않고, 날짜 축을 평균으로 접은 압축본만 둔다.
 * 14일(평일 10일+토 2일+일 2일)을 그냥 평균내면 평일/주말 속도 차이가
 * 뭉개져서, build_route_stop_ridership.cjs와 같은 평일/토/일 3단계로
 * 나눠서 따로 평균낸다.
 *
 * 표 구조: 일자/노선(둘 다 노선 전체에 rowspan) + 정류장구간(행마다) +
 * 05:00~23:45 15분 단위 76개 칸 + 평균값. <tr>당 <td> 개수로 날짜가
 * 새로 시작하는 행(80개)과 평소 행(78개)을 구분하는 상태머신으로 읽음.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const RAW_DIR = process.argv[2] || path.join(ROOT_DIR, "raw_route_speed");
const ROUTE_LIST_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_list.json");
const ROUTE_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_stops.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/bus/route_segment_speed.json");

const TYPE_PREFIX = { 1: "급행", 5: "마을", 6: "첨단" };
const TYPE_BY_CATEGORY = { 급행: 1, 간선: 2, 지선: 3, 외곽: 4, 마을: 5, 첨단: 6, 세종: 7, 청주: 8, 계룡: 9 };

const ROUTE_FULL_NAME = new Map([
  ["30300154", "M1(누리동기점지~정부청사광장)"],
  ["30300156", "M1(정부청사광장~누리동기점지)"],
]);

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
  const timeSlots = header.slice(3, -1); // 일자,노선,정류장구간 제외, 평균값 제외
  const rows = [];
  let currentDate = null;
  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = parseCells(m[1]);
    let segment, speeds;
    if (cells.length === timeSlots.length + 4) {
      currentDate = cells[0];
      [, , segment, ...speeds] = cells; // 일자,노선,정류장구간,시간대...,평균
    } else if (cells.length === timeSlots.length + 2) {
      [segment, ...speeds] = cells; // 정류장구간,시간대...,평균
    } else {
      continue;
    }
    speeds = speeds.slice(0, -1); // 마지막 "평균값" 칸 제외
    const segMatch = segment.match(/^(.+?)-(\d*)▶(.+?)-(\d*)$/);
    if (!segMatch) continue;
    rows.push({
      dayType: dayTypeOf(currentDate),
      fromStopId: segMatch[2],
      toStopId: segMatch[4],
      speeds: speeds.map((s) => Number(s) || null),
    });
  }
  return { timeSlots, rows };
}

function resolveRouteId(filename, displayMap, routeList, routeStops) {
  const base = filename.replace(/\s*버스통행속도\(정류장별\)\.xls$/, "").trim();

  // "계룡(302번)" 처럼 지역 접두어가 괄호 밖에 명시된 경우
  const catMatch = base.match(/^(간선|급행|마을|외곽|지선|세종|계룡|청주|첨단)\((.+?)번?\)$/);
  if (catMatch) {
    const wantType = String(TYPE_BY_CATEGORY[catMatch[1]]);
    const no = catMatch[2];
    const r = routeList.find((x) => String(x.routeType) === wantType && x.routeNo === no);
    return r ? r.routeId : null;
  }

  // "M1(방향)" 처럼 방향이 괄호로 명시된 경우
  const m1Match = base.match(/^M1\((.+)\)$/);
  if (m1Match) {
    const full = `M1(${m1Match[1]})`.replace(/\s+/g, "");
    for (const [routeId, name] of ROUTE_FULL_NAME) {
      if (name.replace(/\s+/g, "") === full) return routeId;
    }
  }

  const noMatch = base.match(/^(.+?)번$/);
  const no = (noMatch ? noMatch[1] : base).replace(/\s+/g, "");
  const candidates = displayMap.get(no) || [];
  if (candidates.length === 1) return candidates[0];
  return { ambiguous: candidates }; // 호출부에서 정류장 겹침으로 재시도
}

function main() {
  console.log("노선별 정류장 통행속도 파싱 시작");
  if (!fs.existsSync(RAW_DIR)) throw new Error(`입력 폴더가 없습니다: ${RAW_DIR}`);

  const routeList = JSON.parse(fs.readFileSync(ROUTE_LIST_PATH, "utf-8")).routes;
  const routeStops = JSON.parse(fs.readFileSync(ROUTE_STOPS_PATH, "utf-8"));
  const displayMap = new Map();
  for (const r of routeList) {
    const disp = (TYPE_PREFIX[r.routeType] || "") + r.routeNo;
    if (!displayMap.has(disp)) displayMap.set(disp, []);
    displayMap.get(disp).push(r.routeId);
  }

  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".xls"));
  console.log(`파일 ${files.length}개 발견`);

  const result = {}; // routeId -> { routeNo, segments: { "from>to": { timeSlot: speed } } }
  let resolvedCount = 0;
  const unresolved = [];

  for (const filename of files) {
    const html = fs.readFileSync(path.join(RAW_DIR, filename), "utf-8");
    const { timeSlots, rows } = parseFile(html);

    let routeId = resolveRouteId(filename, displayMap, routeList, routeStops);
    if (routeId && routeId.ambiguous) {
      const fileStopIds = new Set(rows.flatMap((r) => [r.fromStopId, r.toStopId]));
      let best = null;
      let bestOverlap = -1;
      for (const cid of routeId.ambiguous) {
        const seq = routeStops[cid] || [];
        const overlap = seq.filter((s) => fileStopIds.has(s.stopId)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = cid;
        }
      }
      routeId = best;
      console.log(`  "${filename}" 번호 중복 -> 정류장 겹침으로 ${routeId} 선택(overlap=${bestOverlap})`);
    }

    if (!routeId) {
      unresolved.push(filename);
      continue;
    }
    resolvedCount++;

    const route = routeList.find((r) => r.routeId === routeId);
    const sums = (result[routeId] ||= { routeNo: route ? route.routeNo : null, segments: {} });

    for (const row of rows) {
      if (!row.dayType) continue;
      const key = `${row.fromStopId}>${row.toStopId}`;
      const dayBucket = ((sums.segments[key] ||= {})[row.dayType] ||= {});
      timeSlots.forEach((slot, i) => {
        const v = row.speeds[i];
        if (v == null) return;
        const acc = (dayBucket[slot] ||= { sum: 0, n: 0 });
        acc.sum += v;
        acc.n += 1;
      });
    }
  }

  for (const routeId of Object.keys(result)) {
    for (const key of Object.keys(result[routeId].segments)) {
      const byDay = result[routeId].segments[key];
      for (const dayType of Object.keys(byDay)) {
        for (const slot of Object.keys(byDay[dayType])) {
          const { sum, n } = byDay[dayType][slot];
          byDay[dayType][slot] = Math.round((sum / n) * 10) / 10;
        }
      }
    }
  }

  console.log(`\n매칭됨: ${resolvedCount}/${files.length}, 실패: ${unresolved.length}`);
  if (unresolved.length) console.log("매칭 실패:", unresolved);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), routes: result }));
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
