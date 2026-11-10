const fs=require('fs');
const {proportionalOnboard}=require('/home/claude/occ/occ.js');
const iconv=null;
const raw=fs.readFileSync(process.argv[2]);
const txt=new TextDecoder('euc-kr').decode(raw);
const lines=txt.split(/\r?\n/).filter(Boolean); const head=lines[0].split(',');
const hours=head.slice(4).map(h=>h.slice(0,2)+':00');
const tt=JSON.parse(fs.readFileSync('/home/claude/tt_root/public/data/subway/subway_timetable_official.json'));
const nos=Array.from({length:22},(_,i)=>String(101+i));
// data[date][stationNo]={board:[..],alight:[..]}
const data={}, names={};
for(const l of lines.slice(1)){const c=l.split(','); const d=c[0], no=c[1].slice(1), kind=c[3]; names[no]=c[2];
  data[d]=data[d]||{}; data[d][no]=data[d][no]||{}; data[d][no][kind==='승차'?'b':'a']=c.slice(4).map(Number)}
const holidays=new Set(['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-03-02','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-05','2026-10-09']);
const weekdays=Object.keys(data).filter(d=>{const w=new Date(d+'T00:00:00').getDay(); return w>=1&&w<=5&&!holidays.has(d)});
function trainsInHour(dir,h){return tt['평일'][dir].filter(x=>Math.floor(((x%1440)+1440)%1440/60)===h).length}
const out={};
for(const [dir,seq,label] of [['반석(칠성대)',nos,'판암→반석'],['판암(대전대)',[...nos].reverse(),'반석→판암']]){
 for(const H of [7,8,17,18]){
  const hi=hours.indexOf(String(H).padStart(2,'0')+':00'); const k=trainsInHour(dir,H);
  const perDay=weekdays.map(d=>{const B=seq.map(n=>(data[d][n]?.b?.[hi]||0)/k), A=seq.map(n=>(data[d][n]?.a?.[hi]||0)/k); return seq.map((_,u)=>proportionalOnboard(B,A,u))});
  const segs=seq.slice(0,-1).map((n,u)=>{const v=perDay.map(r=>r[u]).sort((x,y)=>x-y); const mean=v.reduce((s,x)=>s+x,0)/v.length; const p90=v[Math.floor(v.length*0.9)]; const mx=v.at(-1); return {seg:names[n]+'→'+names[seq[u+1]],mean:Math.round(mean),p90:Math.round(p90),max:Math.round(mx)}});
  out[label+' '+H+'시']={trainsPerHour:k,days:weekdays.length,segs};
 }}
fs.writeFileSync('subway_crowding_weekday.json',JSON.stringify(out,null,1));
for(const [k,v] of Object.entries(out)){const top=[...v.segs].sort((a,b)=>b.p90-a.p90)[0]; console.log(k,'열차',v.trainsPerHour,'대/시, 평일',v.days,'일 | 가장 붐비는 구간',top.seg,'평균',top.mean,'붐비는날(상위10%)',top.p90,'최대',top.max)}
