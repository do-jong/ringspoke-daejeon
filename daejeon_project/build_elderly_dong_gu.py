"""행정동(82)·구(5)별 고령인구 지도 데이터 만들기.

집계구 인구(public/data/population/daejeon_population_oa.geojson, SGIS 2024,
N/A 2.5명 보정)를 집계구 코드 앞 8자리(= SGIS 행정동 코드)로 합산하고,
국가데이터처 행정동 경계에 붙여 public/data/population/daejeon_elderly_dong_gu.json 으로 저장.

사용법: python build_elderly_dong_gu.py <대전_행정동경계_국가데이터처.geojson>
(경계 파일 속성: ADM_CD(8자리), 구, 행정동)
필요 패키지: shapely
"""
import sys, json, collections
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

BOUNDARY = sys.argv[1]
POP = "public/data/population/daejeon_population_oa.geojson"
OUT = "public/data/population/daejeon_elderly_dong_gu.json"

agg = collections.defaultdict(lambda: [0, 0])
for f in json.load(open(POP, encoding="utf-8"))["features"]:
    p = f["properties"]
    if p["totalPop"] is None:
        continue
    a = agg[p["oaCode"][:8]]
    a[0] += p["totalPop"]
    a[1] += p["elderlyPop"]

def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]
    return [rnd(x) for x in c]

def geo(g):
    g = json.loads(json.dumps(mapping(g)))
    g["coordinates"] = rnd(g["coordinates"])
    return g

dongs, gu_geoms, gu_sum = [], collections.defaultdict(list), collections.defaultdict(lambda: [0, 0])
for f in json.load(open(BOUNDARY, encoding="utf-8"))["features"]:
    p = f["properties"]
    g = shape(f["geometry"])
    t, e = agg.get(p["ADM_CD"], [0, 0])
    dongs.append({"type": "Feature", "properties": {"gu": p["구"], "dong": p["행정동"], "t": t, "e": e},
                  "geometry": geo(g.simplify(0.0003, preserve_topology=True))})
    gu_geoms[p["구"]].append(g.buffer(0))
    gu_sum[p["구"]][0] += t
    gu_sum[p["구"]][1] += e

gus = [{"type": "Feature", "properties": {"gu": k, "t": gu_sum[k][0], "e": gu_sum[k][1]},
        "geometry": geo(unary_union(v).simplify(0.0004, preserve_topology=True))} for k, v in gu_geoms.items()]

json.dump({"dong": {"type": "FeatureCollection", "features": dongs},
           "gu": {"type": "FeatureCollection", "features": gus}},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"행정동 {len(dongs)}개, 구 {len(gus)}개 저장: {OUT}")
