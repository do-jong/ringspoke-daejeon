/**
 * 트램 2호선은 아직 공사 중이라 실제 운행 선로는 없지만, OSM에 공사 중인
 * 선형이 이미 "대전 도시철도 2호선"(본선)/"...연축지선"/"...진잠지선"
 * railway=construction/construction=tram 태그로 올라와 있음 - 역간 OSRM
 * 도로 스냅(차량 도로망 기준)이 아니라 이 실제 계획 선형을 따라가게 만든다.
 * (이전엔 OSRM으로 역-역을 도로에 스냅했는데, 트램 전용궤도라 도로망과
 * 다르게 가는 구간에서 노선을 벗어나는 문제가 있었음)
 *
 * OSM은 같은 선을 여러 way로 쪼개놨기 때문에(교차로/터널 경계 등), 끝점
 * 좌표로 그래프를 만들고 역-역 사이를 다익스트라로 최단경로 추적
 * (버스전용차로 공식구간 스크립트와 같은 패턴). 끝점이 몇 m씩 어긋나는
 * 곳은 SNAP_TOLERANCE_M로 이어붙임.
 *
 * stationId 순서는 공식 노선 설명 + 위키백과 기점/종점(본선 서대전역↔서대전역
 * 루프, 연축지선 용전역↔연축역, 진잠지선 관저네거리역↔진잠네거리역)과
 * 일치함(좌표로 분기점 확인 완료). 연축지선은 기점이 중리가 아니라
 * 용전역이라 본선 한 정거장(용전~중리)을 같이 타고 중리에서 갈라짐.
 *
 * 역간 소요시간은 공식 표정속도(22.06km/h, 정차시간 포함)로 실제 이어붙인
 * 거리를 나눠서 구한 추정치(하드코딩된 노선 전체 길이에 기대지 않음).
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const MAP_PATH = path.join(ROOT_DIR, "public/data/daejeon_map.geojson");
const STATIONS_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_stations.geojson");
const OUTPUT_PATH = path.join(ROOT_DIR, "public/data/tram/daejeon_tram_line_shape.json");

const AVG_SPEED_KMH = 22.06; // 표정속도(정차시간 포함), 대전시 발표
const SNAP_TOLERANCE_M = 20; // 같은 선인데 OSM way 끝점이 어긋나서 끊긴 곳 이어붙임

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pathLengthMeters(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1] = points[i];
    const [lng2, lat2] = points[i + 1];
    total += haversineMeters(lat1, lng1, lat2, lng2);
  }
  return total;
}

const nodeKey = ([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

function isTramTrack(p = {}) {
  return (
    p.railway === "construction" &&
    p["construction:railway"] === "tram" &&
    p.construction !== "platform" &&
    p.service !== "yard"
  );
}

// 같은 이름("대전 도시철도 2호선"/"...연축지선"/"...진잠지선")의 OSM way들을
// 끝점 좌표로 이은 그래프로 만듦(버스전용차로 공식구간 스크립트와 같은 패턴).
// 연축지선처럼 기점이 본선 쪽 역(용전역)인 경우 본선 이름도 같이 넘겨서
// 그 구간도 그래프에 포함시킴.
function buildTramGraph(mapData, lineNames) {
  const names = Array.isArray(lineNames) ? lineNames : [lineNames];
  const feats = mapData.features.filter(
    (f) =>
      names.includes(f.properties?.name) &&
      isTramTrack(f.properties || {}) &&
      (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
  );

  const nodes = new Map();
  const adj = new Map();

  const addEdge = (a, b) => {
    const ka = nodeKey(a);
    const kb = nodeKey(b);
    if (!nodes.has(ka)) nodes.set(ka, a);
    if (!nodes.has(kb)) nodes.set(kb, b);
    const d = haversineMeters(a[1], a[0], b[1], b[0]);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push({ to: kb, dist: d });
    adj.get(kb).push({ to: ka, dist: d });
  };

  for (const f of feats) {
    const lines =
      f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) addEdge(line[i], line[i + 1]);
    }
  }

  const keys = [...nodes.keys()];
  for (let i = 0; i < keys.length; i++) {
    const [lng1, lat1] = nodes.get(keys[i]);
    for (let j = i + 1; j < keys.length; j++) {
      const [lng2, lat2] = nodes.get(keys[j]);
      const d = haversineMeters(lat1, lng1, lat2, lng2);
      if (d > 0 && d < SNAP_TOLERANCE_M) {
        adj.get(keys[i]).push({ to: keys[j], dist: d });
        adj.get(keys[j]).push({ to: keys[i], dist: d });
      }
    }
  }

  return { nodes, adj };
}

function nearestNodeKey(graph, pt) {
  let best = null;
  let bestDist = Infinity;
  for (const [k, nodePt] of graph.nodes) {
    const d = haversineMeters(pt[1], pt[0], nodePt[1], nodePt[0]);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

function dijkstraPath(graph, startKey, endKey) {
  const dist = new Map([[startKey, 0]]);
  const prev = new Map();
  const visited = new Set();

  while (true) {
    let u = null;
    let uDist = Infinity;
    for (const [k, d] of dist) {
      if (!visited.has(k) && d < uDist) {
        uDist = d;
        u = k;
      }
    }
    if (u === null || u === endKey) break;
    visited.add(u);
    for (const edge of graph.adj.get(u) || []) {
      const nd = uDist + edge.dist;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, u);
      }
    }
  }

  if (!dist.has(endKey)) return null;

  const keys = [endKey];
  let cur = endKey;
  while (cur !== startKey) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    keys.unshift(cur);
  }
  return keys.map((k) => graph.nodes.get(k));
}

// snapIds 순서대로 역간 구간을 그래프에서 다익스트라로 찾아 이어붙임.
// totalMin은 하드코딩하지 않고 실제로 이어붙인 거리를 표정속도로 나눠서
// 구함(지선이 위키백과 기점/종점 기준으로 바뀌어도 자동으로 맞게 됨).
function buildBranch(label, stationsById, graph, snapIds) {
  const line = [];
  const stationIndex = {};

  for (let i = 0; i < snapIds.length; i++) {
    const name = stationsById[snapIds[i]].properties.name;
    // 본선처럼 루프를 닫으려고 마지막에 첫 역을 다시 넣은 경우, 같은
    // 이름이 이미 등록돼 있으면(= 시작점) 그 인덱스를 덮어쓰지 않음
    const isLoopClose = name in stationIndex;
    if (!isLoopClose) stationIndex[name] = line.length;

    if (i === 0) {
      line.push(stationsById[snapIds[i]].geometry.coordinates);
      continue;
    }

    const coordA = stationsById[snapIds[i - 1]].geometry.coordinates;
    const coordB = stationsById[snapIds[i]].geometry.coordinates;
    const startKey = nearestNodeKey(graph, coordA);
    const endKey = nearestNodeKey(graph, coordB);
    const legPath = startKey && endKey ? dijkstraPath(graph, startKey, endKey) : null;

    const leg = legPath || [coordA, coordB];
    if (!legPath) {
      console.log(
        `[${label}] ${stationsById[snapIds[i - 1]].properties.name} -> ${name}: ` +
          `OSM 선형에서 경로 못 찾음, 직선으로 대체`
      );
    } else {
      console.log(
        `[${label}] ${stationsById[snapIds[i - 1]].properties.name} -> ${name}: ${pathLengthMeters(leg).toFixed(0)}m`
      );
    }

    line.push(...leg.slice(1));
    if (!isLoopClose) stationIndex[name] = line.length - 1;
  }

  const totalDistM = pathLengthMeters(line);
  const totalMin = Math.round((totalDistM / 1000 / AVG_SPEED_KMH) * 60 * 10) / 10;
  const stationOffsetMin = {};
  const uniqueIds = [...new Set(snapIds)];
  for (const id of uniqueIds) {
    const name = stationsById[id].properties.name;
    const distSoFar = pathLengthMeters(line.slice(0, stationIndex[name] + 1));
    stationOffsetMin[name] = Math.round((distSoFar / 1000 / AVG_SPEED_KMH) * 60 * 10) / 10;
  }

  const stationOrder = snapIds.map((id) => stationsById[id].properties.name);

  console.log(`[${label}] 완료: ${line.length}개 점, 실거리 ${(totalDistM / 1000).toFixed(2)}km`);

  return { line, stationIndex, stationOffsetMin, stationOrder, totalMin };
}

function main() {
  console.log("트램 선형(OSM 공사중 선형 기반) 생성 시작");

  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));
  const stationsData = JSON.parse(fs.readFileSync(STATIONS_PATH, "utf-8"));
  const stationsById = {};
  for (const f of stationsData.features) stationsById[f.properties.stationId] = f;

  const mainlineIds = Array.from({ length: 40 }, (_, i) => 201 + i).concat([201]); // 루프: 서대전역으로 복귀
  // 위키백과 기점/종점 기준: 연축지선 기점은 중리가 아니라 용전역(본선
  // 한 정거장을 같이 타고 중리에서 갈라짐), 진잠지선 기점은 관저네거리.
  const yeonchukIds = [212, 213, 241, 242, 243, 244];
  const jinjamIds = [233, 245];

  const mainlineGraph = buildTramGraph(mapData, "대전 도시철도 2호선");
  const yeonchukGraph = buildTramGraph(mapData, [
    "대전 도시철도 2호선",
    "대전 도시철도 2호선 연축지선",
  ]);
  const jinjamGraph = buildTramGraph(mapData, "대전 도시철도 2호선 진잠지선");

  const result = {};
  result.mainline = buildBranch("본선", stationsById, mainlineGraph, mainlineIds);
  // 루프라 마지막 "서대전역"(복귀점)은 stationOrder에서 뺀다(같은 이름이
  // 맨 앞에 이미 있어서 중복됨)
  result.mainline.stationOrder = result.mainline.stationOrder.slice(0, -1);

  result.yeonchuk = buildBranch("연축지선", stationsById, yeonchukGraph, yeonchukIds);
  result.jinjam = buildBranch("진잠지선", stationsById, jinjamGraph, jinjamIds);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));
  console.log(`\n저장: ${OUTPUT_PATH}`);
  console.log(
    `본선 ${result.mainline.totalMin}분, 연축지선 ${result.yeonchuk.totalMin}분, 진잠지선 ${result.jinjam.totalMin}분`
  );
}

main();
