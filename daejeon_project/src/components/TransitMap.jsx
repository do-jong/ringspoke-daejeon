
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  LayersControl,
  GeoJSON,
  Marker,
  CircleMarker,
  Popup,
  Tooltip,
  Pane,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ==========================================
// 기본 설정
// ==========================================

const MAP_CENTER = [36.3504, 127.3845]

// 다운로드한 OSM 데이터 범위(127.161,36.161 ~ 127.618,36.534)에서 약 3km만 더 보이게 확장
const MAP_BOUNDS = [
  [36.134, 127.1276],
  [36.561, 127.6514],
]

const MAP_DATA_URL = '/data/daejeon_map.geojson'

const TRAFFIC_LINK_URL =
  '/data/traffic/traffic_links.geojson'

const BUS_STOPS_URL = '/data/bus/bus_stops.geojson'

const BUS_ROUTE_LINES_URL = '/data/bus/bus_route_lines.geojson'

const BUS_ROUTE_LIST_URL = '/data/bus/bus_route_list.json'

const BUS_ROUTE_STOPS_URL = '/data/bus/bus_route_stops.json'

const ROUTE_SEGMENT_SPEED_URL = '/data/bus/route_segment_speed.json'

const ROUTE_STOP_RIDERSHIP_URL = '/data/bus/route_stop_ridership.json'

const SUBWAY_STATION_RIDERSHIP_URL = '/data/subway/subway_station_ridership.json'
// 대전교통공사 공식 열차시각표(2025.08.31)에서 뽑은 열차별 기점 출발 시각(분) - build_subway_timetable_official.py
const SUBWAY_TIMETABLE_OFFICIAL_URL = '/data/subway/subway_timetable_official.json'

const SUBWAY_RIDERSHIP_BY_AGE_URL = '/data/subway/subway_station_ridership_by_age.json'

const POPULATION_URL = '/data/population/daejeon_population_oa.geojson'
// 행정동(82)·구(5)별 고령인구 합계 - 집계구 인구(SGIS 2024, N/A 2.5명 보정)를 행정동 코드 앞 8자리로 합산
const ELDERLY_AREA_URL = '/data/population/daejeon_elderly_dong_gu.json'

const STOP_CENTRALITY_URL = '/data/bus/stop_centrality.geojson'

const SUBWAY_STATIONS_URL = '/data/subway/daejeon_subway_stations.geojson'

// 선형 자체는 지도에 안 그리고 배차간격 메타데이터만 꺼내 쓴다
const SUBWAY_ROUTE_URL = '/data/subway/daejeon_subway_route.geojson'

const TRAM_STATIONS_URL = '/data/tram/daejeon_tram_stations.geojson'

const HOSPITALS_URL = '/data/medical/daejeon_hospitals.geojson'

const PHARMACIES_URL = '/data/medical/daejeon_pharmacies.geojson'

const WELFARE_FACILITIES_URL = '/data/welfare/daejeon_welfare_facilities.geojson'

const WELFARE_CENTERS_URL = '/data/welfare/daejeon_welfare_centers.geojson'
// 타슈(공영자전거) 대여소 위치와 2026년 10월 대여·반납 평균(평일/토/일, 1시간 단위) - build_tashu_ridership.cjs
// 대전광역시 전통시장 현황(2022.6.30, 공공데이터포털) - 좌표는 OSM 주소/이름 매칭 추정(approx=true면 대략 위치)
const TASHU_STATIONS_URL = '/data/tashu/tashu_stations.geojson'
const TASHU_USAGE_URL = '/data/tashu/tashu_station_usage.json'

const SCHOOLS_URL = '/data/facilities/daejeon_schools.geojson'
const MARKETS_URL = '/data/facilities/daejeon_markets.geojson'
const GOVERNMENT_OFFICES_URL = '/data/facilities/daejeon_government_offices.geojson'

const BUSWAY_OFFICIAL_URL = '/data/bus/busway_official.geojson'

const BUILDINGS_URL = '/data/buildings/daejeon_buildings_official.geojson'

const SUBWAY_LINE_SHAPE_URL = '/data/subway/daejeon_subway_line_shape.json'

const TRAM_LINE_SHAPE_URL = '/data/tram/daejeon_tram_line_shape.json'

const BUS_LINE_SHAPE_URL = '/data/bus/bus_route_line_shape.json'

// ==========================================
// 레이어 목록
// ==========================================

const LAYER_GROUPS = ['대중교통', '도로·지형', '인구·시설', '분석·기타']

const LAYER_ITEMS = [
  { id: 'subway', label: '지하철(OSM 추정, 역 정보 포함)', color: '#2684ff', group: '대중교통' },
  { id: 'subwayTrains', label: '지하철 운행 시뮬레이션', color: '#60a5fa', group: '대중교통' },
  { id: 'tram', label: '트램(OSM 태그 기반, 정거장 포함)', color: '#00d9c0', group: '대중교통' },
  { id: 'tramTrains', label: '트램 운행 시뮬레이션(OSM 공사중 선형 기반)', color: '#fdba74', group: '대중교통' },
  { id: 'officialBusStops', label: '버스정류소(공식)', color: '#ffb020', group: '대중교통' },
  { id: 'busRouteLines', label: '버스 노선(공식)', color: '#22d3ee', group: '대중교통' },
  { id: 'busTrains', label: '버스 운행 시뮬레이션(선택한 노선)', color: '#facc15', group: '대중교통' },
  { id: 'busTrainsAll', label: '버스 운행 시뮬레이션(전체 노선)', color: '#facc15', group: '대중교통' },
  { id: 'railway', label: '철도', color: '#a855f7', group: '대중교통' },

  { id: 'motorway', label: '고속도로', color: '#e34b4b', group: '도로·지형' },
  { id: 'majorRoad', label: '주요도로', color: '#ed8546', group: '도로·지형' },
  { id: 'secondaryRoad', label: '보조간선도로', color: '#f2b84b', group: '도로·지형' },
  { id: 'localRoad', label: '일반도로', color: '#b8c2cc', group: '도로·지형' },
  { id: 'footway', label: '보행로', color: '#e6a4a4', group: '도로·지형' },
  { id: 'cycleway', label: '자전거도로', color: '#43c77a', group: '도로·지형' },
  { id: 'busway', label: '버스전용도로', color: '#00a9a0', group: '도로·지형' },
  { id: 'trafficLinks', label: '소통정보', color: '#f59e0b', group: '도로·지형' },
  { id: 'waterways', label: '하천', color: '#39a9db', group: '도로·지형' },

  { id: 'population', label: '고령인구 비율(집계구)', color: '#fb7185', group: '인구·시설' },
  { id: 'elderlyDong', label: '고령인구 비율(행정동)', color: '#f97316', group: '인구·시설' },
  { id: 'elderlyGu', label: '고령인구 비율(구)', color: '#dc2626', group: '인구·시설' },
  { id: 'elderlyCountOa', label: '노인 인구수(집계구)', color: '#a78bfa', group: '인구·시설' },
  { id: 'elderlyCountDong', label: '노인 인구수(행정동)', color: '#7c3aed', group: '인구·시설' },
  { id: 'elderlyCountGu', label: '노인 인구수(구)', color: '#5b21b6', group: '인구·시설' },
  { id: 'hospitals', label: '병원·의원(공식)', color: '#60a5fa', group: '인구·시설' },
  { id: 'pharmacies', label: '약국(공식)', color: '#4ade80', group: '인구·시설' },
  { id: 'welfareFacilities', label: '장애인 편의시설(공식)', color: '#c084fc', group: '인구·시설' },
  { id: 'welfareCenters', label: '복지시설(공식)', color: '#f472b6', group: '인구·시설' },
  { id: 'tashu', label: '타슈 대여소(공식)', color: '#2dd4bf', group: '인구·시설' },
  { id: 'schools', label: '학교(OSM 추정)', color: '#818cf8', group: '인구·시설' },
  { id: 'markets', label: '전통시장(OSM 추정)', color: '#fb923c', group: '인구·시설' },
  { id: 'governmentOffices', label: '행정기관(OSM 추정)', color: '#94a3b8', group: '인구·시설' },
  { id: 'buildings', label: '건물(공식)', color: '#aab2bd', group: '인구·시설' },

  { id: 'stopCentrality', label: '정류장 중심성(연결)', color: '#a3e635', group: '분석·기타' },
  { id: 'stopBetweenness', label: '정류장 중심성(매개)', color: '#dc2626', group: '분석·기타' },
]

// 처음 열 때 전부 켜면 아이콘이 겹쳐 지도가 안 보여서, 기본으로는 핵심 레이어만 켠다
// (나머지는 오른쪽 패널에서 켜면 됨)
const DEFAULT_ON_LAYERS = new Set([
  'subway', 'subwayTrains', 'tram', 'tramTrains', 'busTrainsAll',
  'motorway', 'majorRoad', 'secondaryRoad', 'waterways',
])
const INITIAL_LAYER_STATE = Object.fromEntries(
  LAYER_ITEMS.map((item) => [item.id, DEFAULT_ON_LAYERS.has(item.id)])
)

// 정류소·시설처럼 점이 수백~수천 개인 레이어는 이 확대 레벨부터만 그린다
const POINT_MIN_ZOOM = 14

// ==========================================
// 객체 판별
// ==========================================

function isSignal(feature) {
  const p = feature.properties || {}

  return (
    p.highway === 'traffic_signals' ||
    Boolean(p.traffic_signals) ||
    p.crossing === 'signals'
  )
}

function isTram(p = {}) {
  return (
    p.railway === 'tram' ||
    p.railway === 'light_rail' ||
    p.tram === 'yes' ||
    p.route === 'tram' ||
    p.construction === 'tram' ||
    p['construction:railway'] === 'tram' ||
    p.proposed === 'tram' ||
    p['proposed:railway'] === 'tram'
  )
}

function isSubway(p = {}) {
  return (
    p.railway === 'subway' ||
    p.subway === 'yes'
  )
}

function isRailway(p = {}) {
  return [
    'rail',
    'narrow_gauge',
    'preserved',
    'funicular',
    'monorail',
  ].includes(p.railway)
}

function isLineFeature(feature) {
  const type = feature.geometry?.type

  return (
    type === 'LineString' ||
    type === 'MultiLineString'
  )
}

function getRoadCategory(p = {}) {
  const h = p.highway

  if (!h) return null

  if (['motorway', 'motorway_link'].includes(h)) {
    return 'motorway'
  }

  if (['trunk', 'trunk_link', 'primary', 'primary_link'].includes(h)) {
    return 'majorRoad'
  }

  if (['secondary', 'secondary_link'].includes(h)) {
    return 'secondaryRoad'
  }

  if (['footway', 'pedestrian', 'path', 'steps', 'bridleway'].includes(h)) {
    return 'footway'
  }

  if (h === 'cycleway') {
    return 'cycleway'
  }

  if (h === 'busway') {
    return 'busway'
  }

  if ([
    'tertiary',
    'tertiary_link',
    'unclassified',
    'residential',
    'living_street',
    'service',
    'road',
  ].includes(h)) {
    return 'localRoad'
  }

  return null
}

// ==========================================
// 레이어별 필터
// ==========================================

function shouldDisplayRoad(feature, category) {
  const p = feature.properties || {}

  if (!isLineFeature(feature)) return false
  if (isSignal(feature)) return false
  if (isTram(p) || isSubway(p) || isRailway(p)) return false

  return getRoadCategory(p) === category
}

function shouldDisplayTram(feature) {
  return isLineFeature(feature) &&
    isTram(feature.properties || {})
}

function shouldDisplaySubway(feature) {
  return isLineFeature(feature) &&
    isSubway(feature.properties || {})
}

function shouldDisplayRailway(feature) {
  const p = feature.properties || {}

  return (
    isLineFeature(feature) &&
    isRailway(p) &&
    !isTram(p) &&
    !isSubway(p)
  )
}

function shouldDisplayWaterway(feature) {
  return (
    isLineFeature(feature) &&
    Boolean(feature.properties?.waterway)
  )
}

// ==========================================
// 지도 스타일
// ==========================================

function getRoadStyle(feature) {
  const p = feature.properties || {}
  const h = p.highway

  const roadStyles = {
    motorway: ['#e34b4b', 5],
    motorway_link: ['#e77a65', 3],
    trunk: ['#ed8546', 4],
    trunk_link: ['#ed9a67', 3],
    primary: ['#f2b84b', 4],
    primary_link: ['#f2c56b', 3],
    secondary: ['#e8d36b', 3],
    secondary_link: ['#e8d98e', 2],
    tertiary: ['#d6d6d6', 2.5],
    tertiary_link: ['#c5c5c5', 2],
    residential: ['#b8c2cc', 2],
    living_street: ['#9ca3af', 2],
    unclassified: ['#aeb7c2', 1.8],
    service: ['#8b95a1', 1.3],
    road: ['#9ca3af', 1.5],
    footway: ['#e6a4a4', 1.8],
    pedestrian: ['#e6a4a4', 2],
    path: ['#b6a28a', 1.5],
    cycleway: ['#43c77a', 2.5],
    steps: ['#bd9b75', 2],
    busway: ['#00a9a0', 3],
  }

  const [color, weight] =
    roadStyles[h] || ['#9ca3af', 1.5]

  return {
    color,
    weight,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
    dashArray: [
      'footway',
      'pedestrian',
      'path',
      'cycleway',
      'steps',
    ].includes(h)
      ? '4 4'
      : undefined,
  }
}

function getTramStyle() {
  return {
    color: '#00d9c0',
    weight: 6,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    className: 'tram-route-line',
  }
}

function getSubwayStyle() {
  return {
    color: '#2684ff',
    weight: 5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round',
  }
}

function getRailwayStyle() {
  return {
    color: '#a855f7',
    weight: 4,
    opacity: 0.95,
    dashArray: '8 5',
  }
}

function getWaterwayStyle() {
  return {
    color: '#39a9db',
    weight: 2,
    opacity: 0.85,
  }
}

// 혼잡코드 정의 - data.go.kr "대전광역시_대전교통정보"(getTrafficInfoAll) API 문서 기준
// (0:정보없음 1:소통원활 2:지체 3:정체)
const CONGESTION_META = {
  1: { color: '#4ade80', label: '소통원활' },
  2: { color: '#f59e0b', label: '지체' },
  3: { color: '#e34b4b', label: '정체' },
}

function getTrafficLinkStyle(feature) {
  const congestion = feature.properties?.congestion

  return {
    color: CONGESTION_META[congestion]?.color || '#64748b',
    weight: 3,
    opacity: congestion ? 0.95 : 0.4,
    lineCap: 'round',
    lineJoin: 'round',
  }
}

function bindTrafficLinkPopup(feature, layer) {
  const p = feature.properties || {}

  layer.bindPopup(
    `<strong>${p.roadName || '도로명 미상'}</strong><br/>` +
      `소통 상태: ${CONGESTION_META[p.congestion]?.label || '정보 없음'}<br/>` +
      `속도: ${p.speed != null ? `${p.speed}km/h` : '정보 없음'}<br/>` +
      `통행시간: ${p.travelT != null ? `${p.travelT}초` : '정보 없음'}<br/>` +
      `linkID: ${p.linkId}`
  )
}

// 대전시 공식 노선정보 API(getStaionByRouteAll)에서 받은 실제 좌표 기반 정류소
function createOfficialBusStopMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#ffffff',
    weight: 1,
    fillColor: '#ffb020',
    fillOpacity: 1,
  })
}

// 앱이 실제로 돌리는 노선 목록(141개, 대전 BIS 현재 노선) 기준 색인.
// bus_stops.geojson의 routeCount에는 현재 BIS에 없는 노선 32개(폐지/계룡·세종)가
// 섞여 있고, 정류소ID가 대전과 세종·계룡에서 겹치는 경우(43개)도 있어서
// "같은 정류소ID + 100m 안"인 노선만 센다.
function buildRouteIndex(routeList, routeStops) {
  const ids = new Set(routeList.map((r) => r.routeId))
  const baseCount = {}
  for (const r of routeList) baseCount[routeDisplayName(r)] = (baseCount[routeDisplayName(r)] || 0) + 1
  const firstStop = (r) => routeStops?.[r.routeId]?.[0]?.name || ''
  const nameById = new Map()
  for (const r of routeList) {
    const base = routeDisplayName(r)
    let name = base
    if ((baseCount[base] || 0) > 1) {
      const same = routeList.filter((x) => routeDisplayName(x) === base && firstStop(x) === firstStop(r)).length > 1
      name = same ? `${base}(${String(r.routeId).slice(-4)})` : `${base}(${firstStop(r)} 출발)`
    }
    nameById.set(r.routeId, name)
  }
  const stopRoutes = new Map()
  for (const routeId of ids) {
    for (const s of routeStops?.[routeId] || []) {
      if (!stopRoutes.has(s.stopId)) stopRoutes.set(s.stopId, [])
      stopRoutes.get(s.stopId).push({ routeId, lat: s.lat, lng: s.lng })
    }
  }
  const routeById = new Map(routeList.map((r) => [r.routeId, r]))
  return { ids, nameById, stopRoutes, routeById, routeStops }
}

function routesAtStop(idx, feature) {
  const [lng, lat] = feature.geometry?.coordinates || []
  const found = new Set()
  for (const c of idx?.stopRoutes.get(feature.properties?.stopId) || []) {
    const d = Math.hypot((c.lng - lng) * 89900, (c.lat - lat) * 111000)
    if (d <= 100) found.add(c.routeId)
  }
  return [...found]
}

