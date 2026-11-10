import json, math, numpy as np, os
from collections import defaultdict
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','data')+os.sep
J=lambda p: json.load(open(D+p,encoding='utf-8'))
spd=J('bus/route_segment_speed.json')['routes']
seqs=J('bus/bus_route_stops.json')
rl={r['routeId']:r for r in J('bus/bus_route_list.json')['routes']}
ride=J('bus/route_stop_ridership.json')['routes']
stops={f['properties']['stopId']:f['geometry']['coordinates'] for f in J('bus/bus_stops.geojson')['features']}
LAT0=36.35; KX=111320*math.cos(math.radians(LAT0)); KY=110540
def xy(c): return np.array([c[0]*KX,c[1]*KY])
# tram line
pts=[]
def walk(o):
    if isinstance(o,dict):
        for v in o.values(): walk(v)
    elif isinstance(o,list):
        if len(o)==2 and all(isinstance(x,(int,float)) for x in o): pts.append(o)
        else:
            for v in o: walk(v)
walk(J('tram/daejeon_tram_line_shape.json')); P=np.array(pts,float)
if P[:,0].mean()<90: P=P[:,::-1]
dense=[]
for a,b in zip(P[:-1],P[1:]):
    A,B=xy(a),xy(b); n=max(1,int(np.hypot(*(B-A))/20))
    for t in np.linspace(0,1,n,endpoint=False): dense.append(A+(B-A)*t)
dense=np.array(dense)
def dline(c): return float(np.min(np.hypot(*(dense-xy(c)).T)))

PEAK=['07:00','07:15','07:30','07:45','08:00','08:15','08:30','08:45']
FREE=['05:00','05:15','05:30']
MID=['10:00','10:15','10:30','10:45','11:00','11:15','11:30','11:45','13:00','13:15','13:30','13:45','14:00','14:15','14:30','14:45']
seg=defaultdict(lambda: dict(peak=[],free=[],mid=[],routes=set(),trips=0.0,pax=0.0))
for rid,r in spd.items():
    if rid not in rl or rid not in seqs: continue
    hw=rl[rid]['intervalMin'] or 0
    trips=120/hw if hw else 0  # trips in 07-09 (one direction of listing)
    # onboard pax per hour along sequence, weekday 07,08
    seq=seqs[rid]; st=ride.get(rid,{}).get('stops',{})
    onb={}
    load=0.0
    for s in seq:
        v=st.get(s['stopId'],{}).get('byDay',{}).get('평일',{})
        b=sum(v.get(h,{}).get('board',0) for h in ('07:00','08:00')); a=sum(v.get(h,{}).get('alight',0) for h in ('07:00','08:00'))
        load=max(0.0,load+b-a); onb[s['stopId']]=load
    for key,days in r['segments'].items():
        w=days.get('평일')
        if not w or '>' not in key: continue
        f,t=key.split('>')
        if f not in stops or t not in stops: continue
        S=seg[key]
        S['peak']+= [w[k] for k in PEAK if w.get(k)]; S['free']+=[w[k] for k in FREE if w.get(k)]; S['mid']+=[w[k] for k in MID if w.get(k)]
        S['routes'].add(rl[rid]['routeNo']); S['trips']+=trips; S['pax']+=onb.get(f,0)
rows=[]
names={}
for rid,seq in seqs.items():
    for s in seq: names[s['stopId']]=s['name']
for key,S in seg.items():
    if not S['peak'] or not S['free']: continue
    f,t=key.split('>'); L=float(np.hypot(*(xy(stops[f])-xy(stops[t]))))*1.2
    if L<50 or L>3000: continue
    vp=np.mean(S['peak']); vf=np.mean(S['free']); vm=np.mean(S['mid']) if S['mid'] else vf
    if vp<=0: continue
    dpk=(L/1000/vp-L/1000/vf)*60   # min per bus vs free
    dmid=max(0,(L/1000/vp-L/1000/vm)*60)
    mid=[(stops[f][0]+stops[t][0])/2,(stops[f][1]+stops[t][1])/2]
    rows.append(dict(seg=key,frm=names.get(f,f),to=names.get(t,t),lng=mid[0],lat=mid[1],lenM=round(L),vPeak=round(vp,1),vFree=round(vf,1),vMid=round(vm,1),
        drop=round((1-vp/vf)*100,1),delayMinPerBus=round(dpk,2),routes=len(S['routes']),busTrips=round(S['trips'],1),pax0709=round(S['pax']),
        paxDelayMin=round(S['pax']*dpk),nearTram=dline(mid)<=60))
rows.sort(key=lambda r:-r['paxDelayMin'])
json.dump(rows,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'congestion_segments.json'),'w',encoding='utf-8'),ensure_ascii=False)
print(len(rows))
tot=sum(r['paxDelayMin'] for r in rows); print('total pax delay min',tot)
for r in rows[:15]: print(r)
nt=[r for r in rows if r['nearTram']]
print('nearTram segs',len(nt), 'share of pax delay', round(sum(r['paxDelayMin'] for r in nt)/tot*100,1),'share of length',round(sum(r['lenM'] for r in nt)/sum(r['lenM'] for r in rows)*100,1))
print('mean drop tram',np.mean([r['drop'] for r in nt]),'non',np.mean([r['drop'] for r in rows if not r['nearTram']]))
print('mean vPeak tram',np.mean([r['vPeak'] for r in nt]),'non',np.mean([r['vPeak'] for r in rows if not r['nearTram']]))
