/**
 * 대전교통포털 "노선별 정류장 승하차 인원" xls(실제론 HTML 테이블) 119개를
 * 파싱해서 (노선, 정류장, 요일구분, 시간대)별 평균 승하차 인원으로
 * 압축한다.
 *
 * 원본 파일은 파일당 여러 날짜(10/10~10/23, 2주치 14일)를 전부 풀어서
 * 담고 있어 전체 184MB나 돼서 그대로 커밋하기엔 너무 큼 - 날짜 축을
 * 평균으로 접어서 (노선,정류장,시간) 단위로 압축한 것만 커밋한다.
 *
 * 14일이 평일 10일 + 토 2일 + 일 2일이 섞여있어서, 그냥 다 평균내면
 * 평일/주말 패턴이 뭉개짐(사용자 지적) - 이 프로젝트가 이미 쓰는
 * 평일/토/일 3단계(bus_route_list.json의 intervalMin/Sat/Sun과 동일
 * 구분)로 나눠서 따로 평균낸다.
 *
 * HTML 표 구조(rowspan)가 꽤 복잡해서(일자/노선/시간이 각각 다른
 * 범위로 rowspan) <tr>마다 <td> 개수로 어느 레벨이 새로 시작하는지
 * 판별하는 상태머신으로 파싱함:
 *   8개 td = 날짜+노선+시간대+(순번,정류장,승차,하차,환승) 새 날짜 시작
 *   6개 td = 시간대+(순번,정류장,승차,하차,환승) 새 시간대 시작
 *   5개 td = (순번,정류장,승차,하차,환승) 평소 행
 *   4개 td, 첫 칸이 "합계" = 그 날짜의 일일 합계 행(검증용, 집계엔 안 씀)
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const RAW_DIR = process.argv[2] || path.join(ROOT_DIR, "raw_route_ridership");
const ROUTE_LIST_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_list.json");
const ROUTE_STOPS_PATH = path.join(ROOT_DIR, "public/data/bus/bus_route_stops.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/bus/route_stop_ridership.json");

// 제안서 4.1/5.2 등에서 이미 쓰던 노선유형->접두어 매핑(이 세션에서 확인).
// 급행/마을/첨단만 포털 노선번호 표기에 접두어가 실제로 붙음.
const TYPE_PREFIX = { 1: "급행", 5: "마을", 6: "첨단" };

function parseCells(tr) {
  const cells = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(tr))) {
    cells.push(m[1].replace(/<[^>]*>/g, "").trim());
  }
  return cells;
}

// "2026년 10월 10일" -> 평일/토/일 (프로젝트 전체가 쓰는 3단계 구분,
// bus_route_list.json의 intervalMin/Sat/Sun과 동일)
function dayTypeOf(dateStr) {
  const m = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (day === 6) return "토";
  if (day === 0) return "일";
  return "평일";
}

// HTML 전체에서 <tr>...</tr> 블록을 순서대로 뽑아 상태머신으로
// (date, hour, seq, stopId, stopName, board, alight, transfer) 행 목록 반환.
function parseFile(html) {
  const rows = [];
  let currentDate = null;
  let currentHour = null;
  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = parseCells(m[1]);
    let seq, stopRaw, board, alight, transfer;
    if (cells.length === 8) {
      currentDate = cells[0];
      currentHour = cells[2];
      [, , , seq, stopRaw, board, alight, transfer] = cells;
    } else if (cells.length === 6) {
      currentHour = cells[0];
      [, seq, stopRaw, board, alight, transfer] = cells;
    } else if (cells.length === 5) {
      [seq, stopRaw, board, alight, transfer] = cells;
    } else {
      continue; // 합계 행(4개, 첫 칸 "합계") 등은 스킵
    }
    const stopMatch = stopRaw.match(/^(.*)\((\d*)\)$/);
    if (!stopMatch) continue;
    rows.push({
      dayType: dayTypeOf(currentDate),
      hour: currentHour,
      stopId: stopMatch[2],
      stopName: stopMatch[1],
      board: Number(board.replace(/,/g, "")) || 0,
      alight: Number(alight.replace(/,/g, "")) || 0,
      transfer: Number(transfer.replace(/,/g, "")) || 0,
    });
  }
  return rows;
}

function resolveRouteId(filename, displayMap, routeStops) {
  const base = filename.replace(/\s*노선별 정류장 승하차 인원\.xls$/, "").trim();
  const m = base.match(/^(.+?)번(\(.*\))?$/);
  if (!m) return null;
  const no = m[1].replace(/\s+/g, "");
  const paren = m[2];

  if (paren) {
    // "M1번(A~B)"처럼 방향이 괄호로 명시된 경우 - 포털 전체 노선 목록에서
    // 같은 "번호+괄호" 조합을 쓰는 routeId를 직접 찾는다.
    const fullDisplay = `${no}번${paren.replace(/\s+/g, "")}`;
    for (const [routeId, name] of ROUTE_FULL_NAME) {
      if (name.replace(/\s+/g, "") === fullDisplay) return routeId;
    }
  }

  const candidates = displayMap.get(no) || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;

  // 여러 routeId가 같은 번호를 공유함(예: 302번) - 파일의 정류장 순서가
  // 어느 routeId의 실제 노선과 더 많이 겹치는지로 판별.
  return null; // 아래 main()에서 stopId 집합으로 재시도
}

// 포털 "전체 노선" 드롭다운에서 본 "번호(기점~종점)" 전체 표기 - M1 두
// 방향을 구분하기 위한 최소한의 하드코딩(이 세션에서 직접 확인한 값).
const ROUTE_FULL_NAME = new Map([
  ["30300154", "M1번(누리동기점지~정부청사광장)"],
  ["30300156", "M1번(정부청사광장~누리동기점지)"],
]);

function main() {
  console.log("노선별 정류장 승하차 인원 파싱 시작");

  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`입력 폴더가 없습니다: ${RAW_DIR}`);
  }

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

  const result = {}; // routeId -> { routeNo, stops: { stopId: { name, hourly: {hour: {board,alight,transfer}} } } }
  let resolvedCount = 0;
  const unresolved = [];

  for (const filename of files) {
    const html = fs.readFileSync(path.join(RAW_DIR, filename), "utf-8");

    let routeId = resolveRouteId(filename, displayMap, routeStops);
    const parsedRows = parseFile(html);

    if (!routeId) {
      // 번호만으로 못 정한 경우(302번 등) - 정류장 stopId 겹침으로 판별
      const base = filename.replace(/\s*노선별 정류장 승하차 인원\.xls$/, "").trim();
      const m = base.match(/^(.+?)번/);
      const no = m ? m[1].replace(/\s+/g, "") : null;
      const candidates = displayMap.get(no) || [];
      if (candidates.length > 1) {
        const fileStopIds = new Set(parsedRows.map((r) => r.stopId));
        let best = null;
        let bestOverlap = -1;
        for (const cid of candidates) {
          const seq = routeStops[cid] || [];
          const overlap = seq.filter((s) => fileStopIds.has(s.stopId)).length;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = cid;
          }
        }
        routeId = best;
        console.log(`  번호 "${no}" 중복(${candidates.join(",")}) -> 정류장 겹침으로 ${routeId} 선택(overlap=${bestOverlap})`);
      }
    }

    if (!routeId) {
      unresolved.push(filename);
      continue;
    }
    resolvedCount++;

    const route = routeList.find((r) => r.routeId === routeId);
    if (!result[routeId]) {
      result[routeId] = { routeNo: route ? route.routeNo : null, stops: {} };
    }

    for (const row of parsedRows) {
      if (!row.dayType) continue;
      const stopBucket = (result[routeId].stops[row.stopId] ||= { name: row.stopName, byDay: {} });
      const dayBucket = (stopBucket.byDay[row.dayType] ||= {});
      const hourBucket = (dayBucket[row.hour] ||= { board: 0, alight: 0, transfer: 0, n: 0 });
      hourBucket.board += row.board;
      hourBucket.alight += row.alight;
      hourBucket.transfer += row.transfer;
      hourBucket.n += 1;
    }
  }

  // 각 (노선,정류장,요일구분,시간대) 버킷을 실제 모인 날짜 수(n)로 평균
  for (const routeId of Object.keys(result)) {
    for (const stopId of Object.keys(result[routeId].stops)) {
      const byDay = result[routeId].stops[stopId].byDay;
      for (const dayType of Object.keys(byDay)) {
        for (const hour of Object.keys(byDay[dayType])) {
          const b = byDay[dayType][hour];
          byDay[dayType][hour] = {
            board: Math.round((b.board / b.n) * 10) / 10,
            alight: Math.round((b.alight / b.n) * 10) / 10,
            transfer: Math.round((b.transfer / b.n) * 10) / 10,
          };
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