function makeBindOfficialBusStopPopup(idx) {
  return (feature, layer) => {
    const p = feature.properties || {}
    const names = routesAtStop(idx, feature)
      .map((id) => idx.nameById.get(id))
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
    layer.bindPopup(
      `<strong>${p.name || '정류소명 미상'}</strong><br/>` +
        `경유 노선 수: ${names.length}개<br/>` +
        (names.length ? `<span style="font-size:11px">${names.join(', ')}</span><br/>` : '') +
        `정류소ID: ${p.stopId}`
    )
  }
}

// SGIS 2024 집계구 성연령별인구 기반. N/A(1~4명 비공개)는 2.5명으로 추정, 총인구는 공식 총괄값
function getPopulationStyle(feature) {
  const ratio = feature.properties?.elderlyRatio

  const color =
    ratio == null ? '#334155' :
    ratio < 10 ? '#1e3a8a' :
    ratio < 15 ? '#2563eb' :
    ratio < 20 ? '#f59e0b' :
    ratio < 25 ? '#f97316' :
    '#dc2626'

  return {
    color: '#1e293b',
    weight: 0.5,
    fillColor: color,
    fillOpacity: 0.55,
  }
}

// 행정동·구 고령인구 비율 색(집계구 레이어와 같은 구간 + 30% 이상 한 단계 추가)
const ELDERLY_BINS = [
  { max: 10, color: '#1e3a8a', label: '10% 미만' },
  { max: 15, color: '#2563eb', label: '10~15%' },
  { max: 20, color: '#f59e0b', label: '15~20%' },
  { max: 25, color: '#f97316', label: '20~25%' },
  { max: 30, color: '#dc2626', label: '25~30%' },
  { max: Infinity, color: '#7f1d1d', label: '30% 이상' },
]

function elderlyAreaRatio(p) {
  return p?.t ? (p.e / p.t) * 100 : null
}

function elderlyColor(ratio) {
  if (ratio == null) return '#334155'
  return ELDERLY_BINS.find((b) => ratio < b.max).color
}

function getElderlyAreaStyle(feature) {
  return {
    color: '#0f172a',
    weight: feature.properties?.dong ? 0.8 : 2,
    fillColor: elderlyColor(elderlyAreaRatio(feature.properties)),
    fillOpacity: 0.6,
  }
}

// 65세 이상 인구수(명) 색 구간 - 단위마다 크기가 달라 구간을 따로 둔다
const COUNT_COLORS = ['#ede9fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#5b21b6', '#3b0764']
function countBins(edges) {
  const fmt = (n) => (n >= 10000 ? `${n / 10000}만` : n.toLocaleString())
  return edges.concat(Infinity).map((max, i) => ({
    max,
    color: COUNT_COLORS[i + COUNT_COLORS.length - edges.length - 1],
    label: i === 0 ? `${fmt(max)}명 미만` : max === Infinity ? `${fmt(edges[i - 1])}명 이상` : `${fmt(edges[i - 1])}~${fmt(max)}명`,
  }))
}
const ELDERLY_COUNT_BINS = {
  oa: countBins([30, 60, 90, 120, 160]),
  dong: countBins([2000, 3000, 4000, 5000]),
  gu: countBins([40000, 50000, 60000]),
}
function countColor(n, bins) {
  if (n == null) return '#334155'
  return bins.find((b) => n < b.max).color
}
function getElderlyCountOaStyle(feature) {
  return {
    color: '#1e293b',
    weight: 0.4,
    fillColor: countColor(feature.properties?.elderlyPop, ELDERLY_COUNT_BINS.oa),
    fillOpacity: 0.7,
  }
}
function getElderlyCountAreaStyle(feature) {
  const isDong = !!feature.properties?.dong
  return {
    color: '#0f172a',
    weight: isDong ? 0.8 : 2,
    fillColor: countColor(feature.properties?.e, isDong ? ELDERLY_COUNT_BINS.dong : ELDERLY_COUNT_BINS.gu),
    fillOpacity: 0.7,
  }
}

function makeBindElderlyAreaPopup(collection, isGu, mode = 'ratio') {
  // 비율 높은 순 순위
  const ranked = [...(collection?.features || [])].sort(
    (a, b) => (elderlyAreaRatio(b.properties) ?? -1) - (elderlyAreaRatio(a.properties) ?? -1)
  )
  const rankOf = new Map(ranked.map((f, i) => [f, i + 1]))
  const countRanked = [...(collection?.features || [])].sort((a, b) => (b.properties?.e ?? 0) - (a.properties?.e ?? 0))
  const countRankOf = new Map(countRanked.map((f, i) => [f, i + 1]))
  const styleFn = mode === 'count' ? getElderlyCountAreaStyle : getElderlyAreaStyle
  return (feature, layer) => {
    const p = feature.properties || {}
    const r = elderlyAreaRatio(p)
    const n = ranked.length
    const title = isGu ? p.gu : `${p.dong} <span style="color:#888">${p.gu}</span>`
    layer.bindPopup(
      `<strong>${title}</strong><br/>` +
        `65세 이상: <strong>${p.e?.toLocaleString() ?? '-'}명</strong> (${n}곳 중 ${countRankOf.get(feature)}위)<br/>` +
        `고령인구 비율: <strong>${r != null ? r.toFixed(1) : '-'}%</strong> (${n}곳 중 ${rankOf.get(feature)}위)<br/>` +
        `총인구: ${p.t?.toLocaleString() ?? '-'}명<br/>` +
        `<span style="color:#888;font-size:11px">SGIS 2024, 1~4명 비공개 칸은 2.5명으로 추정</span>`
    )
    if (isGu) {
      layer.bindTooltip(mode === 'count' ? `${p.gu} ${(p.e / 10000).toFixed(1)}만 명` : `${p.gu} ${r != null ? r.toFixed(1) : '-'}%`, {
        permanent: true,
        direction: 'center',
        className: 'elderly-gu-label',
      })
    }
    layer.on('mouseover', () => layer.setStyle({ weight: 3, color: '#ffffff' }))
    layer.on('mouseout', () => layer.setStyle(styleFn(feature)))
  }
}

function bindPopulationPopup(feature, layer) {
  const p = feature.properties || {}

  layer.bindPopup(
    `집계구 ${p.oaCode}<br/>` +
      `총인구: ${p.totalPop != null ? p.totalPop.toLocaleString() : '정보 없음'}명<br/>` +
      `65세 이상: ${p.elderlyPop != null ? p.elderlyPop.toLocaleString() : '정보 없음'}명<br/>` +
      `고령인구 비율: ${p.elderlyRatio != null ? `${p.elderlyRatio}%` : '정보 없음'}` +
      (p.suppressedBins > 0 ? `<br/><span style="color:#888;font-size:11px">※ 1~4명 비공개 칸 ${p.suppressedBins}개는 2.5명으로 추정</span>` : '')
  )
}

// 연결 중심성(이 정류장과 바로 연결된 정류장 수) 기준 크기/색 - 값이 클수록
// 여러 노선이 모이는 교통 거점. 매개/고유벡터 중심성은 팝업에서 확인
function createStopCentralityMarker(feature, latlng) {
  const degree = feature.properties?.degree || 0

  return L.circleMarker(latlng, {
    radius: Math.min(4 + degree, 16),
    color: '#1a2e05',
    weight: 1,
    fillColor: '#a3e635',
    fillOpacity: Math.min(0.3 + degree * 0.06, 0.9),
  })
}

// 매개중심성은 분포가 심하게 치우쳐 있어서 백분위수 기준으로 색칠한다
// (build_stop_network.cjs가 저장한 betweennessPercentiles 사용)
function createBetweennessMarkerFactory(percentiles) {
  return (feature, latlng) => {
    const value = feature.properties?.betweenness || 0
    const p = percentiles || {}

    const [color, radius] =
      value === 0 ? ['#64748b', 3] :
      value < p.p50 ? ['#60a5fa', 4] :
      value < p.p75 ? ['#3b82f6', 6] :
      value < p.p90 ? ['#f59e0b', 8] :
      value < p.p95 ? ['#f97316', 11] :
      value < p.p99 ? ['#ef4444', 14] :
      ['#991b1b', 18]

    return L.circleMarker(latlng, {
      radius,
      color: '#1e293b',
      weight: 1,
      fillColor: color,
      fillOpacity: 0.8,
    })
  }
}

function bindStopCentralityPopup(feature, layer) {
  const p = feature.properties || {}

  layer.bindPopup(
    `<strong>${p.name || '정류소명 미상'}</strong><br/>` +
      `연결 중심성: ${p.degree}<br/>` +
      `매개 중심성: ${p.betweenness}<br/>` +
      `고유벡터 중심성: ${p.eigenvector}`
  )
}

// KRIC 레일포털 "역 편의정보 자료 조사서" 기준 공식 역 좌표는 OSM
// 선로(지하철 OSM 추정 레이어)랑 최대 140m씩 떨어져 있어서, 그대로
// 찍으면 역이 선 옆에 따로 떨어져 보임 - lineShape로 선 위 가장 가까운
// 점으로 스냅해서 찍는다(열차 시뮬레이션이 쓰는 좌표랑 동일).
function createSubwayStationMarker(lineShape, showLabel) {
  return (feature, latlng) => {
    const name = feature.properties?.name
    const idx = lineShape?.toBanseok?.stationIndex?.[name]
    const snapped =
      idx !== undefined
        ? L.latLng(lineShape.toBanseok.line[idx][1], lineShape.toBanseok.line[idx][0])
        : latlng

    const marker = L.circleMarker(snapped, {
      radius: 5,
      color: '#1e293b',
      weight: 1,
      fillColor: '#93c5fd',
      fillOpacity: 1,
    })

    if (showLabel) {
      marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'subway-station-label' })
    }

    return marker
  }
}

// 요일별 배차간격(KRIC 시각표 기반, 반석/판암 전 구간 운행 기준)을
// 역 팝업에 같이 보여준다 - 노선 선형 자체는 정류장을 직선으로 이은
// 것뿐이라 지도에 안 그림, OSM 선형이 더 정확해서 그쪽을 믿는다
function createSubwayStationPopupBinder(headway) {
  return (feature, layer) => {
    const p = feature.properties || {}

    const headwayRows = headway
      ? Object.entries(headway)
          .map(([day, directions]) => {
            const d = directions['반석(칠성대)'] || Object.values(directions)[0]
            return d ? `${day} 평균 ${d.avgHeadwayMin}분` : ''
          })
          .filter(Boolean)
          .join('<br/>')
      : ''

    layer.bindPopup(
      `<strong>${p.name}</strong> (${p.stationNo})<br/>` +
        `${p.nameEn || ''}<br/>` +
        `개통일: ${p.openedAt || '정보 없음'}` +
        (headwayRows ? `<br/>${headwayRows}` : '')
    )
  }
}

// 건강보험심사평가원 병원정보서비스/약국정보서비스 - 공식 데이터
// 학교/전통시장/행정기관 - OSM(daejeon_map.geojson)에서 뽑음(공식 출처
// 아님). 셋 다 이름만 있는 단순 포인트라 마커/팝업 함수를 공용으로 씀.
function createFacilityMarker(color) {
  return (feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 4,
      color: '#1e293b',
      weight: 1,
      fillColor: color,
      fillOpacity: 0.9,
    })
}

function bindFacilityPopup(feature, layer) {
  const p = feature.properties || {}
  const extra = p.schoolType || p.operator || ''
  layer.bindPopup(`<strong>${p.name}</strong>${extra ? ` (${extra})` : ''}`)
}

function createHospitalMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#1e293b',
    weight: 1,
    fillColor: '#60a5fa',
    fillOpacity: 0.9,
  })
}

function bindHospitalPopup(feature, layer) {
  const p = feature.properties || {}
  layer.bindPopup(
    `<strong>${p.name}</strong> (${p.type})<br/>` +
      `${p.address || ''}<br/>` +
      `${p.phone || '전화번호 정보 없음'}`
  )
}

// 대전장애인단체총연합회 정보드림(djid.or.kr) 편의시설 목록 - 공식 데이터
// (좌표는 원본에 없어서 카카오 로컬 API로 지오코딩함, 882건 중 874건 성공)
function createWelfareFacilityMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#1e293b',
    weight: 1,
    fillColor: '#c084fc',
    fillOpacity: 0.9,
  })
}

function bindWelfareFacilityPopup(feature, layer) {
  const p = feature.properties || {}
  const amenities = (p.amenities || []).join(', ')
  layer.bindPopup(
    `<strong>${p.name}</strong> (${p.facilityType})<br/>` +
      `${p.address || ''}<br/>` +
      `${p.phone || '전화번호 정보 없음'}` +
      (amenities ? `<br/>편의시설: ${amenities}` : '')
  )
}

// 대전장애인단체총연합회 정보드림(djid.or.kr) 복지시설 목록 - 공식 데이터
// (편의시설 레이어와 같은 이유로 좌표 없어서 카카오 로컬 API로 지오코딩,
// 517건 중 512건 성공)
function createWelfareCenterMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#1e293b',
    weight: 1,
    fillColor: '#f472b6',
    fillOpacity: 0.9,
  })
}

function bindWelfareCenterPopup(feature, layer) {
  const p = feature.properties || {}
  layer.bindPopup(
    `<strong>${p.name}</strong> (${p.orgType})<br/>` +
      `${p.address || ''}<br/>` +
      `${p.phone || '전화번호 정보 없음'}`
  )
}

function createTashuMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#134e4a',
    weight: 1,
    fillColor: '#2dd4bf',
    fillOpacity: 0.85,
  })
}

// 대여소 팝업: 2026년 10월 평균(평일/토/일)으로 출근(07~09시)·퇴근(17~19시)·하루 대여/반납 건수
function makeBindTashuPopup(usage) {
  const sumHours = (byHour, hours, key) =>
    hours.reduce((acc, h) => acc + (byHour?.[h]?.[key] || 0), 0)
  const fmt = (v) => (Math.round(v * 10) / 10).toString()
  const ALL = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  const AM = ['07:00', '08:00']
  const PM = ['17:00', '18:00']
  return (feature, layer) => {
    const p = feature.properties || {}
    const u = usage?.stations?.[p.stationId]
    let html = `<strong>${p.name || p.stationId}</strong><br/>${p.gu || ''} ${p.dong || ''}`
    if (u) {
      for (const day of ['평일', '토', '일']) {
        const d = u[day]
        if (!d) continue
        html +=
          `<br/><b>${day}</b> 출근(07~09시) 대여 ${fmt(sumHours(d, AM, 'rentals'))} / 반납 ${fmt(sumHours(d, AM, 'returns'))}` +
          `, 퇴근(17~19시) 대여 ${fmt(sumHours(d, PM, 'rentals'))} / 반납 ${fmt(sumHours(d, PM, 'returns'))}` +
          `, 하루 대여 ${fmt(sumHours(d, ALL, 'rentals'))}건`
      }
      html += '<br/><span style="color:#888">2026년 10월 하루 평균</span>'
    } else {
      html += '<br/>이용 기록 없음'
    }
    layer.bindPopup(html)
  }
}

function createPharmacyMarker(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 4,
    color: '#1e293b',
    weight: 1,
    fillColor: '#4ade80',
    fillOpacity: 0.9,
  })
}

function bindPharmacyPopup(feature, layer) {
  const p = feature.properties || {}
  layer.bindPopup(
    `<strong>${p.name}</strong><br/>` +
      `${p.address || ''}<br/>` +
      `${p.phone || '전화번호 정보 없음'}`
  )
}

// 트램 역도 지하철과 같은 문제: 직접 제작한 역 좌표가 OSM 선형이랑 최대
// 50m 떨어져 있어서, lineShape로 선 위 가장 가까운 점으로 스냅해서 찍는다.
const TRAM_LINE_TYPE_TO_BRANCH = { 본선: 'mainline', 연축지선: 'yeonchuk', 진잠지선: 'jinjam' }

function createTramStationMarker(lineShape, showLabel) {
  return (feature, latlng) => {
    const p = feature.properties || {}
    const branch = lineShape?.[TRAM_LINE_TYPE_TO_BRANCH[p.lineType]]
    const idx = branch?.stationIndex?.[p.name]
    const snapped = idx !== undefined ? L.latLng(branch.line[idx][1], branch.line[idx][0]) : latlng

    const marker = L.circleMarker(snapped, {
      radius: 5,
      color: '#1e293b',
      weight: 1,
      fillColor: '#fdba74',
      fillOpacity: 1,
    })

    if (showLabel) {
      marker.bindTooltip(p.name, { permanent: true, direction: 'top', className: 'subway-station-label' })
    }

    return marker
  }
}

function bindTramStationPopup(feature, layer) {
  const p = feature.properties || {}
  layer.bindPopup(`<strong>${p.name}</strong><br/>${p.lineType || ''}`)
}

// 노선 140여 개가 같은 도로에 겹쳐서, 평소엔 얇고 흐리게 그리고
// 마우스를 올린 노선만 굵고 진하게 강조한다
function getBusRouteLineStyle() {
  return {
    color: '#22d3ee',
    weight: 1.5,
    opacity: 0.3,
  }
}

function makeBindBusRouteLinePopup(idx) {
  return (feature, layer) => bindBusRouteLinePopup(feature, layer, idx)
}

