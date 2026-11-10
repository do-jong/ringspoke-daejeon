/**
 * 대전광역시_버스전용차로 현황(data.go.kr 15081423) 공식 구간표를
 * GeoJSON으로 변환.
 *
 * 원본엔 좌표 없이 "서대전4~진잠4" 같은 교차로 이름만 있어서, 교차로를
 * 카카오 로컬 API로 지오코딩한 뒤(.env KAKAO_REST_API_KEY) 같은
 * 도로명을 가진 OSM 구간들로 그래프를 만들어 다익스트라로 두 교차로
 * 사이 최단경로를 뽑는다. 추적한 길이(tracedKm)를 공식 거리(officialKm)와
 * 같이 넣어서 나중에 비교할 수 있게 함.
 *
 * "천변도시고속화도로"(당산교~문평대교)는 OSM에 해당 도로명이 없어서
 * 뺐음 - 직선으로 때우지 않음(트램/지하철 때와 같은 원칙).
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || ".";
const MAP_PATH = path.join(ROOT, "public/data/daejeon_map.geojson");
const OUTPUT_PATH = path.join(ROOT, "public/data/bus/busway_official.geojson");

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

const key = ([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

function buildRoadGraph(mapData, roadName) {
  const feats = mapData.features.filter(
    (f) =>
      f.properties?.name === roadName &&
      (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
  );

  const nodes = new Map();
  const adj = new Map();

  const addEdge = (a, b) => {
    const ka = key(a);
    const kb = key(b);
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

  // 같은 도로인데 OSM way 끝점이 몇 m씩 어긋나서 끊긴 곳을 이어붙임
  // (161m, 969m 같은 큰 간격은 실제로 이름이 안 붙은 구간이라 그대로 둠 -
  // 짧은 간격만 이어서 억지로 먼 길을 잇지 않게 함)
  const SNAP_TOLERANCE_M = 20;
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

  const nodeKeys = [endKey];
  let cur = endKey;
  while (cur !== startKey) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    nodeKeys.unshift(cur);
  }
  return nodeKeys.map((k) => graph.nodes.get(k));
}

// 교차로 지오코딩 결과 (카카오 로컬 API, 2026-11 조회)
const POINTS = {
  서대전네거리: [127.412306, 36.322399],
  진잠네거리: [127.323607, 36.298737],
  대전역네거리: [127.432614, 36.33118],
  유성네거리: [127.341571, 36.353875],
  용문역네거리: [127.393321, 36.338381],
  도마네거리: [127.380041, 36.313094],
  대전IC: [127.451203, 36.363291],
  태평오거리: [127.394821, 36.325821],
  삼성네거리: [127.429573, 36.338084],
  효동네거리: [127.440423, 36.315259],
  중리네거리: [127.432454, 36.359005],
  재뜰네거리: [127.395272, 36.357703],
  충대정문오거리: [127.344632, 36.361876],
  큰마을네거리: [127.376751, 36.348618],
  연구단지네거리: [127.378579, 36.385672],
  읍내네거리: [127.420209, 36.373227],
  용계동: [127.329352, 36.323273],
  만년교: [127.349913, 36.351408],
  가수원네거리: [127.35329, 36.305112],
  "시경계(안산동)": [127.292621, 36.408198],
  외삼네거리: [127.311886, 36.395853],
  오정농수산물도매시장: [127.405864, 36.357477],
  한남오거리: [127.415892, 36.34838],
  문평대교: [127.391293, 36.441638],
  "시경계(둔곡동)": [127.364362, 36.458213],
};

// 원본 표(data.go.kr 15081423) 그대로. 경유지 포함 시 waypoints 3개 이상.
const SEGMENTS = [
  { category: "가로변", roadName: "계백로", waypoints: ["서대전네거리", "진잠네거리"], officialKm: 8.3, section: "서대전4~진잠4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "중앙로", waypoints: ["서대전네거리", "대전역네거리"], officialKm: 2.1, section: "서대전4~대전역4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "계룡로", waypoints: ["서대전네거리", "유성네거리"], officialKm: 9.5, section: "서대전4~유성4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "도산로", waypoints: ["용문역네거리", "도마네거리"], officialKm: 3.3, section: "용문4~도마4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "동서대로", waypoints: ["대전IC", "태평오거리"], officialKm: 4.5, section: "대전IC~태평5", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "대전로", waypoints: ["삼성네거리", "대전역네거리", "효동네거리"], officialKm: 2.7, section: "삼성4~대전역4, 대전역4~효동4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "한밭대로", waypoints: ["중리네거리", "재뜰네거리", "충대정문오거리"], officialKm: 7.7, section: "중리4~재뜰4, 재뜰4~충대정문5", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "대덕대로", waypoints: ["큰마을네거리", "연구단지네거리"], officialKm: 4.2, section: "큰마을4~연구단지4", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  { category: "가로변", roadName: "계족로", waypoints: ["중리네거리", "읍내네거리"], officialKm: 2.4, section: "중리4~읍내3", note: "시간제 07~09시, 18~20시 / 토요일, 공휴일 제외" },
  // 중앙차로(24시간)는 전부 빼고 가로변(시간제)만 씀 - 버스전용도로(OSM) 레이어와
  // 합쳐서 하나의 토글로 보여주기로 해서, 색이 다른 중앙차로 묶음은 제외.
];

function main() {
  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));
  const graphCache = new Map();
  const features = [];
  const skipped = [];

  for (const seg of SEGMENTS) {
    if (!graphCache.has(seg.roadName)) {
      graphCache.set(seg.roadName, buildRoadGraph(mapData, seg.roadName));
    }
    const graph = graphCache.get(seg.roadName);

    let fullPath = null;
    for (let i = 0; i < seg.waypoints.length - 1; i++) {
      const startPt = POINTS[seg.waypoints[i]];
      const endPt = POINTS[seg.waypoints[i + 1]];
      const startKey = nearestNodeKey(graph, startPt);
      const endKey = nearestNodeKey(graph, endPt);
      const hopPath = startKey && endKey ? dijkstraPath(graph, startKey, endKey) : null;

      if (!hopPath) {
        fullPath = null;
        break;
      }
      if (fullPath === null) {
        fullPath = hopPath;
      } else {
        fullPath = fullPath.concat(hopPath.slice(1));
      }
    }

    if (!fullPath) {
      skipped.push(`${seg.roadName}(${seg.section}): 경로 못 찾음(도로명이 OSM에서 끊김)`);
      continue;
    }

    let tracedM = 0;
    for (let i = 0; i < fullPath.length - 1; i++) {
      const [lng1, lat1] = fullPath[i];
      const [lng2, lat2] = fullPath[i + 1];
      tracedM += haversineMeters(lat1, lng1, lat2, lng2);
    }
    const tracedKm = Math.round((tracedM / 1000) * 10) / 10;

    // 공식 거리와 15% 넘게 차이나면 경로가 엉뚱한 곳을 돈 것 - 버림
    if (Math.abs(tracedKm - seg.officialKm) / seg.officialKm > 0.15) {
      skipped.push(
        `${seg.roadName}(${seg.section}): 공식 ${seg.officialKm}km vs 추적 ${tracedKm}km, 경로 신뢰 안 됨`
      );
      continue;
    }

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: fullPath },
      properties: {
        category: seg.category,
        name: seg.roadName,
        section: seg.section,
        officialKm: seg.officialKm,
        tracedKm,
        note: seg.note,
      },
    });
  }

  console.log(`성공: ${features.length}/${SEGMENTS.length}`);
  if (skipped.length) console.log("제외:\n  " + skipped.join("\n  "));

  for (const f of features) {
    const p = f.properties;
    console.log(`${p.name} ${p.section}: 공식 ${p.officialKm}km / 추적 ${p.tracedKm}km`);
  }

  const geojson = {
    type: "FeatureCollection",
    name: "busway_official",
    features,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(`저장: ${OUTPUT_PATH}`);
}

main();
