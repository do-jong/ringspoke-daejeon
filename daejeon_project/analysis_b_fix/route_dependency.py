import json, math, numpy as np, os
from collections import defaultdict
HERE=os.path.dirname(os.path.abspath(__file__))
D=os.environ.get('D',os.path.join(HERE,'..','public','data')+os.sep)
J=lambda p: json.load(open(D+p,encoding='utf-8'))
KX=111320*math.cos(math.radians(36.35)); KY=110540
def xy(c): return np.array([c[0]*KX,c[1]*KY])
rl={r['routeId']:r for r in J('bus/bus_route_list.json')['routes']}
seqs=J('bus/bus_route_stops.json'); ride=J('bus/route_stop_ridership.json')['routes']
stops={f['properties']['stopId']:f['geometry']['coordinates'] for f in J('bus/bus_stops.geojson')['features']}
tram=np.array([xy(f['geometry']['coordinates']) for f in J('tram/daejeon_tram_stations.geojson')['features']])
ov=J('analysis/bus_tram_overlap.json')['routes']
pop=J('population/daejeon_population_oa.geojson')['features']
TH=float(os.environ.get('TH',15)); R_TRAM=300; R_WALK=500
serve=defaultdict(set)
for rid,seq in seqs.items():
    for s in seq: serve[s['stopId']].add(rid)
def board(rid,sid):
    v=ride.get(rid,{}).get('stops',{}).get(sid,{}).get('byDay',{}).get('평일',{})
    return sum(v.get(h,{}).get('board',0) for h in ('07:00','08:00'))
sids=[s for s in serve if s in stops]; SXY=np.array([xy(stops[s]) for s in sids])
cent=[]
for f in pop:
    g=f['geometry']; ring=np.array(g['coordinates'][0][0] if g['type']=='MultiPolygon' else g['coordinates'][0])
    cent.append((xy(ring.mean(0)), f['properties']['totalPop'] or 0, f['properties']['elderlyPop'] or 0))
out=[]
for o in ov:
    if o['overlapPercent']<TH: continue
    rid=o['routeId']; seq=seqs[rid]; seen=set()
    tot=rep=sole=0; nrep=nsole=0
    for s in seq:
        sid=s['stopId']
        if sid in seen or sid not in stops: continue
        seen.add(sid); b=board(rid,sid); tot+=b
        dT=np.min(np.hypot(*(tram-xy(stops[sid])).T))
        if dT<=R_TRAM: rep+=b; nrep+=1
        if serve[sid]=={rid}: sole+=b; nsole+=1
    # population whose all stops within 500m are served by this route only (no other route nearby)
    mine=np.array([rid in serve[s] for s in sids]); others=np.array([len(serve[s]-{rid})>0 for s in sids])
    depP=depE=0
    for c,p,e in cent:
        near=np.hypot(*(SXY-c).T)<=R_WALK
        if near.any() and mine[near].any() and not others[near].any(): depP+=p; depE+=e
    out.append(dict(routeNo=rl[rid]['routeNo'],routeId=rid,overlapPct=o['overlapPercent'],board0709=round(tot),
        tramReplaceable=round(rep),tramReplaceablePct=round(rep/tot*100,1) if tot else 0,stopsNearTram=nrep,
        soleServiceStops=nsole,soleServiceBoard=round(sole),dependentPop=int(depP),dependentElderly=int(depE)))
json.dump(dict(rule=dict(overlapThreshold=TH,tramWalkM=R_TRAM,stopWalkM=R_WALK,period='평일 07~09시, 2주 평균'),routes=out),
  open(os.path.join(os.environ.get('OUT',HERE),'route_dependency.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
for r in out: print(r)
