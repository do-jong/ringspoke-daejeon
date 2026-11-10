/**
 * analyze_service_population.cjs / analyze_scenario_b.cjs가 공용으로 쓰는
 * 거리 계산/격자 인덱스/서비스범위-인구 결합 함수.
 */

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

function centroidOfMultiPolygon(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return [sx / n, sy / n];
}

function buildGrid(points, cellDeg) {
  const grid = new Map();
  for (const pt of points) {
    const k = `${Math.floor(pt[0] / cellDeg)},${Math.floor(pt[1] / cellDeg)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(pt);
  }
  return { grid, cellDeg };
}

function nearestDist(index, lng, lat) {
  const cx = Math.floor(lng / index.cellDeg);
  const cy = Math.floor(lat / index.cellDeg);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const pts = index.grid.get(`${cx + dx},${cy + dy}`);
      if (!pts) continue;
      for (const [pLng, pLat] of pts) {
        const d = haversineMeters(lat, lng, pLat, pLng);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

// points: [[lng,lat],...]. 각 점의 원래 인덱스를 들고 있어서 k개 최근접
// 탐색 결과로 points[idx]를 다시 찾아갈 수 있음(nearestDist/buildGrid는
// "거리만" 필요한 경우용이고, 이건 "어느 점인지"도 필요한 경우용).
function buildIndexedGrid(points, cellDeg) {
  const grid = new Map();
  points.forEach(([lng, lat], idx) => {
    const k = `${Math.floor(lng / cellDeg)},${Math.floor(lat / cellDeg)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ lng, lat, idx });
  });
  return { grid, cellDeg };
}

// 가까운 셀부터 링을 넓혀가며 최소 k개를 모을 때까지 탐색(점이 희박한
// 지역에서도 충분한 후보를 찾기 위함). ring은 10까지만 넓힘(약 5km) -
// 그 이상이면 해당 지점 주변에 정류장이 거의 없다는 뜻.
function nearestK(index, lng, lat, k) {
  const cx = Math.floor(lng / index.cellDeg);
  const cy = Math.floor(lat / index.cellDeg);
  const found = [];
  for (let ring = 1; ring <= 10; ring++) {
    found.length = 0;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const pts = index.grid.get(`${cx + dx},${cy + dy}`);
        if (!pts) continue;
        for (const p of pts) {
          found.push({ idx: p.idx, dist: haversineMeters(lat, lng, p.lat, p.lng) });
        }
      }
    }
    if (found.length >= k) break;
  }
  found.sort((a, b) => a.dist - b.dist);
  return found.slice(0, k);
}

// oaList: [{code, lng, lat, totalPop, elderlyPop}], stopPoints: [[lng,lat],...]
function computeCoverage(oaList, stopPoints, radiusM) {
  const index = buildGrid(stopPoints, 0.005); // 약 500m 셀
  let coveredOa = 0;
  let totalPop = 0;
  let elderlyPop = 0;

  for (const oa of oaList) {
    const d = nearestDist(index, oa.lng, oa.lat);
    if (d <= radiusM) {
      coveredOa++;
      totalPop += oa.totalPop;
      elderlyPop += oa.elderlyPop;
    }
  }

  return { coveredOa, totalPop, elderlyPop };
}

module.exports = {
  haversineMeters,
  centroidOfMultiPolygon,
  buildGrid,
  nearestDist,
  computeCoverage,
  buildIndexedGrid,
  nearestK,
};