function bindBusRouteLinePopup(feature, layer, idx) {
  const id = feature.properties?.routeId
  const r = idx?.routeById.get(id)
  const st = idx?.routeStops?.[id] || []
  // 회차점 = 첫 정류소에서 가장 먼 정류소
  let far = st[0]
  for (const x of st) {
    if (Math.hypot((x.lng - st[0].lng) * 0.8, x.lat - st[0].lat) > Math.hypot((far.lng - st[0].lng) * 0.8, far.lat - st[0].lat)) far = x
  }
  const ends = st.length ? `${st[0].name} ↔ ${far.name}` : ''
  const hhmm = (v) => (v ? String(v).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2') : '?')
  layer.bindPopup(
    r
      ? `<strong>${idx.nameById.get(id)}</strong><br/>${ends}<br/>배차 평일 ${r.intervalMin ?? '?'}분 · ${hhmm(r.firstBus)}~${hhmm(r.lastBus)}`
      : `노선ID: ${id}`
  )
  layer.on('mouseover', () => {
    layer.setStyle({ weight: 5, opacity: 1, color: '#0891b2' })
    layer.bringToFront()
  })
  layer.on('mouseout', () => layer.setStyle(getBusRouteLineStyle()))
}

// data.go.kr 대전광역시_버스전용차로 현황(15081423) 공식 구간표 기반(가로변만) -
// 좌표가 없어서 교차로명을 지오코딩 후 같은 도로명 OSM 선형으로 추적.
// 추적 거리가 공식 거리와 5% 넘게 다르거나 경로를 못 찾은 건 뺐음
// (build_busway_official.cjs 참고) - 일부만 있음. 버스전용도로(OSM)
// 레이어와 같은 토글로 묶어서 보여줌.
function getBuswayOfficialStyle() {
  return {
    color: '#00a9a0',
    weight: 4,
    opacity: 0.8,
  }
}

function bindBuswayOfficialPopup(feature, layer) {
  const p = feature.properties || {}
  layer.bindPopup(
    `<strong>${p.name}</strong> (${p.category})<br/>` +
      `${p.section}<br/>` +
      `공식 거리: ${p.officialKm}km<br/>` +
      `${p.note || ''}`
  )
}

function getBuildingStyle() {
  return {
    color: '#777f89',
    weight: 0.6,
    fillColor: '#aab2bd',
    fillOpacity: 0.55,
  }
}

// ==========================================
// 지하철 운행 시뮬레이션
// ==========================================

const SUBWAY_DIRECTIONS = ['반석(칠성대)', '판암(대전대)']

const DAYS_OF_WEEK = ['월', '화', '수', '목', '금', '토', '일']

// 헤드웨이 데이터엔 평일/토요일/휴일 3종만 있어서 공휴일은 못 따짐
function dayToHeadwayType(day) {
  if (day === '토') return '토요일'
  if (day === '일') return '휴일'
  return '평일'
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// 배차간격 통계(firstDeparture~lastDeparture, tripCount)로 출발시각을
// 균등 생성 - 실제 매 열차 출발시각 원본은 안 쓰고 근사함.
function synthesizeDepartures(direction) {
  const firstMin = toMinutes(direction.firstDeparture)
  const lastMin = toMinutes(direction.lastDeparture)
  const n = direction.tripCount

  if (!n || n <= 1) return [firstMin]

  const step = (lastMin - firstMin) / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.round(firstMin + i * step))
}

function haversineMetersLatLng(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (v) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function pathLengthMeters(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1] = points[i]
    const [lng2, lat2] = points[i + 1]
    total += haversineMetersLatLng(lat1, lng1, lat2, lng2)
  }
  return total
}

function pointAtDistanceAlong(points, targetDist) {
  let acc = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1] = points[i]
    const [lng2, lat2] = points[i + 1]
    const segDist = haversineMetersLatLng(lat1, lng1, lat2, lng2)
    if (acc + segDist >= targetDist) {
      const frac = segDist > 0 ? (targetDist - acc) / segDist : 0
      return [lat1 + (lat2 - lat1) * frac, lng1 + (lng2 - lng1) * frac]
    }
    acc += segDist
  }
  const [lastLng, lastLat] = points[points.length - 1]
  return [lastLat, lastLng]
}

// 자정 넘김(clockMin>1440 가능)을 다시 00:00~23:45로 접고 15분 단위로
// 내림해서 route_segment_speed.json의 시간대 키("05:00" 등)와 맞춘다.
function timeSlotLabel(min) {
  const wrapped = (((Math.floor(min / 15) * 15) % 1440) + 1440) % 1440
  const h = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const m = String(wrapped % 60).padStart(2, '0')
  return `${h}:${m}`
}

// orderedStations: 열차가 지나는 순서대로 정렬된 역 배열
// offsets: 같은 길이, 0부터 시작해 증가하는 출발 후 경과(분)
// lineShape: build_subway_line_shape.cjs가 만든 {line, stationIndex} -
// 역과 역 사이를 직선이 아니라 실제 OSM 선로 모양대로 이동시키려고 씀
const SUBWAY_DWELL_MIN = 0.3 // 역마다 약 18초 정차(승하차 시간), 공식 역간 소요시간 안에서 나눠씀

function interpolateAlongStations(orderedStations, offsets, elapsedMin, lineShape) {
  for (let i = 0; i < orderedStations.length - 1; i++) {
    if (elapsedMin >= offsets[i] && elapsedMin <= offsets[i + 1]) {
      const span = offsets[i + 1] - offsets[i]
      const dwell = Math.min(SUBWAY_DWELL_MIN, span * 0.4)
      const tInSegment = elapsedMin - offsets[i]

      const nextStationName = orderedStations[i + 1].properties.name

      if (tInSegment < dwell) {
        // 역의 공식 좌표가 아니라 선 위로 스냅된 좌표를 써야 함 - 공식
        // 좌표는 OSM 선로랑 최대 140m씩 떨어져 있어서, 그대로 쓰면
        // 정차할 때마다 열차가 선 밖으로 튀었다가 돌아오는 것처럼 보임
        const idx = lineShape.stationIndex[orderedStations[i].properties.name]
        const [lng, lat] = lineShape.line[idx]
        return { position: [lat, lng], nextStationName, stationOrderIndex: i, speedKmh: 0 }
      }

      const travelSpan = span - dwell
      const frac = travelSpan > 0 ? (tInSegment - dwell) / travelSpan : 1

      const idxA = lineShape.stationIndex[orderedStations[i].properties.name]
      const idxB = lineShape.stationIndex[orderedStations[i + 1].properties.name]
      const lo = Math.min(idxA, idxB)
      const hi = Math.max(idxA, idxB)
      let segment = lineShape.line.slice(lo, hi + 1)
      if (idxA > idxB) segment = [...segment].reverse()

      const distM = pathLengthMeters(segment)
      // 배차표상 역간 소요시간(span, 분)으로 역산한 평균 속도 - 실측
      // 센서 속도가 아니라 공식 소요시간 기준 추정치임
      const speedKmh = travelSpan > 0 ? Math.round((distM / 1000 / (travelSpan / 60)) * 10) / 10 : 0

      return { position: pointAtDistanceAlong(segment, distM * frac), nextStationName, stationOrderIndex: i, speedKmh }
    }
  }
  return null
}

function getSubwayTrainPosition(stationsSorted, elapsedMin, direction, lineShape) {
  if (direction === '반석(칠성대)') {
    const offsets = stationsSorted.map((s) => s.properties.offsetFromPanamMin)
    return interpolateAlongStations(stationsSorted, offsets, elapsedMin, lineShape.toBanseok)
  }

  const reversed = [...stationsSorted].reverse()
  const offsets = reversed.map((s) => s.properties.offsetFromBanseokMin)
  return interpolateAlongStations(reversed, offsets, elapsedMin, lineShape.toPanam)
}

