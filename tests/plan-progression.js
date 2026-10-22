// Mesure de la progression des plans (pas un test bloquant) : volumes semaine par semaine, écart à une droite, hausse max,
// types de séances d'intensité distincts cumulés. Usage : node tests/plan-progression.js [--detail] ; APP=<chemin d'un autre app.js> pour comparer.
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const SRC=process.env.APP||path.join(L.ROOT,"app.js"), DETAIL=process.argv.includes("--detail");
const appT=()=>fs.readFileSync(SRC,"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,sessionKm,vmaOf,get state(){return state;}};\n})();\n");
const base={sexe:"H",age:35,taille:178,poids:80,cible:"75",start:"2026-10-26",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",renfo:"2",longDay:"6",ref:"",refVal:""};
const LVL={deb:{niveau:"deb",volume:10,longest:4,seances:"3"},int:{niveau:"int",volume:25,longest:10,seances:"4"},conf:{niveau:"conf",volume:45,longest:18,seances:"5"}};
const day=(iso,n)=>{ const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
(async()=>{
  const S=await L.serve({"/config.js":L.cfgJs(),"/app.js":appT}); const b=await chromium.launch(); const ctx=await b.newContext({locale:"fr-FR"}); const p=await ctx.newPage();
  await p.addInitScript(sd=>{ localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); },JSON.stringify({profile:{...base,...LVL.int,objectif:"10"},isExample:false,log:[],week:1,seen:15}));
  await p.goto(S.url+"/"); await p.waitForTimeout(800);
  const cases=[]; for(const lv of ["deb","int","conf"]) for(const o of ["5","10","21","42"]) for(const N of [8,12,16,20,24]) for(const c of ["simple","standard","avance"])
    cases.push({lv,o,N,c,prof:{...base,...LVL[lv],objectif:o,cplx:c,raceDate:day(base.start,7*(N-1)+6)}});
  const R=await p.evaluate(cases=>{ const T=window.__T;
    return cases.map(cs=>{ const n=T.profileNums(cs.prof), pl=T.buildPlan({...n,noAi:true}), v=T.vmaOf(n).vma;
      const wk=pl.map(w=>({w:w.w,ph:w.phase,dl:!!w.deload,V:w.V,L:w.L,lim:!!w.limited,km:w.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0),k:w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind).map(d=>d.run.kind)}));
      return {lv:cs.lv,o:cs.o,N:cs.N,c:cs.c,unreal:pl.unreal?pl.unreal.used:null,wk}; }); },cases);
  await b.close(); S.close();
  // indicateurs sur les semaines normales (hors semaine 1, allégées, affûtage, course)
  const stats=r=>{ const nw=r.wk.filter(w=>!w.dl&&w.ph!=="taper"&&w.ph!=="race"&&w.w>1);
    if(nw.length<2) return null; const ip=nw.reduce((a,w,i)=>w.km>nw[a].km?i:a,0), x0=nw[0].w, y0=nw[0].km, xp=nw[ip].w, yp=nw[ip].km;
    // écart à la droite reliant la 1re semaine normale au pic
    let dev=0; for(const w of nw.slice(0,ip+1)){ const y=xp===x0?y0:y0+(yp-y0)*(w.w-x0)/(xp-x0); dev=Math.max(dev,Math.abs(w.km-y)/Math.max(1,yp)); }
    let up=0; for(let i=1;i<nw.length;i++) up=Math.max(up,nw[i].km/nw[i-1].km-1);
    // part de la hausse totale faite au premier tiers des semaines jusqu'au pic (33 % = linéaire)
    const t=nw.slice(0,ip+1), third=t.find(w=>w.w>=x0+(xp-x0)/3)||t[0], front= yp>y0+.5&&t.length>=5? (third.km-y0)/(yp-y0) : null;   // trop peu de semaines (plan de 8) : non mesuré
    const seen=new Set(), cum=r.wk.map(w=>{ w.k.forEach(k=>seen.add(k)); return seen.size; });
    // variété du moment : types distincts sur 4 semaines, au début (S1 à S4) et juste avant l'affûtage
    const win=a=>new Set(a.flatMap(w=>w.k)).size, pre=r.wk.filter(w=>w.ph!=="taper"&&w.ph!=="race");
    return {start:y0,peak:yp,dev,up,front,cum,types:seen.size,steps:cum.filter((c,i)=>c>(i?cum[i-1]:0)).length,w0:win(pre.slice(0,4)),w1:win(pre.slice(-4))}; };
  const CASE=(process.argv.find(a=>a.startsWith("--case="))||"").slice(7);
  if(CASE){ for(const r of R.filter(r=>[r.lv,r.o,r.N,r.c].join("/")===CASE)) for(const w of r.wk) console.log(w.w,w.ph,w.dl?"allégée":"",(w.V||0).toFixed(1),w.L,w.lim?"limité":"",w.km.toFixed(1),w.k.join(",")); return; }
  const rows=R.map(r=>({r,s:stats(r)})).filter(x=>x.s);
  const pct=x=>(x*100).toFixed(0)+"%", avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  if(DETAIL) for(const {r,s} of rows) console.log([r.lv,r.o,r.N,r.c].join("/").padEnd(18)+(r.unreal?"→"+r.unreal:"").padEnd(7)+" km "+r.wk.map(w=>(w.dl?"(":"")+w.km.toFixed(0)+(w.dl?")":"")).join(" ")+" | dev "+pct(s.dev)+" up "+pct(s.up)+" front "+(s.front==null?"-":pct(s.front))+" | types "+s.cum.join("")+" | 4 sem. "+s.w0+"→"+s.w1);
  console.log("plans mesurés : "+rows.length);
  console.log("écart max à la droite (1re semaine normale → pic), en % du pic : moyenne "+pct(avg(rows.map(x=>x.s.dev)))+", pire "+pct(Math.max(...rows.map(x=>x.s.dev))));
  console.log("hausse max entre deux semaines normales : moyenne "+pct(avg(rows.map(x=>x.s.up)))+", pire "+pct(Math.max(...rows.map(x=>x.s.up))));
  const fr=rows.map(x=>x.s.front).filter(x=>x!=null); console.log("part de la hausse faite au premier tiers (33 % = linéaire) : moyenne "+pct(avg(fr)));
  { const nd=rows.filter(x=>x.r.lv!=="deb"), f2=nd.map(x=>x.s.front).filter(x=>x!=null);
    console.log("hors débutant ("+nd.length+" plans) : écart droite moy. "+pct(avg(nd.map(x=>x.s.dev)))+", pire "+pct(Math.max(...nd.map(x=>x.s.dev)))+" ; hausse max pire "+pct(Math.max(...nd.map(x=>x.s.up)))+" ; premier tiers moy. "+pct(avg(f2))+" ; plans chargés au début (> 50 % de la hausse au premier tiers) : "+f2.filter(x=>x>.5).length); }
  console.log("pic / départ : moyenne "+avg(rows.map(x=>x.s.peak/Math.max(1,x.s.start))).toFixed(2));
  const wq=rows.filter(x=>x.s.types>=2); console.log("plans à 2 types ou plus où les types arrivent en 2 étapes ou plus : "+wq.filter(x=>x.s.steps>=2).length+"/"+wq.length);
  const wr=rows.filter(x=>x.r.lv!=="deb"); console.log("types distincts sur 4 semaines (hors débutant) : début "+avg(wr.map(x=>x.s.w0)).toFixed(2)+" → avant affûtage "+avg(wr.map(x=>x.s.w1)).toFixed(2)+" ; plans où la variété croît : "+wr.filter(x=>x.s.w1>x.s.w0).length+"/"+wr.length+", décroît : "+wr.filter(x=>x.s.w1<x.s.w0).length);
  for(const c of ["simple","standard","avance"]){ const z=rows.filter(x=>x.r.c===c); console.log("  "+c.padEnd(9)+" types "+avg(z.map(x=>x.s.types)).toFixed(2)+" ; 4 sem. début/fin "+avg(z.filter(x=>x.r.lv!=="deb").map(x=>x.s.w0)).toFixed(2)+"/"+avg(z.filter(x=>x.r.lv!=="deb").map(x=>x.s.w1)).toFixed(2)+" ; étapes "+avg(z.map(x=>x.s.steps)).toFixed(2)+" ; hausse max "+pct(Math.max(...z.map(x=>x.s.up)))+" ; écart droite moy. "+pct(avg(z.map(x=>x.s.dev))));
    for(const lv of ["int","conf"]){ const zz=z.filter(x=>x.r.lv===lv); console.log("     "+lv.padEnd(5)+" types "+avg(zz.map(x=>x.s.types)).toFixed(2)+" ; étapes "+avg(zz.map(x=>x.s.steps)).toFixed(2)); } }
  // simple vs standard : semaines où le simple dépasse
  let over=0, overMax=0, tot=0; for(const x of R.filter(r=>r.c==="simple")){ const st=R.find(r=>r.c==="standard"&&r.lv===x.lv&&r.o===x.o&&r.N===x.N); x.wk.forEach((w,i)=>{ tot++; const sk=st.wk[i]?st.wk[i].km:Infinity, e=w.km-sk; if(e>.05){ over++; overMax=Math.max(overMax,e/sk); if(DETAIL) console.log("  simple > standard : "+[x.lv,x.o,x.N].join("/")+" S"+w.w+" "+w.km.toFixed(1)+" > "+sk.toFixed(1)); } }); }
  console.log("simple au-dessus du standard : "+over+"/"+tot+" semaines, écart max "+pct(overMax));
})().catch(e=>{ console.error(e); process.exit(1); });
