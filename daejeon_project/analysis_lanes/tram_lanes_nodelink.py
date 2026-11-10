import json, math, numpy as np, os
HERE=os.path.dirname(os.path.abspath(__file__))
D=os.environ.get('D', os.path.join(HERE,'..','public','data')+os.sep)
J=lambda p: json.load(open(D+p,encoding='utf-8'))
KX=111320*math.cos(math.radians(36.35)); KY=110540
def xy(c): return np.array([c[0]*KX,c[1]*KY])
shape=J('tram/daejeon_tram_line_shape.json')
st=[(f['properties']['name'],f['geometry']['coordinates']) for f in J('tram/daejeon_tram_stations.geojson')['features']]
links=[f for f in J('nodelink/daejeon_link.geojson')['features'] if f['properties']['ROAD_RANK'] in ('101','102','103','104','105','106')]
SA=[];SB=[];SL=[];SN=[]
for f in links:
    g=f['geometry']; cs=g['coordinates'] if g['type']=='LineString' else [c for part in g['coordinates'] for c in part]
    a=[xy(c) for c in cs]
    for i in range(len(a)-1): SA.append(a[i]);SB.append(a[i+1]);SL.append(f['properties']['LANES']);SN.append(f['properties']['ROAD_NAME'] or '')
SA=np.array(SA);SB=np.array(SB);SL=np.array(SL);SN=np.array(SN)
AB=SB-SA; ABn=AB/np.maximum(np.hypot(*AB.T),1e-9)[:,None]
def lanes_at(p,dv,R=40):
    t=np.clip(((p-SA)*AB).sum(1)/np.maximum((AB*AB).sum(1),1e-9),0,1); Q=SA+AB*t[:,None]; d=np.hypot(*(Q-p).T)
    ok=(d<R)
    cos=ABn@dv
    f=ok&(cos>0.85); b=ok&(cos<-0.85)
    lf=SL[f].max() if f.any() else None; lb=SL[b].max() if b.any() else None
    names=set(SN[ok&(abs(cos)>0.85)])
    return lf,lb,names
REF=json.load(open(os.environ.get('REF',os.path.join(HERE,'..','analysis_congestion','congestion_segments.json')),encoding='utf-8'))
CXY=np.array([xy([r['lng'],r['lat']]) for r in REF])
EXC={('오정농수산물시장','둔산'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',('둔산','샘머리공원'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',
 ('샘머리공원','정부청사'):'보완: 녹지 편입으로 2개 차로 확보(4공구)',('국립중앙과학관','구성'):'보완: 인도 편입으로 차로 확보(6공구)',
 ('구성','유성구청'):'보완: 인도 편입으로 차로 확보(6공구)',('유성구청','궁동'):'보완: 인도 편입으로 차로 확보(6공구)',
 ('정림삼거리','도마·복수'):'지하(불티고개)',('유천','서대전역'):'지하(서대전육교)',
 ('상대정거장','원골'):'기존 중앙버스차로 활용',('원골','대전시립박물관'):'기존 중앙버스차로 활용',('대전시립박물관','도안'):'기존 중앙버스차로 활용',
 ('도안','용계'):'기존 중앙버스차로 활용',('용계','대정'):'기존 중앙버스차로 활용'}
def exc(a,b):
    for (x,y),v in EXC.items():
        if (a.startswith(x) and b.startswith(y)) or (a.startswith(y) and b.startswith(x)): return v
rows=[]
for lname,obj in shape.items():
    L=np.array(obj['line'],float)
    if L[:,0].mean()<90: L=L[:,::-1]
    A=np.array([xy(c) for c in L]); cum=np.concatenate([[0],np.cumsum(np.hypot(*np.diff(A,axis=0).T))])
    proj=[]
    for nm,c in st:
        p=xy(c); ab=A[1:]-A[:-1]; t=np.clip(((p-A[:-1])*ab).sum(1)/np.maximum((ab*ab).sum(1),1e-9),0,1)
        Q=A[:-1]+ab*t[:,None]; d=np.hypot(*(Q-p).T); i=int(np.argmin(d))
        if d[i]<150: proj.append((cum[i]+t[i]*np.hypot(*ab[i]),nm))
    proj.sort()
    for (s0,a),(s1,b) in zip(proj[:-1],proj[1:]):
        if lname!='mainline' and a.startswith('용전'): continue
        F=[];B=[];names=set();n=0
        for s in np.arange(s0+20,s1-20,25):
            n+=1; i=max(1,min(np.searchsorted(cum,s),len(A)-1)); dv=A[i]-A[i-1]; dv=dv/max(np.hypot(*dv),1e-9)
            p=A[i-1]+dv*(s-cum[i-1])
            lf,lb,nm=lanes_at(p,dv); names|=nm
            if lf: F.append(lf)
            if lb: B.append(lb)
        cur=None
        if F or B:
            vals=[np.median(F)] if F else []; vals+= [np.median(B)] if B else []
            cur=float(min(vals))
        cov=round(min(len(F),len(B))/max(n,1)*100) if n else 0
        note=exc(a,b) or ''
        post=cur if note else (max(1.0,cur-1) if cur else None)
        loss=None if not cur else round((1-post/cur)*100)
        mid=(np.interp((s0+s1)/2,cum,A[:,0]),np.interp((s0+s1)/2,cum,A[:,1]))
        dd=np.hypot(*(CXY-np.array(mid)).T); near=[REF[k] for k in np.where(dd<(s1-s0)/2+100)[0] if REF[k]['nearTram']]
        rows.append(dict(line=lname,frm=a,to=b,lenM=round(s1-s0),road='/'.join(sorted(x for x in names if x and x!='-'))[:40],
            lanesNow=cur,lanesAfter=post,lossPct=loss,coverage=cov,note=note,
            busPax0709=max([r['pax0709'] for r in near],default=0),busPeakKmh=min([r['vPeak'] for r in near],default=None),
            check=('편도 1차로-트램 들어가면 차로 0 → 설계 확인 필요' if cur==1 and not note else ('표준노드링크 매칭 부족' if cov<50 else ''))))
json.dump(rows,open(os.path.join(os.environ.get('OUT',HERE),'tram_lanes_nodelink.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
for r in rows: print(r['frm'][:8],'→',r['to'][:8],r['road'][:16],r['lanesNow'],'→',r['lanesAfter'],r['lossPct'],f"cov{r['coverage']}",r['note'][:6],r['check'][:10],r['busPax0709'],r['busPeakKmh'])
