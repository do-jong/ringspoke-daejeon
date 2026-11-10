# 전체 데이터/API 출처 목록

지금까지 이 프로젝트에서 받아온 모든 데이터와 쓴 API를 모음. 지하철/트램
시뮬레이션 전용 상세 출처·계산식은 `SUBWAY_TRAM_DATA_SOURCES.md`에 따로
있음 — 여기서는 요약만.

## 버스

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 노선 목록(노선번호, 정류소 수, 운행거리/시간, 배차간격) | data.go.kr "대전광역시_버스노선정보"(`apis.data.go.kr/6300000/busRouteInfo`, `getRouteInfoAll`) | `download_bus_routes.cjs` → `build_bus_route_list.cjs` | 버스 노선 목록 탭(배차간격 평일/주말 표시) |
| 노선별 정류소 순서, 정류소 좌표, 노선 선형(직선) | 같은 API `getStaionByRouteAll` | `download_bus_routes.cjs` → `build_bus_stops.cjs`/`build_bus_route_stops.cjs` | 버스정류소(공식) 레이어, 노선 패널 |
| 노선 선형(도로 따라가게 스냅) | 위 직선 선형을 OSRM 공개 데모 서버(`router.project-osrm.org`)에 넘겨서 변환 | `build_bus_route_shapes.cjs` | 버스 노선(공식) 레이어 |
| 버스 등록정보(차량 상세) | data.go.kr "대전광역시_버스등록정보"(`busreginfo`) | `download_bus_registrations.cjs` | **받아만 두고 아직 UI에 미연결** |
| 버스 실제 운행 시간표(차량운용표, 배차간격) | 사용자 제공 xlsx(원본 출처 미상 - 대전시 차량운용표) | `build_bus_timetable.py` | **받아만 두고 아직 UI에 미연결** — 110개 노선 중 32개는 배차/소요시간 정보 없음(확인 필요) |
| 2022년 노선별 실측 통행속도(DSRC-RSE) | 2022년도 대전광역시 교통현황조사 및 분석 보고서(제3장, p.390~392) PDF 표를 사용자가 옮겨 받아 그대로 코드에 입력 | `build_bus_speed_2022.py` | **받아만 두고 아직 UI에 미연결** |
| 정류소별 실시간 도착정보 | data.go.kr "대전광역시_정류소별 도착정보"(`getArrInfoByStopID`) | `fetch_bus_arrival.cjs` | **확인용 스냅샷만 - 실시간 데이터라 정적 커밋 안 함**(프로젝트 원칙상 라이브 갱신 기능 자체를 안 만들기로 함) |
| 버스전용차로 공식 구간(가로변) | data.go.kr "대전광역시_버스전용차로 현황"(15081423) + 카카오 로컬 API로 교차로 지오코딩 + OSM 도로망 다익스트라 추적 | `build_busway_official.cjs` | 버스전용도로 레이어(OSM 추정 레이어와 색 통합) |
| 정류장 네트워크 중심성(연결/매개/고유벡터) | 위 정류소/노선 데이터로 직접 계산(박한솔·조완섭 2016 방법론) | `build_stop_network.cjs` | 정류장 중심성 레이어 |

## 지하철 1호선 / 트램 2호선

→ `SUBWAY_TRAM_DATA_SOURCES.md` 참고(KRIC 레일포털, OSM 선형, 위키백과
기점/종점, 사용자 제작 gpkg, 대전시 트램 공식 발표자료 등).

## 교통신호등

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 공식 신호등 위치(20,132개) | data.go.kr "대전광역시_교통신호정보"(`GetTrsnListService1/getTrsnList1`) | `download_signals.cjs` | 교통 신호등 레이어(공식) |
| 통합 신호등(20,421개) | 위 공식 데이터 + OSM(`daejeon_map.geojson`)의 `highway=traffic_signals` 포인트를 좌표로 합쳐서 중복 제거 | TransitMap.jsx `combineSignalData()`(클라이언트에서 실시간 병합, 별도 빌드 산출물 없음) | 교통 신호등 레이어(통합 개수 표시) |
| 신호 주기/현시/옵셋(TOD) | **신청 중** - 경찰청·도로교통공단 UTIC "신호 개방 데이터"(인천·대전·대구 3개 시만 제공, REST API/JSON, 일 1회 갱신) | 아직 없음 | 아직 미사용 - 승인되면 교차로별 실제 신호 시뮬레이션에 쓸 예정 |
| 신호등 위치(장식용, 참고) | OSM `highway=traffic_signals` (map 레이어 안에 포함) | - | `isSignal()` 필터로 지도에 표시만 |

