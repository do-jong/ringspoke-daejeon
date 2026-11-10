
const fs = require("fs");
const path = require("path");

// ========================================
// 설정
// ========================================
//
// bus_route_stops.json(노선별 정류장 순서)으로 정류장-정류장 네트워크를
// 만들고 연결/매개/고유벡터 중심성을 계산한다 (박한솔·조완섭 2016 방법론).
//
// shortcut: 노선 종점/기점을 매개중심성에서 빼는 처리는 안 했다 - 종점은
// 구조상 매개중심성이 높게 나오기 쉬우니, 결과 해석할 때 감안할 것.

const ROOT_DIR = __dirname;

const ROUTE_STOPS_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_route_stops.json"
);

const STOPS_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "bus_stops.geojson"
);

const OUTPUT_PATH = path.join(
  ROOT_DIR,
  "public",
  "data",
  "bus",
  "stop_centrality.geojson"
);

// ========================================
// 네트워크 구성
// ========================================

function buildAdjacency(routeStops) {
  const adjacency = new Map();

  const addEdge = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };

  for (const stops of Object.values(routeStops)) {
    const sorted = [...stops].sort((a, b) => a.seq - b.seq);

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].stopId;
      const b = sorted[i + 1].stopId;

      if (a && b && a !== b) addEdge(a, b);
    }
  }

  return adjacency;
}

// ========================================
// 매개 중심성 (Brandes 알고리즘, 비가중 무방향 그래프)
// ========================================

function betweennessCentrality(nodes, adjacency) {
  const centrality = new Map(nodes.map((n) => [n, 0]));

  for (const s of nodes) {
    const stack = [];
    const predecessors = new Map(nodes.map((n) => [n, []]));
    const sigma = new Map(nodes.map((n) => [n, 0]));
    const dist = new Map(nodes.map((n) => [n, -1]));

    sigma.set(s, 1);
    dist.set(s, 0);

    const queue = [s];
    let qi = 0;

    while (qi < queue.length) {
      const v = queue[qi++];
      stack.push(v);

      for (const w of adjacency.get(v) || []) {
        if (dist.get(w) < 0) {
          queue.push(w);
          dist.set(w, dist.get(v) + 1);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          predecessors.get(w).push(v);
        }
      }
    }

    const delta = new Map(nodes.map((n) => [n, 0]));

    while (stack.length) {
      const w = stack.pop();

      for (const v of predecessors.get(w)) {
        delta.set(
          v,
          delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w))
        );
      }

      if (w !== s) centrality.set(w, centrality.get(w) + delta.get(w));
    }
  }

  // 무방향 그래프라 각 경로가 두 번(양방향) 세어짐
  for (const n of nodes) centrality.set(n, centrality.get(n) / 2);

  return centrality;
}

// ========================================
// 고유벡터 중심성 (거듭제곱법)
// ========================================

function eigenvectorCentrality(nodes, adjacency, iterations = 100) {
  let x = new Map(nodes.map((n) => [n, 1]));

  for (let iter = 0; iter < iterations; iter++) {
    const xNew = new Map(nodes.map((n) => [n, 0]));

    for (const n of nodes) {
      let sum = 0;
      for (const neighbor of adjacency.get(n) || []) {
        sum += x.get(neighbor) || 0;
      }
      xNew.set(n, sum);
    }

    const norm =
      Math.sqrt(
        [...xNew.values()].reduce((sum, v) => sum + v * v, 0)
      ) || 1;

    for (const n of nodes) xNew.set(n, xNew.get(n) / norm);

    x = xNew;
  }

  const maxVal = Math.max(...x.values()) || 1;
  for (const n of nodes) x.set(n, x.get(n) / maxVal);

  return x;
}

function printSection(title) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

// ========================================
// 메인
// ========================================

function main() {
  console.log("정류장 네트워크 중심성 분석 시작");

  const routeStops = JSON.parse(fs.readFileSync(ROUTE_STOPS_PATH, "utf8"));
  const stopsGeo = JSON.parse(fs.readFileSync(STOPS_PATH, "utf8"));

  const adjacency = buildAdjacency(routeStops);
  const nodes = [...adjacency.keys()];

  console.log(`정류장(노드): ${nodes.length.toLocaleString()}개`);

  const edgeCount =
    [...adjacency.values()].reduce((sum, s) => sum + s.size, 0) / 2;
  console.log(`연결(엣지): ${edgeCount.toLocaleString()}개`);

  const degree = new Map(nodes.map((n) => [n, adjacency.get(n).size]));

  console.log("매개 중심성 계산 중 (노드 수가 많으면 수 초 소요)...");
  const betweenness = betweennessCentrality(nodes, adjacency);

  console.log("고유벡터 중심성 계산 중...");
  const eigenvector = eigenvectorCentrality(nodes, adjacency);

  const stopInfo = new Map(
    stopsGeo.features.map((f) => [f.properties.stopId, f])
  );

  const features = nodes
    .map((stopId) => {
      const stop = stopInfo.get(stopId);
      if (!stop) return null;

      return {
        type: "Feature",
        geometry: stop.geometry,
        properties: {
          stopId,
          name: stop.properties.name,
          degree: degree.get(stopId),
          betweenness: Number(betweenness.get(stopId).toFixed(2)),
          eigenvector: Number(eigenvector.get(stopId).toFixed(4)),
        },
      };
    })
    .filter(Boolean);

  printSection("연결 중심성 상위 10");
  [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([id, v]) =>
      console.log(`${stopInfo.get(id)?.properties.name || id}: ${v}`)
    );

  printSection("매개 중심성 상위 10");
  [...betweenness.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([id, v]) =>
      console.log(`${stopInfo.get(id)?.properties.name || id}: ${v.toFixed(1)}`)
    );

  printSection("고유벡터 중심성 상위 10");
  [...eigenvector.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([id, v]) =>
      console.log(`${stopInfo.get(id)?.properties.name || id}: ${v.toFixed(2)}`)
    );

  // 매개중심성은 분포가 심하게 치우쳐 있어서(상위 1%가 대부분 차지)
  // 지도 색칠은 백분위수 기준으로 나눈다. 재생성해도 값이 안 굳어있게
  // 분위값을 파일에 같이 저장한다.
  const sortedBetweenness = [...betweenness.values()].sort((a, b) => a - b);
  const percentile = (p) =>
    sortedBetweenness[Math.floor(sortedBetweenness.length * p)];

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      type: "FeatureCollection",
      name: "daejeon_stop_centrality",
      generatedAt: new Date().toISOString(),
      betweennessPercentiles: {
        p50: percentile(0.5),
        p75: percentile(0.75),
        p90: percentile(0.9),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
      features,
    }),
    "utf8"
  );

  printSection("저장 완료");
  console.log(OUTPUT_PATH);
}

main();
