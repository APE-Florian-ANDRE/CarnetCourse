// Ajustement IA sur tout l'entraînement : footings (lignes droites, cardio sans impact), sortie longue allégée, renforcement d'entretien,
// en plus des séances d'intensité. Envoi complet, garde-fous (jamais plus de volume ni d'intensité, rien en affûtage ni en course, débutant protégé).
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"21",volume:30,longest:14,seances:"5",renfo:"2",longDay:"6",start:"2026-09-28",raceDate:"2027-02-14",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non"};
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,400):"")); };
const appT=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,planSig,cleanAip,sessionKm,sessionDur,vmaOf,aipBody,weekMin,get state(){return state;}};\n})();\n");
(async()=>{ const S=await L.serve({"/config.js":L.cfgJs(),"/app.js":appT}); const b=await chromium.launch(); const E=[];
 const p=await (await b.newContext({locale:"fr-FR"})).newPage(); p.on("pageerror",e=>E.push(e.message));
 await p.addInitScript(sd=>{ localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); },JSON.stringify({profile:prof,isExample:false,log:[],week:1,seen:15}));
 await p.goto(S.url+"/"); await p.waitForTimeout(900);
 const R=await p.evaluate(()=>{ const T=window.__T, out={};
   const run=(n,all)=>{ const v=T.vmaOf(n).vma, base=T.buildPlan({...n,noAi:true}), wk={};
     for(const w of base) wk[w.w]={f:"",c:"",q:[],a:0,e:w.days.filter(d=>d.run&&d.run.type==="easy").map((d,j)=>all||j%2? "cardio" : "lignes"),l:1,r:["leger","leger","leger"]};
     T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk}});
     const pl=T.buildPlan(n), rows=[];
     for(const w of pl){ const w0=base[w.w-1], km=ds=>ds.filter(d=>d.run&&d.run.type!=="race"&&!d.run.blocks.some(x=>x.cross)).reduce((a,d)=>a+T.sessionKm(d.run,v),0);
       const hard=ds=>ds.reduce((a,d)=>a+(d.run&&d.run.hardMin||0),0);
       rows.push({w:w.w,phase:w.phase,dl:!!w0.deload,rf0:w0.days.filter(d=>d.renfo&&!d.renfo.light).length,km0:km(w0.days),km1:km(w.days),h0:hard(w0.days),h1:hard(w.days),days0:w0.days.map(d=>!!(d.run||d.renfo)).join(),days1:w.days.map(d=>!!(d.run||d.renfo)).join(),
         cardio:w.days.filter(d=>d.run&&d.run.ai&&d.run.blocks.some(x=>x.cross)).length,lignes:w.days.filter(d=>d.run&&d.run.ai&&/lignes droites/.test(d.run.title)).length,
         long:(()=>{ const a=w0.days.find(d=>d.run&&d.run.type==="long"), c=w.days.find(d=>d.run&&d.run.type==="long"); return a&&c? [T.sessionKm(a.run,v),T.sessionKm(c.run,v),!!c.run.ai] : null; })(),
         renfoAi:w.days.filter(d=>d.renfo&&d.renfo.aiFrom).length,renfoLight:w.days.filter(d=>d.renfo&&d.renfo.aiFrom).every(d=>d.renfo.light),
         mod:w.days.filter(d=>(d.run&&d.run.ai)||(d.renfo&&d.renfo.aiFrom)).length}); }
     return {rows,n:pl.ai&&pl.ai.n}; };
   const n=T.profileNums(T.state.profile); out.int=run(n,false); out.intCardio=run(n,true);
   out.deb=run(T.profileNums({...T.state.profile,niveau:"deb",objectif:"forme",seances:"3",volume:8,longest:4,raceDate:""}),false);
   const body=T.aipBody(false,""); out.body={n:body.semaines.length,fac:body.semaines.filter(w=>w.faciles&&w.faciles.length).length,lon:body.semaines.filter(w=>w.longue).length,ren:body.semaines.filter(w=>w.renfo&&w.renfo.length).length,
     sample:body.semaines.find(w=>!w.allegee&&w.faciles&&w.longue&&w.renfo),size:JSON.stringify(body).length};
   return out; });
 const I=R.int.rows, open=I.filter(r=>r.phase!=="taper"&&r.phase!=="race");
 ok(R.body.fac>=R.body.n-2&&R.body.lon>=R.body.n-2&&R.body.ren>=R.body.n-2,"envoi : footings, sortie longue et renfo de chaque semaine",R.body);
 ok(R.body.sample&&R.body.sample.faciles.every(f=>Number.isInteger(f.j)&&f.min>0&&f.options.includes("cardio"))&&R.body.sample.longue.options.join()==="allege"&&R.body.sample.renfo[0].options.join()==="leger","envoi : jour, durée et options permises de chaque séance",R.body.sample);
 ok(R.body.size<45000,"envoi : taille sous la limite du serveur",R.body.size);
 ok(R.int.n>=open.length*3,"une demande appliquée partout : bien plus que 4 séances modifiées",{n:R.int.n,semaines:open.length});
 ok(open.every(r=>r.lignes+r.cardio>=1&&r.renfoAi===r.rf0&&r.renfoLight),"chaque semaine hors affûtage : footings ajustés, renfo passé en entretien (déjà le cas en semaine allégée)",open.map(r=>[r.w,r.lignes,r.cardio,r.renfoAi]));
 ok(open.filter(r=>r.long).every(r=>r.long[2]&&r.long[1]<=r.long[0]*.86+.15),"sortie longue allégée : environ 15 % de moins",open.map(r=>r.long));
 ok(I.every(r=>r.km1<=r.km0+.05),"jamais plus de kilomètres courus qu'avant",I.filter(r=>r.km1>r.km0+.05));
 ok(I.every(r=>r.h1<=r.h0+1e-9),"jamais plus de minutes d'intensité",I.filter(r=>r.h1>r.h0));
 ok(I.every(r=>r.days0===r.days1),"mêmes jours de séance",I.filter(r=>r.days0!==r.days1).map(r=>r.w));
 ok(I.filter(r=>r.phase==="taper"||r.phase==="race").every(r=>r.mod===0),"affûtage et semaine de course : rien ne change");
 ok(R.intCardio.rows.every(r=>r.cardio<=2),"cardio : au plus 2 footings par semaine",R.intCardio.rows.map(r=>r.cardio));
 const D=R.deb.rows; ok(D.every(r=>r.lignes===0&&r.renfoAi===0&&!(r.long&&r.long[2])),"débutant : ni lignes droites, ni sortie longue raccourcie, ni renfo changé",D.map(r=>[r.w,r.lignes,r.renfoAi,r.long]));
 ok(D.some(r=>r.cardio>0),"débutant : le cardio sans impact reste possible");
 // temps choisi : renfo de 1 h 30, 5 h de sport par semaine au plus (un plafond, jamais un objectif)
 const TM=await p.evaluate(()=>{ const T=window.__T; T.state.aip={}; const v=T.vmaOf(T.profileNums(T.state.profile)).vma;
   const run=o=>{ const n=T.profileNums({...T.state.profile,...o}), base=T.buildPlan(T.profileNums({...T.state.profile})), pl=T.buildPlan(n);
     return {n:{renfoMin:n.renfoMin,hQuota:n.hQuota},rows:pl.map(w=>{ const w0=base[w.w-1], q=ds=>ds.filter(d=>d.run&&d.run.type==="q").map(d=>d.run.title+":"+Math.round(T.sessionDur(d.run))).join();
       return {w:w.w,phase:w.phase,t0:T.weekMin(w0),t:T.weekMin(w),time:w.time||null,rm:w.days.filter(d=>d.renfo).map(d=>parseInt(d.renfo.m)),q0:q(w0.days),q1:q(w.days),
         km0:w0.days.filter(d=>d.run).reduce((a,d)=>a+T.sessionKm(d.run,v),0),km1:w.days.filter(d=>d.run).reduce((a,d)=>a+T.sessionKm(d.run,v),0)}; })}; };
   const body=(()=>{ T.state.profile={...T.state.profile,renfoMin:"90",hQuota:"5"}; const b=T.aipBody(false,""); T.state.profile={...T.state.profile,renfoMin:"",hQuota:""}; return b.temps; })();
   return {q5:run({renfoMin:"90",hQuota:"5"}),big:run({hQuota:"25"}),deb:run({niveau:"deb",objectif:"forme",raceDate:"",seances:"3",volume:8,longest:4,renfoMin:"90"}),body}; });
 const Q=TM.q5.rows.filter(r=>r.phase!=="race");
 ok(TM.q5.rows.every(r=>r.rm.every(m=>m===90)),"renfo : chaque séance dure la durée choisie (90 min)",TM.q5.rows.map(r=>r.rm));
 ok(Q.every(r=>r.time&&(r.t<=r.time.cap+5||r.time.t>r.time.cap+5)),"quota : chaque semaine sous 5 h, ou signalée au-dessus",Q.map(r=>[r.w,r.t,r.time]));
 ok(Q.some(r=>r.t<r.t0)&&Q.every(r=>r.km1<=r.km0+.05),"quota : footings et sortie longue raccourcis, jamais de kilomètre en plus",Q.map(r=>[r.w,Math.round(r.km0),Math.round(r.km1)]));
 ok(Q.every(r=>r.q0===r.q1),"quota : séances d'intensité inchangées",Q.filter(r=>r.q0!==r.q1).map(r=>r.w));
 ok(TM.big.rows.every(r=>r.t===r.t0),"quota large (25 h) : rien n'est ajouté ni changé");
 ok(TM.deb.n.renfoMin===60&&TM.deb.rows.every(r=>r.rm.every(m=>m===60)),"débutant : renfo plafonné à 60 min",TM.deb.n);
 ok(TM.body&&TM.body.renfo_min===90&&TM.body.quota_h===5,"IA : temps choisi transmis",TM.body);
 console.log("INFO quota 5 h + renfo 90 : "+Q.map(r=>"S"+r.w+" "+Math.round(r.t0)+"→"+Math.round(r.t)+(r.time&&r.time.t>r.time.cap+5?"!":"")).join(" "));
 ok(E.length===0,"aucune erreur JavaScript",E);
 await b.close(); console.log(fails? fails+" échec(s)" : "Tout est OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
