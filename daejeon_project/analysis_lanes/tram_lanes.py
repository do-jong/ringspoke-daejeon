import json, math, numpy as np, os
HERE=os.path.dirname(os.path.abspath(__file__))
D=os.path.join(HERE,'..','public','data')+os.sep
J=lambda p: json.load(open(D+p,encoding='utf-8'))
KX=111320*math.cos(math.radians(36.35)); KY=110540
def xy(c): return np.array([c[0]*KX,c[1]*KY])
shape=J('tram/daejeon_tram_line_shape.json')
st=[(f['properties']['name'],f['geometry']['coordinates']) for f in J('tram/daejeon_tram_stations.geojson')['features']]
osm=J('daejeon_map.geojson')['features']
roads=[]
for f in osm:
    p=f['properties']
    if p.get('highway') not in ('trunk','primary','secondary','tertiary','trunk_link','primary_link'): continue
    if f['geometry']['type']!='LineString': continue
    ln=p.get('lanes')
    try: ln=float(str(ln).split(';')[0])
    except: ln=None
    one=p.get('oneway')=='yes'
    a=np.array([xy(c) for c in f['geometry']['coordinates']])
    roads.append((a,ln,one,p.get('name','')))
# segment index for quick search
segs=[]
for ri,(a,ln,one,nm) in enumerate(roads):
    for i in range(len(a)-1): segs.append((a[i],a[i+1],ri))
SA=np.array([s[0] for s in segs]); SB=np.array([s[1] for s in segs]); SR=np.array([s[2] for s in segs])
def nearest_roads(p, dirv, R=35):
    AB=SB-SA; t=np.clip(((p-SA)*AB).sum(1)/np.maximum((AB*AB).sum(1),1e-9),0,1)
    Q=SA+AB*t[:,None]; d=np.hypot(*(Q-p).T)
    idx=np.where(d<R)[0]; out=[]
    for i in idx:
        ab=AB[i]/max(np.hypot(*AB[i]),1e-9); cos=abs(ab@dirv)
        if cos>0.85: out.append((d[i],SR[i]))
    return out
PEAK_TRAM=None
REF=json.load(open(os.path.join(HERE,'..','analysis_congestion','congestion_segments.json'),encoding='utf-8'))
CXY=np.array([xy([r['lng'],r['lat']]) for r in REF])
EXC={ # (from,to) station name keywords -> note
 ('오정농수산물시장','둔산'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',
 ('둔산','샘머리공원'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',
 ('샘머리공원','정부청사'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',
 ('국립중앙과학관','구성'):'보완: 인도 편입으로 차로 확보(6공구)',
 ('구성','유성구청'):'보완: 인도 편입으로 차로 확보(6공구)',
 ('유성구청','궁동'):'보완: 인도 편입으로 차로 확보(6공구)',
 ('정림삼거리','도마·복수'):'지하(불티고개)',
 ('유천','서대전역'):'지하(서대전육교 철거 후 호남선 하부)',
}
def exc(a,b):
    for (x,y),v in EXC.items():
        if (a.startswith(x) and b.startswith(y)) or (a.startswith(y) and b.startswith(x)): return v
    return None
rows=[]
for lname,obj in shape.items():
    L=np.array(obj['line'] if isinstance(obj,dict) and 'line' in obj else obj,float)
    if L[:,0].mean()<90: L=L[:,::-1]
    A=np.array([xy(c) for c in L]); cum=np.concatenate([[0],np.cumsum(np.hypot(*np.diff(A,axis=0).T))])
    # project stations
    proj=[]
    for nm,c in st:
        p=xy(c); AB=A[1:]-A[:-1]; t=np.clip(((p-A[:-1])*AB).sum(1)/np.maximum((AB*AB).sum(1),1e-9),0,1)
        Q=A[:-1]+AB*t[:,None]; d=np.hypot(*(Q-p).T); i=int(np.argmin(d))
        if d[i]<150: proj.append((cum[i]+t[i]*np.hypot(*AB[i]),nm))
    proj.sort()
    for (s0,a),(s1,b) in zip(proj[:-1],proj[1:]):
        lanes=[]; names=set()
        for s in np.arange(s0,s1,25):
            i=min(np.searchsorted(cum,s),len(A)-1); i=max(i,1)
            p=A[i]; dv=A[i]-A[i-1]; dv=dv/max(np.hypot(*dv),1e-9)
            nr=nearest_roads(p,dv)
            if not nr: continue
            # per-direction lanes: oneway ways give per-dir; twoway lanes/2
            vals=[]
            for dd,ri in nr:
                a_,ln,one,nm_=roads[ri]
                if ln: vals.append(ln if one else ln/2)
                if nm_: names.add(nm_)
            if vals: lanes.append(max(vals))
        cur=float(np.median(lanes)) if lanes else None
        note=exc(a,b)
        if note: post=cur
        else: post=max(1.0,cur-1) if cur else None
        loss=None if not cur else round((1-post/cur)*100)
        mid=(np.interp((s0+s1)/2,cum,A[:,0]),np.interp((s0+s1)/2,cum,A[:,1]))
        dd=np.hypot(*(CXY-np.array(mid)).T); near=[REF[k] for k in np.where(dd<(s1-s0)/2+100)[0] if REF[k]['nearTram']]
        pax=max([r['pax0709'] for r in near],default=0); vp=min([r['vPeak'] for r in near],default=None)
        rows.append(dict(line=lname,frm=a,to=b,lenM=round(s1-s0),road='/'.join(sorted(names))[:40],lanesNow=cur,lanesAfter=post,
            coverage=round(len(lanes)/max(1,len(np.arange(s0,s1,25)))*100),lossPct=loss,note=note or '',busPax0709=pax,busPeakKmh=vp))

brt=[('상대정거장','원골'),('원골','대전시립박물관'),('대전시립박물관','도안'),('도안','용계'),('용계','대정')]
for r in rows:
    if any(r['frm'].startswith(a) and r['to'].startswith(b) for a,b in brt):
        r['note']='기존 중앙버스차로 활용(일반 차로 유지)'; r['lanesAfter']=r['lanesNow']; r['lossPct']=0 if r['lanesNow'] else None
    f=[]
    if r['lanesNow'] is not None and r['lanesNow']<=1: f.append('편도 1차로로 나옴-실제 확인 필요')
    if r['coverage']<70: f.append('OSM 차로정보 일부만 있음')
    if r['lanesNow'] and r['lanesNow']>=8: f.append('OSM 값 과대 의심')
    r['check']=', '.join(f)
rows=[r for r in rows if not (r['line']=='yeonchuk' and r['frm'].startswith('용전'))]
json.dump(rows,open(os.path.join(HERE,'tram_lanes.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
for r in rows: print(r['line'][:4],r['frm'][:8],'→',r['to'][:8],r['lenM'],r['road'][:18],r['lanesNow'],'→',r['lanesAfter'],f"{r['coverage']}%",r['lossPct'],r['note'][:14],r['busPax0709'],r['busPeakKmh'])