function SubwayTrainSimulation({ zoom = 15, stations, lineShape, headway, timetable, dayType, day, clockMin, visible, subwayRidership, subwayRidershipByAge }) {
  const stationsSorted = useMemo(() => {
    if (!stations) return []
    return [...stations.features].sort(
      (a, b) => Number(a.properties.stationNo) - Number(b.properties.stationNo)
    )
  }, [stations])

  // 공식 열차시각표(실제 출발 시각)가 있으면 그걸 쓰고, 없을 때만 예전처럼
  // 첫차~막차를 운행 횟수로 똑같이 나눈 시각(synthesizeDepartures)을 쓴다.
  // 균등 배분은 출퇴근 시간(5~6분 간격)과 낮(10분 간격)의 차이가 사라져서
  // 출퇴근 시간 열차 수가 적게 잡히고, 그만큼 1대당 탑승 인원이 많게 나왔다.
  const schedules = useMemo(() => {
    const official = timetable?.[dayType]
    const dayHeadway = headway?.[dayType]
    const result = {}
    for (const dir of SUBWAY_DIRECTIONS) {
      if (official?.[dir]?.length) result[dir] = official[dir]
      else if (dayHeadway?.[dir]) result[dir] = synthesizeDepartures(dayHeadway[dir])
    }
    return result
  }, [headway, timetable, dayType])

  if (!visible || stationsSorted.length === 0 || !lineShape) return null

  const trains = []
  for (const dir of SUBWAY_DIRECTIONS) {
    const orderedForDir = dir === '반석(칠성대)' ? stationsSorted : [...stationsSorted].reverse()
    const offsetsForDir = dir === '반석(칠성대)'
      ? orderedForDir.map((s) => s.properties.offsetFromPanamMin)
      : orderedForDir.map((s) => s.properties.offsetFromBanseokMin)
    const deps = schedules[dir] || []
    for (const dep of deps) {
      const elapsed = clockMin - dep
      if (elapsed < 0 || elapsed > 40) continue
      const info = getSubwayTrainPosition(stationsSorted, elapsed, dir, lineShape)
      if (!info) continue
      const occupancy = estimateSubwayOccupancy(orderedForDir, offsetsForDir, info.stationOrderIndex, dep, subwayRidership, day, deps)
      const elderlyRatio = estimateSubwayElderlyRatio(orderedForDir, offsetsForDir, info.stationOrderIndex, dep, subwayRidershipByAge, day, deps)
      trains.push({ key: `${dir}-${dep}`, ...info, occupancy, elderlyRatio })
    }
  }

  return (
    <>
      {trains.map((t) => (
        <Marker key={t.key} position={t.position} icon={getVehicleIcon('🚇', occupancyColor(t.occupancy, SUBWAY_CAPACITY), zoom < 13)} interactive pane="railTrainPane">
          <Popup>
            지하철 1호선
            <br />
            다음 역: {t.nextStationName}
            <br />
            속도: 약 {t.speedKmh}km/h (시각표 기반 추정)
            <br />
            탑승 인원: {t.occupancy != null ? `약 ${t.occupancy}명 (정원 ${SUBWAY_CAPACITY}명 기준 추정)` : '승하차 데이터 없음'}
            <br />
            노인 비율: {t.elderlyRatio != null ? `약 ${t.elderlyRatio}%` : '데이터 없음'}
            <br />
            <span style={{ color: '#888', fontSize: 11 }}>※ 역마다 탄 인원을 이후 역 하차 비중대로 나눠 추정</span>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

// ==========================================
// 트램 운행 시뮬레이션 (2호선, 아직 미개통 - 역 순서/분기점은 공식
// 자료로 확인했고 선형은 OSM에 올라온 공사중 선형(건설 중인 실제 궤도)
// 기준, 역간 소요시간은 표정속도를 거리비례로 배분한 추정치)
// ==========================================

const tramTrainIcon = L.divIcon({
  className: 'traffic-car-container',
  html: '<div class="traffic-car">🚊</div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

const TRAM_SERVICE_START_MIN = 330 // 05:30
const TRAM_SERVICE_END_MIN = 1470 // 다음날 00:30
const TRAM_MAINLINE_PEAK_HEADWAY = 8
const TRAM_MAINLINE_OFFPEAK_HEADWAY = 10.67
const TRAM_BRANCH_HEADWAY = 10.67
// OSM에 "service":"yard"로 잡힌 차량기지가 정부청사역에서 65m 거리(가장
// 가까운 역) - 본선 순환 열차는 전부 거기서 출고한다고 보고 그 역을
// 기준점으로 삼음. 지선은 차량기지에서 바로 이어지는 선형이 없어서
// (본선 경유 회송은 모델링 안 함) 기존대로 지선 첫 역을 기준점으로 둠.
const TRAM_MAINLINE_DEPOT_STATION = '정부청사(서구청·둔산경찰서·을지대병원)'

function isTramMainlinePeak(clockMin) {
  const m = ((clockMin % 1440) + 1440) % 1440
  return (m >= 420 && m < 540) || (m >= 1080 && m < 1200) // 07-09시, 18-20시
}

function tramOrderedStations(names, branch) {
  return names.map((name) => ({
    properties: { name },
    geometry: { coordinates: branch.line[branch.stationIndex[name]] },
  }))
}

function getTramTrainPosition(branch, elapsedMin, reverse) {
  const order = reverse ? [...branch.stationOrder].reverse() : branch.stationOrder
  const offsets = order.map((name) =>
    reverse ? branch.totalMin - branch.stationOffsetMin[name] : branch.stationOffsetMin[name]
  )
  return interpolateAlongStations(tramOrderedStations(order, branch), offsets, elapsedMin, branch)
}

// 본선은 루프라 한 바퀴 돌면 그대로 다음 바퀴로 이어짐(절대 안 사라짐).
// 지선은 루프가 아니라서 끝까지 갔다가 똑같이 거꾸로 돌아오는 왕복
// 셔틀로 돈다 - 그래서 "주기"가 루프는 totalMin, 지선은 totalMin*2(왕복).
// 루프(본선)는 cycleElapsed=0이 차량기지(정부청사역)가 되도록 기준점을
// 옮겨서, 열차가 서대전역이 아니라 실제 차고지에서 출고하는 것으로 봄.
function positionInCycle(branch, cycleElapsed, isLoop, reverse) {
  if (isLoop) {
    const depotOffset = reverse
      ? branch.totalMin - branch.stationOffsetMin[TRAM_MAINLINE_DEPOT_STATION]
      : branch.stationOffsetMin[TRAM_MAINLINE_DEPOT_STATION]
    const elapsedFromLoopZero = (cycleElapsed + depotOffset) % branch.totalMin
    return getTramTrainPosition(branch, elapsedFromLoopZero, reverse)
  }
  if (cycleElapsed <= branch.totalMin) return getTramTrainPosition(branch, cycleElapsed, false)
  return getTramTrainPosition(branch, cycleElapsed - branch.totalMin, true)
}

// headway만큼 간격을 두고 도는 열차 여러 대를 한 번에 계산. 각 열차는
// 서비스 시작(05:30) 시각에 자기 순번만큼(k*headway) 늦게 종점에서
// 출발하고, 그 뒤로는 절대 사라지지 않고 계속 순환/왕복함(그래서 05:30
// 직후엔 열차가 하나씩만 보이다가 첫 바퀴가 돌 때까지 점점 늘어남).
// 루프(본선)는 상행/하행이 각자 따로 도니까 reverse로 방향을 고정해서
// 넘김, 왕복 지선은 한 열차가 방향을 번갈아가며 왕복하는 거라 reverse
// 의미 없음.
function getCirculatingTrains(branch, effectiveClock, headwayMin, isLoop, reverse) {
  if (effectiveClock < TRAM_SERVICE_START_MIN) return []
  const period = isLoop ? branch.totalMin : branch.totalMin * 2
  const numTrains = Math.max(1, Math.round(period / headwayMin))
  const spacing = period / numTrains
  const positions = []
  for (let k = 0; k < numTrains; k++) {
    const entryTime = TRAM_SERVICE_START_MIN + k * spacing
    if (effectiveClock < entryTime) continue
    const cycleElapsed = (effectiveClock - entryTime) % period
    const position = positionInCycle(branch, cycleElapsed, isLoop, reverse)
    // trainId(k, 출발 순번)를 같이 넘겨서 React key가 "몇 번째로 그려졌는지"가
    // 아니라 "어느 열차인지"로 고정되게 함 - 안 그러면 운행 중인 열차 수가
    // 바뀔 때(05:30 이후 점점 늘어남) 팝업이 다른 열차로 튀어버림
    if (position) positions.push({ ...position, trainId: k })
  }
  return positions
}

function TramTrainSimulation({ lineShape, clockMin, visible }) {
  if (!visible || !lineShape) return null

  const effectiveClock = clockMin < TRAM_SERVICE_START_MIN ? clockMin + 1440 : clockMin
  if (effectiveClock > TRAM_SERVICE_END_MIN) return null

  const mainlineHeadway = isTramMainlinePeak(effectiveClock)
    ? TRAM_MAINLINE_PEAK_HEADWAY
    : TRAM_MAINLINE_OFFPEAK_HEADWAY

  const trains = []
  for (const reverse of [false, true]) {
    for (const info of getCirculatingTrains(lineShape.mainline, effectiveClock, mainlineHeadway, true, reverse)) {
      trains.push({ key: `mainline-${reverse}-${info.trainId}`, label: '트램 본선', ...info })
    }
  }
  for (const branchName of ['yeonchuk', 'jinjam']) {
    for (const info of getCirculatingTrains(lineShape[branchName], effectiveClock, TRAM_BRANCH_HEADWAY, false, false)) {
      trains.push({
        key: `${branchName}-${info.trainId}`,
        label: branchName === 'yeonchuk' ? '트램 연축지선' : '트램 진잠지선',
        ...info,
      })
    }
  }

  return (
    <>
      {trains.map((t) => (
        <Marker key={t.key} position={t.position} icon={tramTrainIcon} interactive pane="railTrainPane">
          <Popup>
            {t.label}
            <br />
            다음 역: {t.nextStationName}
            <br />
            속도: 약 {t.speedKmh}km/h (계획 배차 기반 추정)
            <br />
            정원: {TRAM_CAPACITY}명 (최대 {TRAM_MAX_CAPACITY}명)
            <br />
            <span style={{ color: '#888', fontSize: 11 }}>※ 개통 전이라 탑승 인원 자료 없음</span>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

// ==========================================
// 버스 운행 시뮬레이션 (선택한 노선 1개만 - 173개 노선 전부 동시에
// 띄우면 너무 많아서, 버스 패널에서 고른 노선만 움직이게 함)
//
// bus_route_lines.geojson(노선 선형)/bus_route_stops.json(정류소 순서)은
// 이미 로드돼있는 걸 재사용하고, bus_route_line_shape.json(이 두 파일을
// 정류소ID 기준으로 이어주는 인덱스+소요시간 배분만 담은 작은 파일)만
// 추가로 받아온다. 노선 하나는 "기점→종점→기점" 왕복 전체가 한 선형/
// 정류소목록으로 돼있어서(같은 이름 정류소가 왕복 양쪽에 다 나올 수
// 있어 stopId로 구분) 트램 본선 루프와 같은 방식(영구 순환)으로 돈다.
// ==========================================

// 대전 시내버스 주력 차종인 현대 뉴 슈퍼 에어로시티 초저상(CNG) 공식 카탈로그
// 승차정원 47명(좌석 24 + 입석 22 + 운전석 1)을 '만차' 기준으로 쓴다.
const BUS_CAPACITY = 47

// 대전 1호선 4량 1편성 승객 정원 474명(대전교통공사 차량 제원)을 '만차'(100%) 기준으로 쓴다.
const SUBWAY_CAPACITY = 474
// 대전 트램(2호선) 차량 1편성 승차정원 225명, 최대 승차인원 305명
const TRAM_CAPACITY = 225
const TRAM_MAX_CAPACITY = 305

function occupancyColor(count, capacity) {
  if (count == null) return '#9aa3ad' // 승하차 데이터 없는 노선/구간(회색)
  // 아이콘을 매 렌더마다 새로 만들지 않도록 5% 단위로 반올림해 캐시 크기를 제한
  const ratio = Math.round(Math.min(1, count / capacity) * 20) / 20
  const r = Math.round(37 + (220 - 37) * ratio)
  const g = Math.round(99 + (38 - 99) * ratio)
  const b = Math.round(235 + (38 - 235) * ratio)
  return `rgb(${r},${g},${b})`
}

const vehicleIconCache = new Map()

// 축소해서 볼 때(확대 레벨 14 미만)는 이모지 배지 대신 혼잡도 색 작은 점으로 그려 겹침을 줄인다
function getVehicleIcon(emoji, color, compact = false) {
  const key = `${emoji}|${color}|${compact}`
  if (!vehicleIconCache.has(key)) {
    vehicleIconCache.set(key, compact
      ? L.divIcon({
          className: 'traffic-car-container',
          html: `<div style="width:9px;height:9px;border-radius:50%;background:${color};border:1px solid #fff;box-shadow:0 0 1px #000"></div>`,
          iconSize: [9, 9],
          iconAnchor: [4.5, 4.5],
        })
      : L.divIcon({
          className: 'traffic-car-container',
          html: `<div class="traffic-car-badge" style="background:${color}"><span class="traffic-car">${emoji}</span></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }))
  }
  return vehicleIconCache.get(key)
}

const BUS_DWELL_MIN = 0.3

// "600"/"2230" 같은 HHMM 숫자문자열(공식 API 원본 포맷)을 분으로 변환
function parseBusClockMin(raw) {
  const s = String(raw).padStart(4, '0')
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2))
}

function getBusHeadwayMin(route, day) {
  if (day === '토') return route.intervalMinSat
  if (day === '일') return route.intervalMinSun
  return route.intervalMin
}

// 지하철/트램의 interpolateAlongStations와 같은 구조지만, 정류소를
// 이름이 아니라 stopId로 구분(왕복이라 같은 이름이 양쪽에 다 나올 수 있음).
// shape.stopIndex/stopOffsetMin은 정류소 ID가 아니라 "몇 번째 정류소인지"
// (배열 위치)로 나란히 저장돼 있음 - build_bus_line_shape.cjs 설명 참고
// (왕복 중 같은 정류소를 두 번 지나는 구간이 있어서 ID로는 구분이 안 됨).
function getBusPosition(lineCoords, shape, elapsedMin) {
  const { stopIndex, stopOffsetMin, stopIds } = shape

  for (let i = 0; i < stopOffsetMin.length - 1; i++) {
    const offsetA = stopOffsetMin[i]
    const offsetB = stopOffsetMin[i + 1]
    if (elapsedMin < offsetA || elapsedMin > offsetB) continue

    const span = offsetB - offsetA
    const dwell = Math.min(BUS_DWELL_MIN, span * 0.4)
    const tInSegment = elapsedMin - offsetA
    const fromStopId = stopIds[i]
    const toStopId = stopIds[i + 1]

    if (tInSegment < dwell) {
      const [lng, lat] = lineCoords[stopIndex[i]]
      return { position: [lat, lng], fromStopId, toStopId, stopSeqIndex: i, estSpeedKmh: 0 }
    }

    const travelSpan = span - dwell
    const frac = travelSpan > 0 ? (tInSegment - dwell) / travelSpan : 1
    const idxA = stopIndex[i]
    const idxB = stopIndex[i + 1]
    const lo = Math.min(idxA, idxB)
    const hi = Math.max(idxA, idxB)
    let segment = lineCoords.slice(lo, hi + 1)
    if (idxA > idxB) segment = [...segment].reverse()

    const distM = pathLengthMeters(segment)
    // 배차표상 역간 소요시간으로 역산한 추정 속도 - 아래 resolveBusSpeed가
    // route_segment_speed.json(포털 실측치)을 우선 쓰고, 그 구간/시간대
    // 데이터가 없을 때만 이 추정치로 대체함
    const estSpeedKmh = travelSpan > 0 ? Math.round((distM / 1000 / (travelSpan / 60)) * 10) / 10 : 0

    return { position: pointAtDistanceAlong(segment, distM * frac), fromStopId, toStopId, stopSeqIndex: i, estSpeedKmh }
  }
  return null
}

// route_stop_ridership.json/route_segment_speed.json 둘 다 평일/토/일
// 3단계로만 쪼개놨음(14일 원본이 그 이상 세분화하기엔 요일당 샘플이
// 너무 적어서) - dayToHeadwayType('평일'/'토요일'/'휴일')과 이름만 다름
function dayToSpeedDayType(day) {
  if (day === '토') return '토'
  if (day === '일') return '일'
  return '평일'
}

// route_segment_speed.json(대전교통포털 실측 15분 단위 구간속도, 요일구분별)을
// 먼저 찾아보고, 그 노선/구간/요일/시간대 데이터가 없으면 배차표 기반
// 추정치로 대체
function resolveBusSpeed(routeId, info, routeSegmentSpeed, day, timeLabel) {
  const dayType = dayToSpeedDayType(day)
  const real =
    routeSegmentSpeed?.routes?.[routeId]?.segments?.[`${info.fromStopId}>${info.toStopId}`]?.[dayType]?.[timeLabel]
  if (real != null) return { speedKmh: real, isReal: true }
  return { speedKmh: info.estSpeedKmh, isReal: false }
}

// route_stop_ridership.json은 시간대를 15분이 아니라 1시간 단위("06:00" 등)로만 담고 있음
function hourSlotLabel(min) {
  const wrapped = (((Math.floor(min / 60) % 24) + 24) % 24)
  return `${String(wrapped).padStart(2, '0')}:00`
}

// departures(그 방향 열차들의 출발 시각 목록) 중 특정 시간대(hourNum)에
// 출발한 열차 수 - 지하철 승하차 인원을 역별로 "그 시간대에 실제로 몇
// 대가 다녔는지"로 나눠 1대 몫만 반영하는 데 씀
function tripsInHour(deps, hourNum) {
  return deps.filter((d) => Math.floor((((d % 1440) + 1440) % 1440) / 60) === hourNum).length
}

// [수정] 차내 인원 추정 방식 변경 - "승차-하차 누적"에서 "비례 배분"으로.
// 원래 방식은 역/정류소 승하차가 양방향(또는 그 노선 전체 차량) 합계인데 그걸 열차 1대 기준으로
// 누적해서, 하차가 몰리는 역(시청·정부청사 등) 다음에서 0으로 뚝 떨어지고 종점에서도 사람이
// 남는 문제가 있었다. 이제는 i번째 역에서 탄 사람이 i역을 뺀 나머지 역들에 그 역들의 하차량
// 비율대로 내린다고 보고(방향도 그 비율로 나뉨), 그중 이 차량 진행 방향 뒤쪽에서 내릴 사람만
// 지금 차 안에 있다고 계산한다.
//   차내(u번째 역 출발 직후) = Σ_{i≤u} 승차_i × (Σ_{j>u} 하차_j) / (전체 하차 − 하차_i)
// 음수가 생기지 않고, 종점에서는 0, 중간에 갑자기 0이 되는 일이 없다.
function proportionalOnboard(boards, alights, uptoIndex) {
  const n = boards.length
  if (n === 0 || uptoIndex >= n - 1) return 0
  const suffix = new Array(n + 1).fill(0)
  for (let k = n - 1; k >= 0; k--) suffix[k] = suffix[k + 1] + Math.max(0, alights[k] || 0)
  const remain = suffix[uptoIndex + 1]
  let onboard = 0
  for (let i = 0; i <= uptoIndex; i++) {
    const others = suffix[0] - Math.max(0, alights[i] || 0)
    if (others > 0) onboard += Math.max(0, boards[i] || 0) * (remain / others)
  }
  return onboard
}

// 버스: 정류소별 승하차는 "그 시간대 그 노선 전체 버스"의 합계라 tripsPerHour로 나눠 1대 몫으로 쓴다.
// 버스는 왕복 노선이라 회차점(출발 정류소에서 가장 먼 정류소)에서 가는 방향/오는 방향을 나누고,
// 각 방향 안에서만 비례 배분한다(가는 방향에 탄 사람은 가는 방향 정류소에서 내림 → 회차점에서는
// 거의 비는 게 정상). 같은 stopId가 양방향에 다 나오면 값이 두 번 들어가므로 등장 횟수로 나눈다.
const busTurnCache = new WeakMap()
function getBusTurnIndex(shape, lineCoords) {
  if (!shape || !lineCoords) return -1
  if (busTurnCache.has(shape)) return busTurnCache.get(shape)
  const idx = shape.stopIndex || []
  const p0 = lineCoords[idx[0]]
  let best = -1
  let bestD = -1
  if (p0) {
    for (let i = 0; i < idx.length; i++) {
      const p = lineCoords[idx[i]]
      if (!p) continue
      const d = Math.hypot((p[0] - p0[0]) * 0.8, p[1] - p0[1])
      if (d > bestD) { bestD = d; best = i }
    }
  }
  busTurnCache.set(shape, best)
  return best
}

function estimateBusOccupancy(routeId, stopIds, stopOffsetMin, uptoIndex, entryTime, ridership, day, headwayMin, turnIdx = -1) {
  const stops = ridership?.routes?.[routeId]?.stops
  if (!stops) return null
  const dayType = dayToSpeedDayType(day)
  const tripsPerHour = headwayMin > 0 ? 60 / headwayMin : 1
  const seen = {}
  for (const id of stopIds) seen[id] = (seen[id] || 0) + 1
  const boards = [], alights = []
  for (let i = 0; i < stopIds.length; i++) {
    const hourLabel = hourSlotLabel(entryTime + (stopOffsetMin[i] ?? 0))
    const bucket = stops[stopIds[i]]?.byDay?.[dayType]?.[hourLabel]
    const k = tripsPerHour * (seen[stopIds[i]] || 1)
    boards.push(bucket ? bucket.board / k : 0)
    alights.push(bucket ? bucket.alight / k : 0)
  }
  const n = stopIds.length
  if (turnIdx <= 0 || turnIdx >= n - 1) return Math.round(proportionalOnboard(boards, alights, uptoIndex))
  if (uptoIndex < turnIdx) {
    const b = boards.slice(0, turnIdx + 1)
    b[turnIdx] = 0 // 회차점에서는 내리기만
    return Math.round(proportionalOnboard(b, alights.slice(0, turnIdx + 1), uptoIndex))
  }
  const a = alights.slice(turnIdx)
  a[0] = 0 // 회차점에서는 타기만
  return Math.round(proportionalOnboard(boards.slice(turnIdx), a, uptoIndex - turnIdx))
}

// 지하철: 역별 승하차(양방향 합계)를 그 시간대 이 방향 출발 열차 수로 나눠 1대 몫으로 쓴다.
function estimateSubwayOccupancy(orderedStations, offsets, uptoIndex, dep, ridership, day, deps) {
  const stations = ridership?.stations
  if (!stations) return null
  const dayType = dayToSpeedDayType(day)
  const boards = [], alights = []
  for (let i = 0; i < orderedStations.length; i++) {
    const hourLabel = hourSlotLabel(dep + (offsets[i] ?? 0))
    const divisor = Math.max(1, tripsInHour(deps, Number(hourLabel.slice(0, 2))))
    const bucket = stations[orderedStations[i].properties.stationNo]?.byDay?.[dayType]?.[hourLabel]
    boards.push(bucket ? bucket.board / divisor : 0)
    alights.push(bucket ? bucket.alight / divisor : 0)
  }
  return Math.round(proportionalOnboard(boards, alights, uptoIndex))
}

// 같은 비례 배분으로 노인/전체 차내 인원을 따로 구해 노인 비율(%)을 낸다.
// subway_station_ridership_by_age.json은 13일치(평일9/토2/일2)라 보조 지표로만 쓴다.
function estimateSubwayElderlyRatio(orderedStations, offsets, uptoIndex, dep, ridershipByAge, day, deps) {
  const stations = ridershipByAge?.stations
  if (!stations) return null
  const dayType = dayToSpeedDayType(day)
  const bE = [], aE = [], bT = [], aT = []
  for (let i = 0; i < orderedStations.length; i++) {
    const hourLabel = hourSlotLabel(dep + (offsets[i] ?? 0))
    const divisor = Math.max(1, tripsInHour(deps, Number(hourLabel.slice(0, 2))))
    const bucket = stations[orderedStations[i].properties.stationNo]?.byDay?.[dayType]?.[hourLabel]
    bE.push(bucket ? bucket.board.elderly / divisor : 0); aE.push(bucket ? bucket.alight.elderly / divisor : 0)
    bT.push(bucket ? bucket.board.total / divisor : 0); aT.push(bucket ? bucket.alight.total / divisor : 0)
  }
  const elderly = proportionalOnboard(bE, aE, uptoIndex)
  const total = proportionalOnboard(bT, aT, uptoIndex)
  if (total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((elderly / total) * 1000) / 10))
}

// 트램 본선 루프와 같은 영구 순환 모델: 첫차 시각에 1대만 출발, 이후
// 배차간격만큼씩 순서대로 출발해서 막차 시각까지 계속 왕복(기점→종점→
// 기점이 이미 한 선형 안에 다 들어있어서 그대로 한 바퀴 = totalMin).
function getCirculatingBuses(lineCoords, shape, effectiveClock, firstBusMin, lastBusMin, headwayMin) {
  const period = shape.totalMin
  // 막차 시각 이후엔 새로 출발하지 않을 뿐, 이미 출발한 버스는 한 바퀴를 끝까지 돈다
  // (예전엔 막차 시각이 되는 순간 길 위의 버스가 전부 사라졌음)
  if (effectiveClock < firstBusMin || effectiveClock > lastBusMin + period) return []
  const numBuses = Math.max(1, Math.round(period / headwayMin))
  const spacing = period / numBuses
  const positions = []

  for (let k = 0; k < numBuses; k++) {
    const entryTime = firstBusMin + k * spacing
    if (effectiveClock < entryTime) continue
    const cycleElapsed = (effectiveClock - entryTime) % period
    if (effectiveClock - cycleElapsed > lastBusMin) continue // 막차 이후에 시작될 바퀴 = 운행 종료
    const position = getBusPosition(lineCoords, shape, cycleElapsed)
    // trainId(출발 순번)를 같이 넘겨서 운행 중인 버스 대수가 바뀔 때도
    // React key가 "몇 번째 버스"가 아니라 "어느 버스"로 고정되게 함.
    // entryTime은 이 버스가 몇 분(절대 clockMin)에 출발했는지 - 정류소별
    // 실제 통과 시각을 역산(entryTime+stopOffsetMin[i])하는 데 씀
    if (position) positions.push({ ...position, trainId: k, entryTime })
  }
  return positions
}

function getBusPositionsForRoute(routeLine, route, shape, day, clockMin) {
  if (!routeLine || !route || !shape) return []

  // 자정을 넘긴 새벽(첫차 전)은 전날 운행의 연장이므로 전날 요일 배차를 쓴다
  // (0시에 요일이 바뀌면서 배차가 바뀌거나 '운행 없음'이 돼 버스가 사라지던 문제)
  const firstBusRaw = parseBusClockMin(route.firstBus)
  const serviceDay = clockMin < firstBusRaw
    ? DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(day) + 6) % 7] || day
    : day
  const headwayMin = getBusHeadwayMin(route, serviceDay)
  if (!headwayMin) return [] // 그 요일엔 운행 없음(예: 주말 운행 없는 광역노선)

  const firstBusMin = parseBusClockMin(route.firstBus)
  // 막차가 자정을 넘는 노선(1000번 00:00, B2 00:23, B4 00:01 등)은 다음 날 시각으로 본다
  let lastBusMin = parseBusClockMin(route.lastBus)
  if (lastBusMin <= firstBusMin) lastBusMin += 1440
  const effectiveClock = clockMin < firstBusMin ? clockMin + 1440 : clockMin

  return getCirculatingBuses(
    routeLine.geometry.coordinates,
    shape,
    effectiveClock,
    firstBusMin,
    lastBusMin,
    headwayMin
  )
}

function BusSimulation({ zoom = 15, routeLine, route, shape, day, clockMin, visible, routeStops, routeSegmentSpeed, routeStopRidership }) {
  if (!visible) return null

  const infos = getBusPositionsForRoute(routeLine, route, shape, day, clockMin)
  const timeLabel = timeSlotLabel(clockMin)
  const headwayMin = route ? getBusHeadwayMin(route, day) : null
  const stopNameById = new Map((routeStops || []).map((s) => [s.stopId, s.name]))

  return (
    <>
      {infos.map((info) => {
        const { speedKmh, isReal } = resolveBusSpeed(route.routeId, info, routeSegmentSpeed, day, timeLabel)
        const occupancy = estimateBusOccupancy(route.routeId, shape.stopIds, shape.stopOffsetMin, info.stopSeqIndex, info.entryTime, routeStopRidership, day, headwayMin, getBusTurnIndex(shape, routeLine?.geometry?.coordinates))
        return (
          <Marker key={`bus-${info.trainId}`} position={info.position} icon={getVehicleIcon('🚌', occupancyColor(occupancy, BUS_CAPACITY), zoom < 14)} interactive pane="busTrainPane">
            <Popup>
              {routeDisplayName(route)} 버스
              <br />
              다음 정류장: {stopNameById.get(info.toStopId) || info.toStopId}
              <br />
              속도: 약 {speedKmh}km/h ({isReal ? '실측' : '배차표 기반 추정'})
              <br />
              탑승 인원: {occupancy != null ? `약 ${occupancy}명 (정원 ${BUS_CAPACITY}명 기준 추정)` : '승하차 데이터 없음'}
              <br />
              <span style={{ color: '#888', fontSize: 11 }}>※ 정류소마다 탄 인원을 이후 정류소 하차 비중대로 나눠 추정(회차점에서 왕복 분리)</span>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// 전체 노선(141개) 동시 운행 - 노선마다 배차간격이 다 달라서 몇 대가
// 뜰진 미리 알 수 없음(배차 짧은 노선은 많이, 긴 노선은 적게).
function AllBusSimulation({ zoom = 15, routeLines, routeList, lineShapeMap, day, clockMin, visible, routeStops, routeSegmentSpeed, routeStopRidership, onlyRouteId = null }) {
  if (!visible || !routeLines || !lineShapeMap) return null

  const lineById = new Map(routeLines.features.map((f) => [f.properties.routeId, f]))
  const routeById = new Map(routeList.map((r) => [r.routeId, r]))
  const timeLabel = timeSlotLabel(clockMin)

  const buses = []
  for (const routeId of Object.keys(lineShapeMap)) {
    if (onlyRouteId && routeId !== onlyRouteId) continue // 노선을 고르면 그 노선 버스만
    const route = routeById.get(routeId)
    const shape = lineShapeMap[routeId]
    const infos = getBusPositionsForRoute(lineById.get(routeId), route, shape, day, clockMin)
    const headwayMin = route ? getBusHeadwayMin(route, day) : null
    const stopNameById = new Map((routeStops?.[routeId] || []).map((s) => [s.stopId, s.name]))
    infos.forEach((info) => {
      const { speedKmh, isReal } = resolveBusSpeed(routeId, info, routeSegmentSpeed, day, timeLabel)
      const occupancy = estimateBusOccupancy(routeId, shape.stopIds, shape.stopOffsetMin, info.stopSeqIndex, info.entryTime, routeStopRidership, day, headwayMin, getBusTurnIndex(shape, lineById.get(routeId)?.geometry?.coordinates))
      buses.push({
        key: `${routeId}-${info.trainId}`,
        position: info.position,
        routeNo: route?.routeNo,
        routeName: routeDisplayName(route),
        nextStopName: stopNameById.get(info.toStopId) || info.toStopId,
        speedKmh,
        isReal,
        occupancy,
      })
    })
  }

  return (
    <>
      {buses.map((b) => (
        <Marker key={b.key} position={b.position} icon={getVehicleIcon('🚌', occupancyColor(b.occupancy, BUS_CAPACITY), zoom < 14)} interactive pane="busTrainPane">
          <Popup>
            {b.routeName || `${b.routeNo}번`} 버스
            <br />
            다음 정류장: {b.nextStopName}
            <br />
            속도: 약 {b.speedKmh}km/h ({b.isReal ? '실측' : '배차표 기반 추정'})
            <br />
            탑승 인원: {b.occupancy != null ? `약 ${b.occupancy}명 (정원 ${BUS_CAPACITY}명 기준 추정)` : '승하차 데이터 없음'}
            <br />
            <span style={{ color: '#888', fontSize: 11 }}>※ 정류소마다 탄 인원을 이후 정류소 하차 비중대로 나눠 추정(회차점에서 왕복 분리)</span>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

// ==========================================
// 현재 화면 신호등 개수
// ==========================================

function ZoomTracker({ onZoomChange }) {
  const map = useMap()

  const updateCount = () => {
    onZoomChange(map.getZoom())
  }

  useMapEvents({
    moveend: updateCount,
    zoomend: updateCount,
  })

  useEffect(() => {
    updateCount()
  }, [])

  return null
}

// ==========================================
// 레이어 조작 패널
// ==========================================

function MapLegend({
  layers,
  onToggle,
  onAllOn,
  onAllOff,
  zoom,
}) {
  return (
    <div className="map-legend">
      <div className="legend-header">
        <div>
          <div className="legend-title">
            지도 레이어
          </div>
          <div className="legend-subtitle">
            켜고 끌 레이어를 선택하세요
          </div>
        </div>

        <div className="layer-count">
          {Object.values(layers).filter(Boolean).length}
          /{LAYER_ITEMS.length}
        </div>
      </div>

      <div className="legend-actions">
        <button type="button" onClick={onAllOn}>
          전체 켜기
        </button>

        <button type="button" onClick={onAllOff}>
          전체 끄기
        </button>
      </div>

      <div className="legend-list">
        {LAYER_GROUPS.map((group) => (
          <div key={group} className="legend-group">
            <div className="legend-group-title">{group}</div>
            {LAYER_ITEMS.filter((item) => item.group === group).map((item) => (
              <label
                className={`legend-item ${layers[item.id] ? 'active' : 'inactive'}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={Boolean(layers[item.id])}
                  onChange={() => onToggle(item.id)}
                />

                <span
                  className="legend-symbol line-symbol"
                  style={{
                    backgroundColor: item.color,
                  }}
                />

                <span className="legend-label">
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="legend-divider" />

      <div className="legend-info">
        <div>
          확대 레벨
          <strong>{zoom}</strong>
        </div>

        <div className="legend-note">
          정류소·시설·타슈는 확대 레벨 14, 건물은 15부터 표시됩니다.
        </div>
      </div>
    </div>
  )
}

// ==========================================
// 버스 노선 목록 / 상세 패널
// ==========================================

// ==========================================
// 지하철·트램 노선 패널: 역을 순서대로 세로로 나열하고, 지금 시각에 운행 중인
// 열차가 어느 역 사이를 지나는지(방향, 탑승 인원)를 보여준다.
// ==========================================

function computeSubwayLive({ stations, lineShape, timetable, headway, dayType, day, clockMin, ridership }) {
  if (!stations?.features || !lineShape) return null
  const sorted = [...stations.features].sort((a, b) => Number(a.properties.stationNo) - Number(b.properties.stationNo))
  const names = sorted.map((f) => f.properties.name)
  const n = names.length
  const trains = []
  for (const dir of SUBWAY_DIRECTIONS) {
    const deps = timetable?.[dayType]?.[dir]?.length
      ? timetable[dayType][dir]
      : headway?.[dayType]?.[dir] ? synthesizeDepartures(headway[dayType][dir]) : []
    const ordered = dir === '반석(칠성대)' ? sorted : [...sorted].reverse()
    const offsets = dir === '반석(칠성대)'
      ? ordered.map((s) => s.properties.offsetFromPanamMin)
      : ordered.map((s) => s.properties.offsetFromBanseokMin)
    for (const dep of deps) {
      const elapsed = clockMin - dep
      if (elapsed < 0 || elapsed > 40) continue
      const info = getSubwayTrainPosition(sorted, elapsed, dir, lineShape)
      if (!info) continue
      const occ = estimateSubwayOccupancy(ordered, offsets, info.stationOrderIndex, dep, ridership, day, deps)
      const k = info.stationOrderIndex
      // 판암→반석 목록 기준 "몇 번째 역 다음 구간"인지로 바꿔서 저장
      const seg = dir === '반석(칠성대)' ? k : n - 2 - k
      trains.push({ key: `${dir}-${dep}`, seg, down: dir === '반석(칠성대)', label: dir === '반석(칠성대)' ? '반석행' : '판암행', occ })
    }
  }
  return [{ name: '1호선 (판암 ↔ 반석)', stations: names, trains, capacity: SUBWAY_CAPACITY }]
}

function computeTramLive({ lineShape, clockMin }) {
  if (!lineShape) return null
  const effectiveClock = clockMin < TRAM_SERVICE_START_MIN ? clockMin + 1440 : clockMin
  const running = effectiveClock <= TRAM_SERVICE_END_MIN
  const headway = isTramMainlinePeak(effectiveClock) ? TRAM_MAINLINE_PEAK_HEADWAY : TRAM_MAINLINE_OFFPEAK_HEADWAY
  const lines = []
  const defs = [
    ['mainline', '2호선 본선 (순환)', true, headway],
    ['yeonchuk', '연축지선', false, TRAM_BRANCH_HEADWAY],
    ['jinjam', '진잠지선', false, TRAM_BRANCH_HEADWAY],
  ]
  for (const [key, name, isLoop, hw] of defs) {
    const branch = lineShape[key]
    if (!branch) continue
    const order = branch.stationOrder
    const n = order.length
    const trains = []
    if (running) {
      for (const reverse of isLoop ? [false, true] : [false]) {
        for (const info of getCirculatingTrains(branch, effectiveClock, hw, isLoop, reverse)) {
          // 지선은 한 열차가 왕복해서 다음 역 이름으로 방향을 판단
          const nextIdx = order.indexOf(info.nextStationName)
          let seg, down
          if (isLoop) {
            seg = reverse ? n - 2 - info.stationOrderIndex : info.stationOrderIndex
            down = !reverse
          } else {
            down = nextIdx >= 0 && order[info.stationOrderIndex + 1] === info.nextStationName
            seg = down ? info.stationOrderIndex : n - 2 - info.stationOrderIndex
          }
          trains.push({ key: `${key}-${reverse}-${info.trainId}`, seg, down, label: down ? '순방향' : '역방향', occ: null })
        }
      }
    }
    lines.push({ name: `${name} · 배차 ${Math.round(hw * 10) / 10}분`, stations: order, trains, capacity: null })
  }
  return lines
}

function RailLivePanel({ title, lines, onClose, clockMin, day, note }) {
  const hh = String(Math.floor((((clockMin % 1440) + 1440) % 1440) / 60)).padStart(2, '0')
  const mm = String(Math.floor(clockMin) % 60).padStart(2, '0')
  return (
    <div className="bus-panel">
      <div className="bus-panel-header">
        <div className="bus-panel-title">{title}</div>
        <button type="button" className="bus-panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="live-route-now" style={{ marginBottom: 6 }}>
        {hh}:{mm} ({day}) · 운행 중 {(lines || []).reduce((a, l) => a + l.trains.length, 0)}대
      </div>
      <div className="live-stop-list">
        {(lines || []).map((line) => {
          const bySeg = new Map()
          for (const t of line.trains) {
            const arr = bySeg.get(t.seg) || []
            arr.push(t)
            bySeg.set(t.seg, arr)
          }
          return (
            <div key={line.name} className="rail-line">
              <div className="live-route-ends" style={{ margin: '6px 0' }}>{line.name}</div>
              <ol className="live-stop-list" style={{ overflow: 'visible' }}>
                {line.stations.map((name, i) => {
                  const last = i === line.stations.length - 1
                  return (
                    <li className="live-stop" key={`${name}-${i}`}>
                      <div className="live-rail">
                        <span className="live-dot" />
                        {!last && <span className="live-seg" style={{ background: '#38bdf8' }} />}
                      </div>
                      <div className="live-body">
                        <div className="live-name">
                          <span className="live-seq">{i + 1}</span>
                          {name}
                        </div>
                        {(bySeg.get(i) || []).map((t) => {
                          const color = t.occ != null && line.capacity ? occupancyColor(t.occ, line.capacity) : '#38bdf8'
                          return (
                            <div className="live-bus" key={t.key} style={{ borderColor: color }}>
                              <span className="live-bus-icon" style={{ background: color }}>{t.down ? '↓' : '↑'}</span>
                              {t.label}
                              {t.occ != null && <b>{` 약 ${t.occ}명`}</b>}
                            </div>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </div>
      {note && <div className="live-legend"><span className="live-legend-note">{note}</span></div>}
    </div>
  )
}

// 노선 구분(routeType)에 따라 실제 부르는 이름으로 표시: 급행3번, 마을1번, 첨단2번 등
// (대전 BIS 노선유형 코드: 1 급행, 5 마을, 6 첨단 - build_route_stop_ridership.cjs와 같은 기준)
// 다른 노선 코드와 완전히 같은 중복 등록 노선(데이터는 남기고 화면에서만 제외)
const DUPLICATE_ROUTE_IDS = new Set(['69690138'])

const ROUTE_TYPE_PREFIX = { 1: '급행', 5: '마을', 6: '첨단' }
function routeDisplayName(route) {
  if (!route) return ''
  return `${ROUTE_TYPE_PREFIX[route.routeType] || ''}${route.routeNo}번`
}

// 구간 속도(km/h) → 노선도 색: 원활/서행/정체/정보 없음
function segmentSpeedColor(v) {
  if (v == null) return '#94a3b8'
  if (v >= 25) return '#22c55e'
  if (v >= 15) return '#facc15'
  return '#ef4444'
}

function BusRoutePanel({
  open,
  onToggle,
  routeList,
  routeStops,
  selectedRouteId,
  onSelectRoute,
  routeLine,
  shape,
  day,
  clockMin,
  routeSegmentSpeed,
  routeStopRidership,
}) {
  if (!open) return null

  const selectedRoute = routeList.find(
    (route) => route.routeId === selectedRouteId
  )

  // 이름이 같은 노선(B2번 2개, M1번 2개, 302번 2개)은 출발 정류소를 붙여 구분하고,
  // 출발 정류소까지 같으면 노선ID 끝 4자리를 붙인다.
  const baseCount = {}
  for (const r of routeList) baseCount[routeDisplayName(r)] = (baseCount[routeDisplayName(r)] || 0) + 1
  const firstStop = (r) => routeStops?.[r.routeId]?.[0]?.name || ''
  const panelName = (r) => {
    const base = routeDisplayName(r)
    if ((baseCount[base] || 0) < 2) return base
    const same = routeList.filter((x) => routeDisplayName(x) === base && firstStop(x) === firstStop(r)).length > 1
    return same ? `${base}(${String(r.routeId).slice(-4)})` : `${base}(${firstStop(r)} 출발)`
  }

  const selectedStops = selectedRouteId
    ? routeStops[selectedRouteId] || []
    : []

  return (
    <div className="bus-panel">
      <div className="bus-panel-header">
        <div className="bus-panel-title">
          {selectedRoute ? panelName(selectedRoute) : '버스 노선 목록'}
        </div>

        <button
          type="button"
          className="bus-panel-close"
          onClick={onToggle}
        >
          ✕
        </button>
      </div>

      {selectedRoute ? (
        <>
          <button
            type="button"
            className="bus-detail-back"
            onClick={() => onSelectRoute(null)}
          >
            ← 목록으로
          </button>

          <div className="bus-detail-stats">
            <div className="bus-detail-stat">
              <div className="bus-detail-stat-label">정류소</div>
              <div className="bus-detail-stat-value">{selectedRoute.busStopCount}개</div>
            </div>
            <div className="bus-detail-stat">
              <div className="bus-detail-stat-label">운행거리</div>
              <div className="bus-detail-stat-value">{selectedRoute.runDistKm ?? '?'}km</div>
            </div>
            <div className="bus-detail-stat">
              <div className="bus-detail-stat-label">편도 소요</div>
              <div className="bus-detail-stat-value">{selectedRoute.runTimeMin ?? '?'}분</div>
            </div>
            <div className="bus-detail-stat">
              <div className="bus-detail-stat-label">운행시간</div>
              <div className="bus-detail-stat-value">
                {selectedRoute.firstBus || '?'}–{selectedRoute.lastBus || '?'}
              </div>
            </div>
            <div className="bus-detail-stat bus-detail-stat-wide">
              <div className="bus-detail-stat-label">배차간격</div>
              <div className="bus-detail-stat-value">
                평일 {selectedRoute.intervalMin ?? '?'}분 · 주말{' '}
                {selectedRoute.intervalMinSat == null && selectedRoute.intervalMinSun == null
                  ? '운행 없음'
                  : `${selectedRoute.intervalMinSat ?? '?'}/${selectedRoute.intervalMinSun ?? '?'}분`}
              </div>
            </div>
          </div>

          <BusLiveStopList
            route={selectedRoute}
            stops={selectedStops}
            routeLine={routeLine}
            shape={shape}
            day={day}
            clockMin={clockMin}
            routeSegmentSpeed={routeSegmentSpeed}
            routeStopRidership={routeStopRidership}
          />
        </>
      ) : (
        <div className="bus-route-list">
          {routeList.map((route) => (
            <div
              className="bus-route-item"
              key={route.routeId}
              onClick={() => onSelectRoute(route.routeId)}
            >
              <span className="bus-route-no">{panelName(route)}</span>
              <span className="bus-route-meta">
                정류소 {route.busStopCount}개
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==========================================
// 선택한 버스 노선으로 지도 이동
// ==========================================

// 선택한 노선의 정류소를 순서대로 세로로 나열하고, 지금 시각에 운행 중인 버스가
// 어느 정류소 사이를 지나는지(몇 명 타고 있는지)와 구간별 실측 속도를 같이 보여준다.
function BusLiveStopList({ route, stops, routeLine, shape, day, clockMin, routeSegmentSpeed, routeStopRidership }) {
  if (!route || !stops?.length) return null
  const routeId = route.routeId
  const headwayMin = getBusHeadwayMin(route, day)
  const infos = shape && routeLine ? getBusPositionsForRoute(routeLine, route, shape, day, clockMin) : []
  const turnIdx = shape && routeLine ? getBusTurnIndex(shape, routeLine.geometry?.coordinates) : -1
  const dayType = dayToSpeedDayType(day)
  const timeLabel = timeSlotLabel(clockMin)
  const busesBySeg = new Map()
  for (const info of infos) {
    const occ = shape
      ? estimateBusOccupancy(routeId, shape.stopIds, shape.stopOffsetMin, info.stopSeqIndex, info.entryTime, routeStopRidership, day, headwayMin, turnIdx)
      : null
    const list = busesBySeg.get(info.stopSeqIndex) || []
    list.push({ key: info.trainId, occ })
    busesBySeg.set(info.stopSeqIndex, list)
  }
  const ids = shape?.stopIds || stops.map((s) => s.stopId)
  const speedAt = (i) =>
    i < ids.length - 1
      ? routeSegmentSpeed?.routes?.[routeId]?.segments?.[`${ids[i]}>${ids[i + 1]}`]?.[dayType]?.[timeLabel] ?? null
      : null
  const endName = turnIdx > 0 && stops[turnIdx] ? stops[turnIdx].name : stops[stops.length - 1]?.name
  const hh = String(Math.floor(((clockMin % 1440) + 1440) % 1440 / 60)).padStart(2, '0')
  const mm = String(Math.floor(clockMin) % 60).padStart(2, '0')

  return (
    <div className="live-route">
      <div className="live-route-head">
        <div className="live-route-ends">{stops[0]?.name} ↔ {endName}</div>
        <div className="live-route-now">
          {hh}:{mm} ({day}) · 운행 중 {infos.length}대{headwayMin ? ` · 배차 ${headwayMin}분` : ''}
        </div>
      </div>
      <ol className="live-stop-list">
        {stops.map((stop, i) => {
          const buses = busesBySeg.get(i) || []
          const color = segmentSpeedColor(speedAt(i))
          const last = i === stops.length - 1
          return (
            <li className="live-stop" key={`${stop.stopId}-${i}`}>
              <div className="live-rail">
                <span className={`live-dot${i === turnIdx ? ' turn' : ''}`} />
                {!last && <span className="live-seg" style={{ background: color }} />}
              </div>
              <div className="live-body">
                <div className="live-name">
                  <span className="live-seq">{i + 1}</span>
                  {stop.name || `정류소 ${stop.stopId}`}
                  {i === turnIdx && <span className="live-tag">회차</span>}
                </div>
                <div className="live-id">{stop.stopId}</div>
                {buses.map((b) => (
                  <div
                    className="live-bus"
                    key={b.key}
                    style={{ borderColor: occupancyColor(b.occ, BUS_CAPACITY) }}
                  >
                    <span className="live-bus-icon" style={{ background: occupancyColor(b.occ, BUS_CAPACITY) }}>🚌</span>
                    {stops[i + 1] ? `${stops[i + 1].name} 가는 중` : '종점 도착'}
                    <b>{b.occ != null ? ` 약 ${b.occ}명` : ' 인원 정보 없음'}</b>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="live-legend">
        <span><i style={{ background: '#22c55e' }} />원활</span>
        <span><i style={{ background: '#facc15' }} />서행</span>
        <span><i style={{ background: '#ef4444' }} />정체</span>
        <span><i style={{ background: '#94a3b8' }} />정보 없음</span>
        <span className="live-legend-note">구간 색 = 대전교통포털 실측 평균 속도</span>
      </div>
    </div>
  )
}

function FitBoundsOnRouteSelect({ routeId, routeLines }) {
  const map = useMap()

  useEffect(() => {
    if (!routeId || !routeLines) return

    const feature = routeLines.features.find(
      (f) => f.properties?.routeId === routeId
    )

    if (!feature) return

    const latLngs = feature.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng]
    )

    map.fitBounds(latLngs, { padding: [40, 40] })
  }, [routeId, routeLines, map])

  return null
}

function getSelectedRouteLine(routeLines, routeId) {
  if (!routeLines || !routeId) return null

  return (
    routeLines.features.find(
      (f) => f.properties?.routeId === routeId
    ) || null
  )
}

// 노선을 선택해서 자세히 볼 때(지도 확대 포함) 정류소마다 이름을 보여준다.
// 왕복 노선이라 같은 정류소를 두 번 지나기도 해서 stopId만으로는 key가
// 겹치니 배열 위치(index)까지 같이 써서 구분.
function SelectedRouteStopLabels({ stops, zoom }) {
  if (!stops || zoom < 13) return null

  return (
    <>
      {stops.map((stop, index) => (
        <CircleMarker
          key={`${stop.stopId}-${index}`}
          center={[stop.lat, stop.lng]}
          radius={4}
          color="#1e293b"
          weight={1}
          fillColor="#ffffff"
          fillOpacity={1}
        >
          <Tooltip permanent direction="top" className="subway-station-label">
            {stop.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

// ==========================================
// 보조 GeoJSON 레이어 로딩 훅
// ==========================================
//
// 실패해도 throw하지 않고 콘솔 경고만 남긴다 - 기본 지도 표시를 막으면 안 됨.

function useOptionalGeoJSON(url, label, setData) {
  useEffect(() => {
    let cancelled = false

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        console.warn(`${label} 레이어 로딩 실패:`, err)
      })

    return () => {
      cancelled = true
    }
  }, [url, label, setData])
}

// ==========================================
// 메인 지도
// ==========================================

export default function TransitMap() {
  const [mapData, setMapData] = useState(null)
  const [trafficLinkData, setTrafficLinkData] = useState(null)
  const [officialBusStops, setOfficialBusStops] = useState(null)
  const [busRouteLines, setBusRouteLines] = useState(null)
  const [busRouteListRaw, setBusRouteListRaw] = useState(null)
  const [populationData, setPopulationData] = useState(null)
  const [elderlyArea, setElderlyArea] = useState(null)
  const [stopCentrality, setStopCentrality] = useState(null)
  const [subwayStationsOfficial, setSubwayStationsOfficial] = useState(null)
  const [subwayRouteOfficial, setSubwayRouteOfficial] = useState(null)
  const [subwayTimetableOfficial, setSubwayTimetableOfficial] = useState(null)
  const [tramStationsOfficial, setTramStationsOfficial] = useState(null)
  const [hospitals, setHospitals] = useState(null)
  const [pharmacies, setPharmacies] = useState(null)
  const [welfareFacilities, setWelfareFacilities] = useState(null)
  const [welfareCenters, setWelfareCenters] = useState(null)
  const [tashuStations, setTashuStations] = useState(null)
  const [tashuUsage, setTashuUsage] = useState(null)
  const [schools, setSchools] = useState(null)
  const [markets, setMarkets] = useState(null)
  const [governmentOffices, setGovernmentOffices] = useState(null)
  const [buswayOfficial, setBuswayOfficial] = useState(null)
  const [buildingsOfficial, setBuildingsOfficial] = useState(null)
  const [subwayDay, setSubwayDay] = useState('월')
  const [subwayClockMin, setSubwayClockMin] = useState(8 * 60)
  const [subwayLineShape, setSubwayLineShape] = useState(null)
  const [tramLineShape, setTramLineShape] = useState(null)
  const [busLineShape, setBusLineShape] = useState(null)
  const [subwaySpeed, setSubwaySpeed] = useState(60)
  const [subwayStartTime, setSubwayStartTime] = useState('08:00')
  const [subwayRunning, setSubwayRunning] = useState(false)
  const [busRouteStops, setBusRouteStops] = useState({})
  const [routeSegmentSpeed, setRouteSegmentSpeed] = useState(null)
  const [routeStopRidership, setRouteStopRidership] = useState(null)
  const [subwayRidership, setSubwayRidership] = useState(null)
  const [subwayRidershipByAge, setSubwayRidershipByAge] = useState(null)
  const [busPanelOpen, setBusPanelOpen] = useState(false)
  // 왼쪽 아래 패널: 'subway' | 'tram' | null (버스는 busPanelOpen) - 한 번에 하나만 연다
  const [railPanel, setRailPanel] = useState(null)
  const openPanel = (which) => {
    if (which === 'bus') {
      setRailPanel(null)
      setBusPanelOpen((v) => !v)
    } else {
      setBusPanelOpen(false)
      setRailPanel((cur) => (cur === which ? null : which))
    }
  }
  const [selectedRouteId, setSelectedRouteId] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [zoom, setZoom] = useState(12)

  const [layers, setLayers] = useState(INITIAL_LAYER_STATE)

  // ========================================
  // 레이어 제어
  // ========================================

  const toggleLayer = (id) => {
    setLayers((previous) => ({
      ...previous,
      [id]: !previous[id],
    }))
  }

  const turnAllLayersOn = () => {
    setLayers(
      Object.fromEntries(
        LAYER_ITEMS.map((item) => [item.id, true])
      )
    )
  }

  const turnAllLayersOff = () => {
    setLayers(
      Object.fromEntries(
        LAYER_ITEMS.map((item) => [item.id, false])
      )
    )
  }

  // ========================================
  // 지도 데이터 로딩
  // ========================================

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        setError('')

        const mapResponse = await fetch(MAP_DATA_URL)

        if (!mapResponse.ok) {
          throw new Error(
            `기존 지도 데이터 오류: HTTP ${mapResponse.status}`
          )
        }

        const mapJson = await mapResponse.json()

        if (!mapJson.features) {
          throw new Error(
            'GeoJSON 파일 형식이 올바르지 않습니다.'
          )
        }

        if (!cancelled) {
          setMapData(mapJson)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  // ========================================
  // 보조 레이어 로딩 (실패해도 기본 지도는 계속 표시)
  // ========================================

  useOptionalGeoJSON(TRAFFIC_LINK_URL, '소통정보', setTrafficLinkData)
  useOptionalGeoJSON(BUS_STOPS_URL, '공식 버스정류소', setOfficialBusStops)
  useOptionalGeoJSON(BUS_ROUTE_LINES_URL, '버스 노선', setBusRouteLines)
  useOptionalGeoJSON(BUS_ROUTE_LIST_URL, '버스 노선 목록', setBusRouteListRaw)
  useOptionalGeoJSON(BUS_ROUTE_STOPS_URL, '버스 노선별 정류소', setBusRouteStops)

  // 승하차 원본(대전교통포털)과 노선 정류소 목록(BIS)의 정류소ID가 220곳에서 서로 달라
  // 그 정류소는 승하차가 0으로 빠졌다. 같은 노선 안에서 이름이 같은 정류소로 연결해 채운다.
  const routeStopRidershipMapped = useMemo(() => {
    if (!routeStopRidership?.routes || !busRouteStops) return routeStopRidership
    const norm = (t) => String(t || '').replace(/\s+/g, '')
    const routes = {}
    for (const [rid, r] of Object.entries(routeStopRidership.routes)) {
      const seq = busRouteStops[rid] || []
      const seqIds = new Set(seq.map((s) => s.stopId))
      const stops = { ...r.stops }
      const orphanByName = new Map()
      for (const [sid, st] of Object.entries(r.stops)) {
        if (!seqIds.has(sid)) orphanByName.set(norm(st.name), st)
      }
      for (const s of seq) {
        if (stops[s.stopId]) continue
        const hit = orphanByName.get(norm(s.name))
        if (hit) stops[s.stopId] = hit
      }
      routes[rid] = { ...r, stops }
    }
    return { ...routeStopRidership, routes }
  }, [routeStopRidership, busRouteStops])
  useOptionalGeoJSON(ROUTE_SEGMENT_SPEED_URL, '노선 구간 실측 속도', setRouteSegmentSpeed)
  useOptionalGeoJSON(ROUTE_STOP_RIDERSHIP_URL, '정류장별 승하차 인원', setRouteStopRidership)
  useOptionalGeoJSON(SUBWAY_STATION_RIDERSHIP_URL, '지하철역 승하차 인원', setSubwayRidership)
  useOptionalGeoJSON(SUBWAY_TIMETABLE_OFFICIAL_URL, '지하철 공식 열차시각표', setSubwayTimetableOfficial)
  useOptionalGeoJSON(SUBWAY_RIDERSHIP_BY_AGE_URL, '지하철역 연령별 승하차 인원', setSubwayRidershipByAge)
  useOptionalGeoJSON(POPULATION_URL, '고령인구 분포', setPopulationData)
  useOptionalGeoJSON(ELDERLY_AREA_URL, '행정동·구 고령인구', setElderlyArea)
  useOptionalGeoJSON(STOP_CENTRALITY_URL, '정류장 중심성', setStopCentrality)
  useOptionalGeoJSON(SUBWAY_STATIONS_URL, '지하철역(공식)', setSubwayStationsOfficial)
  useOptionalGeoJSON(SUBWAY_ROUTE_URL, '지하철 노선(공식)', setSubwayRouteOfficial)
  useOptionalGeoJSON(TRAM_STATIONS_URL, '트램 정거장(계획)', setTramStationsOfficial)
  useOptionalGeoJSON(HOSPITALS_URL, '병원·의원(공식)', setHospitals)
  useOptionalGeoJSON(PHARMACIES_URL, '약국(공식)', setPharmacies)
  useOptionalGeoJSON(WELFARE_FACILITIES_URL, '장애인 편의시설(공식)', setWelfareFacilities)
  useOptionalGeoJSON(WELFARE_CENTERS_URL, '복지시설(공식)', setWelfareCenters)
  useOptionalGeoJSON(TASHU_STATIONS_URL, '타슈 대여소', setTashuStations)
  useOptionalGeoJSON(TASHU_USAGE_URL, '타슈 대여·반납', setTashuUsage)
  useOptionalGeoJSON(SCHOOLS_URL, '학교', setSchools)
  useOptionalGeoJSON(MARKETS_URL, '전통시장', setMarkets)
  useOptionalGeoJSON(GOVERNMENT_OFFICES_URL, '행정기관', setGovernmentOffices)
  useOptionalGeoJSON(BUSWAY_OFFICIAL_URL, '버스전용도로(공식 구간)', setBuswayOfficial)
  useOptionalGeoJSON(BUILDINGS_URL, '건물(공식)', setBuildingsOfficial)
  useOptionalGeoJSON(SUBWAY_LINE_SHAPE_URL, '지하철 선형', setSubwayLineShape)
  useOptionalGeoJSON(TRAM_LINE_SHAPE_URL, '트램 선형', setTramLineShape)
  useOptionalGeoJSON(BUS_LINE_SHAPE_URL, '버스 노선 선형 인덱스', setBusLineShape)

  // 지하철/트램/버스 공용 시뮬레이션 시계 - speed=1이면 실제 시간과
  // 똑같이(1분/분), speed=240이면 240배 빠르게. 100ms마다 (speed/600)분씩 전진.
  useEffect(() => {
    const anyTrainLayer =
      layers.subwayTrains || layers.tramTrains || layers.busTrains || layers.busTrainsAll
    if (!anyTrainLayer || !subwayRunning) {
      return undefined
    }

    const minutesPerTick = subwaySpeed / 600

    const timer = setInterval(() => {
      setSubwayClockMin((m) => (m + minutesPerTick) % 1440)
    }, 100)

    return () => clearInterval(timer)
  }, [layers.subwayTrains, layers.tramTrains, layers.busTrains, layers.busTrainsAll, subwayRunning, subwaySpeed])

  // 재생 중 자정(24:00)을 넘으면 요일도 다음 날로 넘긴다(월 → 화 → … → 일 → 월).
  // 시간을 직접 입력해서 시각이 앞으로 돌아간 경우는 요일을 바꾸지 않는다.
  const prevClockRef = useRef(subwayClockMin)
  const manualSeekRef = useRef(false)
  useEffect(() => {
    const prev = prevClockRef.current
    prevClockRef.current = subwayClockMin
    if (manualSeekRef.current) {
      manualSeekRef.current = false
      return
    }
    if (subwayRunning && subwayClockMin < prev) {
      setSubwayDay((d) => DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(d) + 1) % DAYS_OF_WEEK.length])
    }
  }, [subwayClockMin, subwayRunning])

  // 스페이스바로 재생/정지 토글 - 입력창에 타이핑 중일 땐 막음(스크롤도 막아야
  // 페이지가 같이 안 움직임)
  useEffect(() => {
    const anyTrainLayer =
      layers.subwayTrains || layers.tramTrains || layers.busTrains || layers.busTrainsAll
    if (!anyTrainLayer) return undefined

    function onKeyDown(e) {
      if (e.code !== 'Space') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      // 캡처 단계 + stopPropagation: leaflet이 지도에 포커스가 있을 때
      // 스페이스바를 자체 확대 단축키로 먼저 가로채는 걸 막음
      e.preventDefault()
      e.stopPropagation()
      setSubwayRunning((r) => !r)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [layers.subwayTrains, layers.tramTrains, layers.busTrains, layers.busTrainsAll])

  // 대전 BIS에 같은 노선이 코드만 다르게 두 번 들어 있는 경우(302번: 30300158 대전 등록 / 69690138 계룡 경유 등록,
  // 정류소 83개·시간표 모두 동일)는 화면과 시뮬레이션에서 한 번만 쓴다. 원본 데이터 파일은 그대로 둔다.
  const busRouteList = useMemo(
    () => (busRouteListRaw?.routes || []).filter((r) => !DUPLICATE_ROUTE_IDS.has(r.routeId)),
    [busRouteListRaw]
  )
  const routeIndex = useMemo(() => buildRouteIndex(busRouteList, busRouteStops), [busRouteListRaw, busRouteStops])
  const routeIndexKey = `${routeIndex.ids.size}-${Object.keys(busRouteStops || {}).length}`

  // ========================================
  // 메인 화면
  // ========================================

  return (
    <div className="transit-map-wrapper">

      <style>{`
        .transit-map-wrapper {
          --panel-bg: rgba(18, 22, 30, 0.92);
          --panel-border: rgba(255, 255, 255, 0.09);
          --text-primary: #eef1f5;
          --text-secondary: #9aa4b5;
          --text-muted: #6b7686;
          --accent: #3987e5;
          --accent-soft: rgba(57, 135, 229, 0.16);
          --good: #2bb673;
          --critical: #e4685f;
          --divider: rgba(255, 255, 255, 0.1);

          width: 100%;
          height: 100%;
          min-height: 600px;
          position: relative;
          background: #0d1117;
          overflow: hidden;
          font-family: 'IBM Plex Sans KR', system-ui, -apple-system, sans-serif;
        }

        .transit-map {
          width: 100%;
          height: 100%;
          min-height: 600px;
          background: #dce3e8;
        }

        .map-status,
        .map-legend,
        .bus-panel-toggle,
        .bus-panel {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          color: var(--text-primary);
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }

        .app-navbar {
          position: absolute;
          z-index: 1400;
          top: 0;
          left: 0;
          right: 0;
          height: 52px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 18px;
          background: rgba(10, 13, 19, 0.92);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--divider);
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.01em;
        }

        .app-navbar-mark {
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .elderly-legend {
          position: absolute; right: 252px; bottom: 25px; z-index: 1200;
          background: rgba(15, 23, 42, 0.9); color: #e2e8f0; border-radius: 10px;
          padding: 8px 12px; font-size: 12px; line-height: 1.6; pointer-events: none;
        }
        .elderly-legend { display: flex; gap: 14px; align-items: flex-start; }
        .elderly-legend-title { font-weight: 700; margin-bottom: 2px; }
        .elderly-legend-row { display: flex; align-items: center; gap: 6px; }
        .elderly-legend-row i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
        .elderly-legend-note { color: #94a3b8; font-size: 11px; margin-top: 2px; }
        .leaflet-tooltip.elderly-gu-label {
          background: rgba(15, 23, 42, 0.8); color: #fff; border: 0; box-shadow: none;
          font-weight: 700; font-size: 12px; padding: 2px 6px;
        }
        .leaflet-tooltip.elderly-gu-label::before { display: none; }
        .map-status {
          position: absolute;
          z-index: 1200;
          top: 66px;
          left: 60px;
          padding: 11px 15px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.7;
          pointer-events: none;
        }

        .map-status strong {
          color: var(--good);
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .map-legend {
          position: absolute;
          z-index: 1200;
          right: 14px;
          bottom: 25px;
          width: 224px;
          max-height: calc(100% - 50px);
          display: flex;
          flex-direction: column;
          padding: 15px;
          border-radius: 12px;
          font-size: 12px;
          pointer-events: auto;
          overflow: hidden;
        }

        .leaflet-top.leaflet-left {
          z-index: 1300;
          top: 62px;
        }

        /* 버스/지하철/트램 클릭 팝업(기본 z-index 700)이 범례·버스패널
           (z-index 1200)보다 아래라 그 밑에 깔린 차량을 클릭하면 팝업이
           패널에 가려 안 보였음 - 더 위로 올림 */
        .leaflet-popup-pane {
          z-index: 1300;
        }

        .left-dock {
          position: absolute;
          z-index: 1200;
          top: 66px;
          left: 60px;
          bottom: 78px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          pointer-events: none;
        }
        .left-dock .map-status { position: static; }
        .left-dock .bus-panel {
          position: static;
          pointer-events: auto;
          flex: 1 1 auto;
          min-height: 0;
          max-height: none;
          width: 300px;
        }
        .panel-toggles {
          position: absolute;
          z-index: 1200;
          left: 14px;
          bottom: 25px;
          display: flex;
          gap: 8px;
        }
        .panel-toggles .bus-panel-toggle { position: static; }
        .bus-panel-toggle.active { border-color: var(--accent); }
        .rail-line { margin-bottom: 8px; }

        .bus-panel-toggle {
          position: absolute;
          z-index: 1200;
          left: 14px;
          bottom: 25px;
          padding: 10px 15px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .bus-panel-toggle:hover {
          background: rgba(28, 33, 43, 0.96);
          border-color: var(--accent);
        }

        .bus-panel {
          position: absolute;
          z-index: 1200;
          left: 56px;
          bottom: 25px;
          width: 280px;
          max-height: calc(100% - 50px);
          display: flex;
          flex-direction: column;
          padding: 15px;
          border-radius: 12px;
          font-size: 12px;
          overflow: hidden;
        }

        .live-route { display: flex; flex-direction: column; min-height: 0; flex: 1; }
        .live-route-head { padding: 6px 2px 8px; border-bottom: 1px solid var(--panel-border); margin-bottom: 6px; }
        .live-route-ends { font-size: 12px; color: var(--text-primary); font-weight: 600; }
        .live-route-now { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
        .live-stop-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; flex: 1; }
        .live-stop { display: flex; gap: 8px; }
        .live-rail { position: relative; width: 14px; flex-shrink: 0; }
        .live-dot { position: absolute; top: 6px; left: 3px; width: 8px; height: 8px; border-radius: 50%; background: #0f172a; border: 2px solid #e2e8f0; z-index: 1; }
        .live-dot.turn { background: #f97316; border-color: #fff; }
        .live-seg { position: absolute; top: 12px; bottom: -6px; left: 5px; width: 4px; border-radius: 2px; }
        .live-body { padding: 2px 0 10px; min-width: 0; flex: 1; }
        .live-name { font-size: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
        .live-seq { font-size: 10px; color: var(--text-secondary); min-width: 18px; }
        .live-tag { font-size: 10px; background: #f97316; color: #fff; border-radius: 6px; padding: 0 5px; }
        .live-id { font-size: 10px; color: var(--text-secondary); margin-left: 24px; }
        .live-bus { margin: 5px 0 0 20px; font-size: 11px; color: var(--text-primary); border: 1px solid; border-radius: 10px; padding: 2px 8px 2px 2px; display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.04); }
        .live-bus-icon { width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
        .live-legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: var(--text-secondary); padding-top: 6px; border-top: 1px solid var(--panel-border); margin-top: 4px; }
        .live-legend i { display: inline-block; width: 10px; height: 4px; border-radius: 2px; margin-right: 3px; vertical-align: middle; }
        .live-legend-note { width: 100%; }

        .bus-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          margin-bottom: 10px;
        }

        .bus-panel-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .bus-panel-close {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 16px;
          cursor: pointer;
        }

        .bus-route-list {
          overflow-y: auto;
          min-height: 0;
        }

        .bus-route-item {
          display: flex;
          justify-content: space-between;
          padding: 7px 8px;
          border-radius: 6px;
          cursor: pointer;
          margin: 2px 0;
        }

        .bus-route-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .bus-route-no {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          color: var(--accent);
        }

        .bus-route-meta {
          color: var(--text-secondary);
          font-size: 11px;
        }

        .bus-detail-back {
          flex-shrink: 0;
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--panel-border);
          color: var(--text-primary);
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 11px;
          cursor: pointer;
          margin-bottom: 10px;
        }

        .bus-detail-stats {
          flex-shrink: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 14px;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--divider);
        }

        .bus-detail-stat-wide {
          grid-column: 1 / -1;
        }

        .bus-detail-stat-label {
          font-size: 10px;
          color: var(--text-muted);
        }

        .bus-detail-stat-value {
          font-size: 13px;
          color: var(--text-primary);
          margin-top: 2px;
          font-variant-numeric: tabular-nums;
        }

        .bus-stop-list {
          overflow-y: auto;
          min-height: 0;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .bus-stop-row {
          display: flex;
          gap: 8px;
          padding: 4px 2px;
          border-bottom: 1px solid var(--divider);
        }

        .bus-stop-seq {
          color: var(--text-muted);
          width: 20px;
          flex-shrink: 0;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .legend-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          margin-bottom: 12px;
        }

        .legend-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .legend-subtitle {
          margin-top: 3px;
          color: var(--text-muted);
          font-size: 10px;
        }

        .layer-count {
          color: var(--good);
          font-size: 12px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .legend-actions {
          display: flex;
          gap: 6px;
          margin-bottom: 10px;
          flex-shrink: 0;
        }

        .legend-actions button {
          flex: 1;
          padding: 7px 4px;
          border: 1px solid var(--panel-border);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          font-size: 11px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .legend-actions button:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: var(--accent);
        }

        .day-select {
          display: flex;
          gap: 3px;
          margin: 4px 0;
          pointer-events: auto;
        }

        .day-select button {
          padding: 2px 6px;
          border: 1px solid var(--panel-border);
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
          font-size: 10px;
          cursor: pointer;
        }

        .day-select button.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #0b0f14;
          font-weight: 600;
        }

        .subway-sim-controls {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 4px 0;
          font-size: 11px;
          pointer-events: auto;
        }

        .subway-sim-controls input[type='time'] {
          font-size: 11px;
          padding: 1px 4px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid var(--panel-border);
          border-radius: 5px;
          font-family: 'IBM Plex Mono', monospace;
        }

        .subway-sim-controls input[type='range'] {
          width: 90px;
          accent-color: var(--accent);
        }

        .subway-sim-toggle {
          padding: 3px 8px;
          border: 1px solid var(--panel-border);
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--good);
          font-size: 11px;
          cursor: pointer;
        }

        .subway-sim-toggle:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: var(--accent);
        }

        .legend-list {
          overflow-y: auto;
          min-height: 0;
          padding-right: 3px;
        }

        .legend-list::-webkit-scrollbar {
          width: 5px;
        }

        .legend-list::-webkit-scrollbar-thumb {
          background: var(--panel-border);
          border-radius: 5px;
        }

        .legend-group + .legend-group {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--divider);
        }

        .legend-group-title {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 30px;
          margin: 2px 0;
          padding: 3px 5px;
          border-radius: 6px;
          cursor: pointer;
          user-select: none;
        }

        .legend-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .legend-item input {
          width: 14px;
          height: 14px;
          margin: 0;
          accent-color: var(--accent);
          cursor: pointer;
          flex-shrink: 0;
        }

        .legend-item.inactive {
          color: var(--text-muted);
        }

        .legend-symbol {
          display: inline-block;
          flex-shrink: 0;
        }

        .line-symbol {
          width: 22px;
          height: 4px;
          border-radius: 4px;
        }

        .legend-label {
          flex: 1;
        }

        .legend-divider {
          height: 1px;
          flex-shrink: 0;
          background: var(--divider);
          margin: 10px 0;
        }

        .legend-info {
          flex-shrink: 0;
          color: var(--text-secondary);
          font-size: 10px;
          line-height: 1.8;
        }

        .legend-info > div:not(.legend-note) {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .legend-info strong {
          color: var(--critical);
          font-variant-numeric: tabular-nums;
          font-family: 'IBM Plex Mono', monospace;
        }

        .legend-note {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid var(--divider);
          color: var(--text-muted);
          font-size: 10px;
        }

        .traffic-car-container {
          background: transparent;
          border: none;
        }

        .traffic-car {
          font-size: 16px;
          line-height: 20px;
          filter: drop-shadow(
            0 1px 2px rgba(0,0,0,0.7)
          );
        }

        .traffic-car-badge {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }

        .tram-route-line {
          filter: drop-shadow(0 0 2px rgba(0, 80, 70, 0.9));
        }

        .map-error {
          position: absolute;
          z-index: 1500;
          top: 15px;
          left: 15px;
          right: 15px;
          padding: 20px;
          border-radius: 10px;
          color: #fecaca;
          background: #3a1214;
          border: 1px solid rgba(228, 104, 95, 0.4);
          font-size: 14px;
        }

        .leaflet-container {
          font-family: 'IBM Plex Sans KR', system-ui, sans-serif;
        }

        /* leaflet 기본 컨트롤(줌, 레이어)도 같은 다크 테마로 맞춤 */
        .leaflet-bar,
        .leaflet-control-layers {
          background: var(--panel-bg) !important;
          border: 1px solid var(--panel-border) !important;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
        }

        .leaflet-bar a {
          background: transparent !important;
          color: var(--text-primary) !important;
          border-bottom: 1px solid var(--panel-border) !important;
        }

        .leaflet-bar a:hover {
          background: rgba(255, 255, 255, 0.08) !important;
        }

        .leaflet-control-layers-toggle {
          filter: invert(1) brightness(1.6);
        }

        .leaflet-control-layers-expanded {
          color: var(--text-primary);
          font-size: 12px;
          padding: 10px 12px;
        }

        .leaflet-control-layers-selector {
          accent-color: var(--accent);
        }

        .leaflet-control-attribution {
          background: rgba(18, 22, 30, 0.75) !important;
          color: var(--text-muted) !important;
        }

        .leaflet-control-attribution a {
          color: var(--text-secondary) !important;
        }

        @media (max-width: 600px) {
          .map-legend {
            width: 190px;
            right: 8px;
            bottom: 8px;
            max-height: 65%;
            padding: 10px;
          }

          .map-status {
            top: 60px;
            left: 50px;
            font-size: 10px;
          }

          .bus-panel {
            width: 190px;
            left: 8px;
            bottom: 8px;
            max-height: 65%;
            padding: 10px;
          }

          .bus-panel-toggle {
            left: 8px;
            bottom: 8px;
          }
        }
      `}</style>

      <div className="app-navbar">
        <div className="app-navbar-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 17h16M6 17V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8M8 21v-2M16 21v-2" stroke="#0b0f14" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        대전 교통 시뮬레이션
      </div>

      {loading && (
        <div className="map-status">
          <strong>불러오는 중</strong>
          <br />
          대전 교통 데이터를 가져오고 있습니다...
        </div>
      )}

      {error && (
        <div className="map-error">
          지도 데이터 로딩 실패: {error}
          <br />
          public/data 폴더의 두 GeoJSON 파일을 확인하세요.
          <br />
          {error}
        </div>
      )}

      {mapData && (
        <>
          <div className="left-dock">
          <div className="map-status">
            <strong>대전 교통 현황</strong>
            <br />
            확대 레벨: {zoom}
            {(layers.subwayTrains || layers.tramTrains || layers.busTrains || layers.busTrainsAll) && (
              <>
                <br />
                <div className="day-select">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day}
                      className={day === subwayDay ? 'active' : ''}
                      onClick={() => setSubwayDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="subway-sim-controls">
                  <input
                    type="time"
                    value={subwayStartTime}
                    onChange={(e) => {
                      // 시간을 바꾸면 그 시각으로 바로 이동(탐색) - 재생/정지
                      // 상태는 그대로 두고, 정지해 있던 자리에서 재생 누르면
                      // 리셋되지 않고 그 자리부터 이어서 재생되게 함
                      setSubwayStartTime(e.target.value)
                      const [h, m] = e.target.value.split(':').map(Number)
                      if (Number.isFinite(h) && Number.isFinite(m)) {
                        manualSeekRef.current = true
                        setSubwayClockMin(h * 60 + m)
                      }
                    }}
                  />
                  <button className="subway-sim-toggle" onClick={() => setSubwayRunning((r) => !r)}>
                    {subwayRunning ? '정지 (Space)' : '재생 (Space)'}
                  </button>
                </div>
                <div className="subway-sim-controls">
                  배속
                  <input
                    type="range"
                    min="1"
                    max="240"
                    value={subwaySpeed}
                    onChange={(e) => setSubwaySpeed(Number(e.target.value))}
                  />
                  {subwaySpeed}x
                </div>
                시각: {String(Math.floor(subwayClockMin / 60)).padStart(2, '0')}:
                {String(Math.floor(subwayClockMin) % 60).padStart(2, '0')} ({subwayDay})
              </>
            )}
          </div>

          {railPanel === 'subway' && (
            <RailLivePanel
              title="지하철 1호선"
              day={subwayDay}
              clockMin={subwayClockMin}
              onClose={() => setRailPanel(null)}
              note="↓ 반석행, ↑ 판암행 · 공식 시각표 기준 · 탑승 인원은 2026년 1~10월 승하차 평균으로 추정"
              lines={computeSubwayLive({
                stations: subwayStationsOfficial,
                lineShape: subwayLineShape,
                timetable: subwayTimetableOfficial,
                headway: subwayRouteOfficial?.features?.[0]?.properties?.headway,
                dayType: dayToHeadwayType(subwayDay),
                day: subwayDay,
                clockMin: subwayClockMin,
                ridership: subwayRidership,
              })}
            />
          )}
          {railPanel === 'tram' && (
            <RailLivePanel
              title="트램 2호선 (개통 예정)"
              day={subwayDay}
              clockMin={subwayClockMin}
              onClose={() => setRailPanel(null)}
              note={`개통 전이라 실측 자료 없음 · 첨두(07~09, 18~20시) 8분, 그 외 10.67분 배차로 가정 · 1편성 정원 ${TRAM_CAPACITY}명(최대 ${TRAM_MAX_CAPACITY}명)`}
              lines={computeTramLive({ lineShape: tramLineShape, clockMin: subwayClockMin })}
            />
          )}
          <BusRoutePanel
            open={busPanelOpen}
            onToggle={() => setBusPanelOpen(false)}
            routeList={busRouteList}
            routeStops={busRouteStops}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            routeLine={getSelectedRouteLine(busRouteLines, selectedRouteId)}
            shape={busLineShape?.[selectedRouteId]}
            day={subwayDay}
            clockMin={subwayClockMin}
            routeSegmentSpeed={routeSegmentSpeed}
            routeStopRidership={routeStopRidershipMapped}
          />
          </div>

          <div className="panel-toggles">
            <button type="button" className={`bus-panel-toggle${railPanel === 'subway' ? ' active' : ''}`} onClick={() => openPanel('subway')}>🚇 지하철</button>
            <button type="button" className={`bus-panel-toggle${railPanel === 'tram' ? ' active' : ''}`} onClick={() => openPanel('tram')}>🚊 트램</button>
            <button type="button" className={`bus-panel-toggle${busPanelOpen ? ' active' : ''}`} onClick={() => openPanel('bus')}>🚌 버스 노선</button>
          </div>

          <MapContainer
            center={MAP_CENTER}
            zoom={12}
            minZoom={10}
            maxZoom={19}
            maxBounds={MAP_BOUNDS}
            maxBoundsViscosity={0.8}
            className="transit-map"
            zoomControl={true}
            preferCanvas={true}
          >
            <ZoomTracker onZoomChange={setZoom} />

            <FitBoundsOnRouteSelect
              routeId={selectedRouteId}
              routeLines={busRouteLines}
            />

            <LayersControl position="topleft">
              <LayersControl.BaseLayer checked name="밝은 테마">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                  maxNativeZoom={13}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="어두운 테마">
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                  maxNativeZoom={16}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            {/* 지도 레이어별 표시 순서 지정 */}

            <Pane name="populationPane" style={{ zIndex: 405 }}>
              {layers.population && populationData && (
                <GeoJSON
                  key="population-layer"
                  data={populationData}
                  style={getPopulationStyle}
                  onEachFeature={bindPopulationPopup}
                />
              )}
              {layers.elderlyDong && elderlyArea && (
                <GeoJSON
                  key="elderly-dong-layer"
                  data={elderlyArea.dong}
                  style={getElderlyAreaStyle}
                  onEachFeature={makeBindElderlyAreaPopup(elderlyArea.dong, false)}
                />
              )}
              {layers.elderlyGu && elderlyArea && (
                <GeoJSON
                  key="elderly-gu-layer"
                  data={elderlyArea.gu}
                  style={getElderlyAreaStyle}
                  onEachFeature={makeBindElderlyAreaPopup(elderlyArea.gu, true)}
                />
              )}
              {layers.elderlyCountOa && populationData && (
                <GeoJSON
                  key="elderly-count-oa-layer"
                  data={populationData}
                  style={getElderlyCountOaStyle}
                  onEachFeature={bindPopulationPopup}
                />
              )}
              {layers.elderlyCountDong && elderlyArea && (
                <GeoJSON
                  key="elderly-count-dong-layer"
                  data={elderlyArea.dong}
                  style={getElderlyCountAreaStyle}
                  onEachFeature={makeBindElderlyAreaPopup(elderlyArea.dong, false, 'count')}
                />
              )}
              {layers.elderlyCountGu && elderlyArea && (
                <GeoJSON
                  key="elderly-count-gu-layer"
                  data={elderlyArea.gu}
                  style={getElderlyCountAreaStyle}
                  onEachFeature={makeBindElderlyAreaPopup(elderlyArea.gu, true, 'count')}
                />
              )}
            </Pane>

            <Pane name="roadPane" style={{ zIndex: 410 }}>
              {layers.motorway && (
                <GeoJSON
                  key="motorway-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'motorway')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.majorRoad && (
                <GeoJSON
                  key="major-road-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'majorRoad')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.secondaryRoad && (
                <GeoJSON
                  key="secondary-road-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'secondaryRoad')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.localRoad && (
                <GeoJSON
                  key="local-road-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'localRoad')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.footway && (
                <GeoJSON
                  key="footway-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'footway')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.cycleway && (
                <GeoJSON
                  key="cycleway-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'cycleway')
                  }
                  style={getRoadStyle}
                />
              )}

              {layers.busway && (
                <GeoJSON
                  key="busway-layer"
                  data={mapData}
                  filter={(feature) =>
                    shouldDisplayRoad(feature, 'busway')
                  }
                  style={getRoadStyle}
                />
              )}
            </Pane>

            <Pane name="buswayOfficialPane" style={{ zIndex: 417 }}>
              {layers.busway && buswayOfficial && (
                <GeoJSON
                  key="busway-official-layer"
                  data={buswayOfficial}
                  style={getBuswayOfficialStyle}
                  onEachFeature={bindBuswayOfficialPopup}
                />
              )}
            </Pane>

            <Pane name="trafficLinkPane" style={{ zIndex: 415 }}>
              {layers.trafficLinks && trafficLinkData && (
                <GeoJSON
                  key="traffic-link-layer"
                  data={trafficLinkData}
                  style={getTrafficLinkStyle}
                  onEachFeature={bindTrafficLinkPopup}
                />
              )}
            </Pane>

            <Pane name="busRouteLinePane" style={{ zIndex: 416 }}>
              {layers.busRouteLines && busRouteLines && (
                <GeoJSON
                  key={`bus-route-line-layer-${routeIndexKey}`}
                  data={busRouteLines}
                  filter={(f) => routeIndex.ids.has(f.properties?.routeId)}
                  style={getBusRouteLineStyle}
                  onEachFeature={makeBindBusRouteLinePopup(routeIndex)}
                />
              )}
            </Pane>

            <Pane name="waterPane" style={{ zIndex: 420 }}>
              {layers.waterways && (
                <GeoJSON
                  key="waterway-layer"
                  data={mapData}
                  filter={shouldDisplayWaterway}
                  style={getWaterwayStyle}
                />
              )}
            </Pane>

            <Pane name="railwayPane" style={{ zIndex: 430 }}>
              {layers.railway && (
                <GeoJSON
                  key="railway-layer"
                  data={mapData}
                  filter={shouldDisplayRailway}
                  style={getRailwayStyle}
                />
              )}
            </Pane>

            <Pane name="subwayPane" style={{ zIndex: 440 }}>
              {layers.subway && (
                <GeoJSON
                  key="subway-layer"
                  data={mapData}
                  filter={shouldDisplaySubway}
                  style={getSubwayStyle}
                />
              )}
            </Pane>

            <Pane name="subwayStationsOfficialPane" style={{ zIndex: 442 }}>
              {layers.subway && subwayStationsOfficial && subwayLineShape && (
                <GeoJSON
                  key={`subway-stations-official-layer-${zoom >= 13}`}
                  data={subwayStationsOfficial}
                  pointToLayer={createSubwayStationMarker(subwayLineShape, zoom >= 13)}
                  onEachFeature={createSubwayStationPopupBinder(
                    subwayRouteOfficial?.features?.[0]?.properties?.headway
                  )}
                />
              )}
            </Pane>

            {/* 트램은 도로보다 위에 표시 */}

            <Pane name="tramGlowPane" style={{ zIndex: 449 }}>
              {layers.tram && (
                <GeoJSON
                  key="tram-glow-layer"
                  data={mapData}
                  filter={shouldDisplayTram}
                  style={() => ({
                    color: '#075e55',
                    weight: 11,
                    opacity: 0.85,
                    lineCap: 'round',
                    lineJoin: 'round',
                  })}
                />
              )}
            </Pane>

            <Pane name="tramPane" style={{ zIndex: 450 }}>
              {layers.tram && (
                <GeoJSON
                  key="tram-main-layer"
                  data={mapData}
                  filter={shouldDisplayTram}
                  style={getTramStyle}
                />
              )}
            </Pane>

            <Pane name="tramStationsOfficialPane" style={{ zIndex: 452 }}>
              {layers.tram && tramStationsOfficial && tramLineShape && (
                <GeoJSON
                  key={`tram-stations-official-layer-${zoom >= 13}`}
                  data={tramStationsOfficial}
                  pointToLayer={createTramStationMarker(tramLineShape, zoom >= 13)}
                  onEachFeature={bindTramStationPopup}
                />
              )}
            </Pane>

            <Pane name="hospitalsPane" style={{ zIndex: 453 }}>
              {layers.hospitals && zoom >= POINT_MIN_ZOOM && hospitals && (
                <GeoJSON
                  key="hospitals-layer"
                  data={hospitals}
                  pointToLayer={createHospitalMarker}
                  onEachFeature={bindHospitalPopup}
                />
              )}
            </Pane>

            <Pane name="pharmaciesPane" style={{ zIndex: 454 }}>
              {layers.pharmacies && zoom >= POINT_MIN_ZOOM && pharmacies && (
                <GeoJSON
                  key="pharmacies-layer"
                  data={pharmacies}
                  pointToLayer={createPharmacyMarker}
                  onEachFeature={bindPharmacyPopup}
                />
              )}
            </Pane>

            <Pane name="welfareFacilitiesPane" style={{ zIndex: 456 }}>
              {layers.welfareFacilities && zoom >= POINT_MIN_ZOOM && welfareFacilities && (
                <GeoJSON
                  key="welfare-facilities-layer"
                  data={welfareFacilities}
                  pointToLayer={createWelfareFacilityMarker}
                  onEachFeature={bindWelfareFacilityPopup}
                />
              )}
            </Pane>

            <Pane name="welfareCentersPane" style={{ zIndex: 457 }}>
              {layers.welfareCenters && zoom >= POINT_MIN_ZOOM && welfareCenters && (
                <GeoJSON
                  key="welfare-centers-layer"
                  data={welfareCenters}
                  pointToLayer={createWelfareCenterMarker}
                  onEachFeature={bindWelfareCenterPopup}
                />
              )}
            </Pane>

            <Pane name="tashuPane" style={{ zIndex: 457 }}>
              {layers.tashu && zoom >= POINT_MIN_ZOOM && tashuStations && (
                <GeoJSON
                  key={`tashu-layer-${tashuUsage ? 'u' : 'n'}`}
                  data={tashuStations}
                  pointToLayer={createTashuMarker}
                  onEachFeature={makeBindTashuPopup(tashuUsage)}
                />
              )}
            </Pane>

            <Pane name="schoolsPane" style={{ zIndex: 458 }}>
              {layers.schools && zoom >= POINT_MIN_ZOOM && schools && (
                <GeoJSON
                  key="schools-layer"
                  data={schools}
                  pointToLayer={createFacilityMarker('#818cf8')}
                  onEachFeature={bindFacilityPopup}
                />
              )}
            </Pane>

            <Pane name="marketsPane" style={{ zIndex: 459 }}>
              {layers.markets && zoom >= POINT_MIN_ZOOM && markets && (
                <GeoJSON
                  key="markets-layer"
                  data={markets}
                  pointToLayer={createFacilityMarker('#fb923c')}
                  onEachFeature={bindFacilityPopup}
                />
              )}
            </Pane>

            <Pane name="governmentOfficesPane" style={{ zIndex: 460 }}>
              {layers.governmentOffices && zoom >= POINT_MIN_ZOOM && governmentOffices && (
                <GeoJSON
                  key="government-offices-layer"
                  data={governmentOffices}
                  pointToLayer={createFacilityMarker('#94a3b8')}
                  onEachFeature={bindFacilityPopup}
                />
              )}
            </Pane>

            <Pane name="buildingPane" style={{ zIndex: 455 }}>
              {layers.buildings && zoom >= 15 && buildingsOfficial && (
                <GeoJSON key="building-layer" data={buildingsOfficial} style={getBuildingStyle} />
              )}
            </Pane>

            <Pane name="officialBusStopPane" style={{ zIndex: 461 }}>
              {layers.officialBusStops && zoom >= POINT_MIN_ZOOM && officialBusStops && (
                <GeoJSON
                  key={`official-bus-stop-layer-${routeIndexKey}`}
                  data={officialBusStops}
                  filter={(f) => routeIndex.ids.size === 0 || routesAtStop(routeIndex, f).length > 0}
                  pointToLayer={createOfficialBusStopMarker}
                  onEachFeature={makeBindOfficialBusStopPopup(routeIndex)}
                />
              )}
            </Pane>

            <Pane name="stopCentralityPane" style={{ zIndex: 462 }}>
              {layers.stopCentrality && zoom >= POINT_MIN_ZOOM && stopCentrality && (
                <GeoJSON
                  key="stop-centrality-layer"
                  data={stopCentrality}
                  pointToLayer={createStopCentralityMarker}
                  onEachFeature={bindStopCentralityPopup}
                />
              )}
            </Pane>

            <Pane name="stopBetweennessPane" style={{ zIndex: 463 }}>
              {layers.stopBetweenness && zoom >= POINT_MIN_ZOOM && stopCentrality && (
                <GeoJSON
                  key="stop-betweenness-layer"
                  data={stopCentrality}
                  pointToLayer={createBetweennessMarkerFactory(
                    stopCentrality.betweennessPercentiles
                  )}
                  onEachFeature={bindStopCentralityPopup}
                />
              )}
            </Pane>

            <Pane name="selectedRoutePane" style={{ zIndex: 660 }}>
              {getSelectedRouteLine(busRouteLines, selectedRouteId) && (
                <GeoJSON
                  key={`selected-route-${selectedRouteId}`}
                  data={getSelectedRouteLine(busRouteLines, selectedRouteId)}
                  style={() => ({
                    color: '#ffffff',
                    weight: 5,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                  })}
                />
              )}
              {selectedRouteId && (
                <SelectedRouteStopLabels
                  stops={busRouteStops[selectedRouteId]}
                  zoom={zoom}
                />
              )}
            </Pane>

            {/* 버스가 800대 가까이 떠서 지하철/트램(10대 안팎)이 같은 pane이면
                화면 위치에 따라 버스 마커 밑에 깔려 클릭이 안 되는 경우가
                있었음 - 지하철/트램을 더 높은 zIndex의 별도 pane으로 분리 */}
            <Pane name="railTrainPane" style={{ zIndex: 702 }}>
              <SubwayTrainSimulation
                zoom={zoom}
                stations={subwayStationsOfficial}
                lineShape={subwayLineShape}
                headway={subwayRouteOfficial?.features?.[0]?.properties?.headway}
                timetable={subwayTimetableOfficial}
                dayType={dayToHeadwayType(subwayDay)}
                day={subwayDay}
                clockMin={subwayClockMin}
                visible={layers.subwayTrains}
                subwayRidership={subwayRidership}
                subwayRidershipByAge={subwayRidershipByAge}
              />
              <TramTrainSimulation
                lineShape={tramLineShape}
                clockMin={subwayClockMin}
                visible={layers.tramTrains}
              />
            </Pane>

            <Pane name="busTrainPane" style={{ zIndex: 701 }}>
              <BusSimulation
                zoom={zoom}
                routeLine={getSelectedRouteLine(busRouteLines, selectedRouteId)}
                route={busRouteList.find((r) => r.routeId === selectedRouteId)}
                shape={busLineShape?.[selectedRouteId]}
                day={subwayDay}
                clockMin={subwayClockMin}
                visible={layers.busTrains}
                routeStops={busRouteStops[selectedRouteId]}
                routeSegmentSpeed={routeSegmentSpeed}
                routeStopRidership={routeStopRidershipMapped}
              />
              <AllBusSimulation
                zoom={zoom}
                routeLines={busRouteLines}
                routeList={busRouteList}
                lineShapeMap={busLineShape}
                day={subwayDay}
                clockMin={subwayClockMin}
                visible={layers.busTrainsAll && !(layers.busTrains && busPanelOpen && selectedRouteId)}
                onlyRouteId={busPanelOpen ? selectedRouteId : null}
                routeStops={busRouteStops}
                routeSegmentSpeed={routeSegmentSpeed}
                routeStopRidership={routeStopRidershipMapped}
              />
            </Pane>

          </MapContainer>

          {(() => {
            const legends = []
            if (layers.elderlyDong || layers.elderlyGu) legends.push({ title: '고령인구 비율 (65세+)', bins: ELDERLY_BINS, note: '대전 평균 17.8%' })
            if (layers.elderlyCountOa) legends.push({ title: '노인 인구수 · 집계구', bins: ELDERLY_COUNT_BINS.oa })
            if (layers.elderlyCountDong) legends.push({ title: '노인 인구수 · 행정동', bins: ELDERLY_COUNT_BINS.dong })
            if (layers.elderlyCountGu) legends.push({ title: '노인 인구수 · 구', bins: ELDERLY_COUNT_BINS.gu, note: '대전 전체 260,971명' })
            if (!legends.length) return null
            return (
              <div className="elderly-legend">
                {legends.map((lg) => (
                  <div key={lg.title} className="elderly-legend-block">
                    <div className="elderly-legend-title">{lg.title}</div>
                    {lg.bins.map((b) => (
                      <div key={b.label} className="elderly-legend-row">
                        <i style={{ background: b.color }} />
                        {b.label}
                      </div>
                    ))}
                    {lg.note && <div className="elderly-legend-note">{lg.note}</div>}
                  </div>
                ))}
              </div>
            )
          })()}

          <MapLegend
            layers={layers}
            onToggle={toggleLayer}
            onAllOn={turnAllLayersOn}
            onAllOff={turnAllLayersOff}
            zoom={zoom}
          />


        </>
      )}
    </div>
  )
}
