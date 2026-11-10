"""대전교통공사 공식 열차시각표(2025.08.31, CSV 4개)를 앱이 쓰는 형태로 바꾼다.

- 상선 = 반석 → 판암 방향 = 앱의 '판암(대전대)'
- 하선 = 판암 → 반석 방향 = 앱의 '반석(칠성대)'
- 열차마다 '출발 기점(판암 또는 반석)을 지나는 시각'(분)을 dep로 저장한다.
  중간역에서 출발하는 열차는 그 역 시각에서 기점→그 역 소요시간을 빼서 dep를 맞춘다
  (앱이 dep + 역별 소요시간으로 열차 위치를 계산하기 때문).
- 자정 넘어 도착(00:xx~02:xx)은 +1440분.
- 토요일은 휴일 시각표를 쓴다.
"""
import csv, json, os, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'public', 'data', '대전교통공사_열차시각표_20250831')
STATIONS = os.path.join(ROOT, 'public', 'data', 'subway', 'daejeon_subway_stations.geojson')
OUT = os.path.join(ROOT, 'public', 'data', 'subway', 'subway_timetable_official.json')

def read(path):
    for enc in ('cp949', 'utf-8-sig'):
        try:
            with open(path, encoding=enc) as f:
                return list(csv.reader(f))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(path)

def mins(t):
    h, m = map(int, t.split(':')[:2])
    v = h * 60 + m
    return v + 1440 if h < 3 else v

st = json.load(open(STATIONS, encoding='utf-8'))['features']
off = {}
for f in st:
    p = f['properties']
    off[p['name'].replace('역', '')] = (p['offsetFromPanamMin'], p['offsetFromBanseokMin'])

result = {}
for day, label in (('평일', '평일'), ('휴일', '휴일')):
    result[label] = {}
    for line, appDir, idx in (('상선', '판암(대전대)', 1), ('하선', '반석(칠성대)', 0)):
        rows = read(os.path.join(SRC, f'대전도시철도 열차시각표({day} {line}).csv'))
        body = [r for r in rows[1:] if r and r[0].strip()]
        deps = []
        for c in range(1, len(rows[0])):
            for r in body:
                name = r[0].strip()
                t = r[c].strip() if c < len(r) else ''
                if t and name in off:
                    deps.append(mins(t) - off[name][idx])
                    break
        result[label][appDir] = sorted(deps)
result['토요일'] = result['휴일']
json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
for k, v in result.items():
    print(k, {d: len(x) for d, x in v.items()})