## 소통정보(교통 혼잡도)

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 구간별 소통정보(소통원활/지체/정체) | data.go.kr "대전광역시_소통정보"(`getTrafficInfoAll`) | `download_traffic.cjs` | 소통정보 레이어 원본 |
| 표준노드링크(도로망, 좌표) | 국가교통정보센터 표준노드링크(수집 스크립트 없음 - 직접 전달받은 파일) | - | `build_traffic_links.cjs`에서 소통정보와 결합할 때 좌표 매칭용 |
| 소통정보 + 도로망 결합 | 위 둘을 구간 ID로 합침 | `build_traffic_links.cjs` | 소통정보 레이어(지도에 그려지는 최종 형태) |
| 소통정보 검증(OSM 도로 길이와 대조) | 위 결과를 OSM 도로 길이와 비교해서 매칭이 맞는지 확인 | `inspect_traffic.cjs` | 검증 전용, UI 아님 |
| 공식 코드 정의(1=소통원활/2=지체/3=정체) | data.go.kr Swagger 문서(데이터셋 ID 15157924, `getTrafficInfoAll`) | - | 범례 라벨/색상 |

## 병원·약국

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 병원·의원, 약국 위치 | 건강보험심사평가원(HIRA) 병원정보서비스/약국정보서비스(전국 데이터 중 대전만 추출) | `build_medical_facility_data.py` | 병원·의원(공식)/약국(공식) 레이어 |

## 복지시설 / 장애인 편의시설

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 복지시설 목록 | 대전장애인단체총연합회 정보드림(djid.or.kr) 웹페이지 스크래핑 | `download_welfare_centers.py` | 복지시설(공식) 레이어 |
| 장애인 편의시설 목록 | 같은 사이트의 다른 목록(편의시설) | `download_welfare_facilities.py` | 장애인 편의시설(공식) 레이어 |
| 위 두 목록의 좌표 | 원본에 좌표 없음(사이트가 클라이언트에서 카카오 지도로 지오코딩) → 카카오 로컬 API(`dapi.kakao.com`)로 직접 지오코딩 | `geocode_welfare_centers.py`/`geocode_welfare_facilities.py` | 위 두 레이어의 마커 좌표 |

## 고령인구 분포

| 데이터 | 출처 | 스크립트 | 쓰인 곳 |
|---|---|---|---|
| 집계구별 성연령별 인구(65세 이상 비율) | 통계청 SGIS(통계지리정보서비스) 집계구 경계 + 성연령별 인구 | `build_population_data.cjs` | 고령인구 분포 레이어 |

## 지도 기반 데이터

| 데이터 | 출처 | 쓰인 곳 |
|---|---|---|
| `daejeon_map.geojson`(도로/철도/트램/신호등 등 OSM 원본) | OpenStreetMap 추출본 — 받은 방식(Overpass 등)은 기록이 안 남아있어서 정확한 절차는 불명 | 도로/철도/트램(OSM)/신호등 등 거의 모든 "(OSM 추정)" 레이어의 기반 |
| 베이스맵 타일 | OSM 표준 타일(기본), Esri `World_Light_Gray_Base`/`World_Dark_Gray_Base`(밝은/어두운 테마, `server.arcgisonline.com`), Esri `World_Imagery`(위성) | 지도 레이어 전환(LayersControl) |

## 지오코딩·라우팅 API

| API | 쓰인 곳 |
|---|---|
| 카카오 로컬 API(`dapi.kakao.com`, `.env KAKAO_REST_API_KEY`) | 복지시설 주소 지오코딩, 버스전용차로 교차로 지오코딩 |
| OSRM 공개 데모 서버(`router.project-osrm.org`) | 버스 노선 도로 스냅(한 번 실행 후 정적 저장 - shortcut: 상시 운영용 서버 아님, 데이터 자주 갱신 필요해지면 자체 서버 고려) |

## 요약 - 신청/보류 중인 것

- **UTIC 신호 개방 데이터**: 대전 포함, 신청 절차 진행 중(본인 명의/이메일/IP로 직접 신청 필요) — 승인되면 교차로 신호 시뮬레이션에 사용 예정.
- **버스 실제 시간표/2022년 통행속도/버스 등록정보**: 이미 받아서 정적 파일로 저장돼 있지만 지도 UI에는 아직 연결 안 함 — 버스 움직임 시뮬레이션(지하철/트램처럼)을 만들 때 쓸 재료로 준비해둔 상태.
