// Correctifs de l'audit du 24/10/2026 sur le moteur de plan : mineurs (MET-01), énergie disponible (MET-02), sortie longue en durée (MET-03),
// semaines allégées des débutants (MET-07), signes cardiaques dans les consignes (MET-12), assistant au maintien par défaut (MET-11).
// Usage : NODE_PATH=… node tests/audit-plan.js
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const inject=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,sessionKm,sessionMin,vmaOf,energy,dayFuel};\n})();\n");
const iso=d=>d.toISOString().slice(0,10), addD=(s,n)=>{ const d=new Date(s+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const TODAY="2026-10-07", monday=s=>{ const d=new Date(s+"T12:00:00Z"); return addD(s,-((d.getUTCDay()+6)%7)); };
const race=N=>addD(monday(addD(TODAY,7)),7*(N-1)+6);
const base={sexe:"H",age:35,taille:178,poids:75,cible:"",mg:"",activite:"1.25",niveau:"int",objectif:"10",volume:25,longest:10,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"2",longDay:"6",
  start:monday(addD(TODAY,7)),raceDate:"",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",sport:"course",sObj:"",hSem:"",cplx:"standard",pref:"",evalOn:"0",debRun:""};
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,600):"")); };
// exécuté dans la page : résumé du plan (volume, sortie longue en km et en minutes, énergie disponible la plus basse)
function summary(arr){ const T=window.__T; return arr.map(pr=>{ try{
  const n=T.profileNums(pr), v=T.vmaOf(n).vma, pl=T.buildPlan({...n,noAi:true}), E=T.energy(n,pl);
  const km=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0);
  const longs=pl.map(wk=>wk.days.find(d=>d.run&&d.run.type==="long")).filter(Boolean).map(d=>({km:T.sessionKm(d.run,v),min:T.sessionMin(d.run,v)}));
  const ea=Math.min(...pl.map(wk=>T.dayFuel(n,E,wk).ea).filter(Number.isFinite));
  return {vol:+n.volume||0,minor:n.minor,used:pl.unreal?pl.unreal.used:n.objectif,unrealMinor:!!(pl.unreal&&pl.unreal.minor),vma:v,peak:Math.max(...pl.map(km)),longKm:Math.max(0,...longs.map(x=>x.km)),longMin:Math.max(0,...longs.map(x=>x.min)),ea,
    weeks:pl.map(wk=>({w:wk.w,dl:!!wk.deload,ph:wk.phase,km:km(wk)}))};
}catch(e){ return {err:String(e&&e.stack||e).slice(0,300)}; } }); }

(async()=>{
  const S=await L.serve({"/app.js":inject}); const b=await chromium.launch(); const E=[];
  const ctx=await b.newContext({viewport:{width:1200,height:900},locale:"fr-FR"}); const p=await ctx.newPage();
  await p.clock.install({time:new Date(TODAY+"T10:00:00")});
  p.on("pageerror",e=>E.push(e.message));
  await p.addInitScript(sd=>{ localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","99"); },JSON.stringify({profile:base,isExample:false,log:[],week:1,seen:99}));
  await p.goto(S.url+"/"); await p.waitForFunction(()=>window.__T,null,{timeout:15000});
  const run=prs=>p.evaluate(summary,prs);

  // MET-01 : avant 18 ans, ni semi ni marathon ; 40 km par semaine et 1 h 30 de sortie longue au plus
  { const prs=[]; for(const age of [15,16,17]) for(const o of ["21","42"]) for(const niveau of ["int","conf"]) prs.push({...base,age,objectif:o,niveau,volume:niveau==="conf"?60:30,longest:niveau==="conf"?25:14,raceDate:race(18)});
    const r=await run(prs), bad=r.filter(x=>x.err||!x.minor||!x.unrealMinor||["21","42"].includes(x.used)||x.peak>Math.max(40.5,(x.vol||0)*1.02+.5)||x.longMin>91);
    ok(bad.length===0,"MET-01 mineurs : jamais de semi ni de marathon, 40 km par semaine (ou le volume déjà couru) et 90 min de sortie longue au plus ("+r.length+" profils)",bad[0]);
    const a=await run([{...base,age:18,objectif:"21",volume:30,longest:14,raceDate:race(16)}]); ok(a[0].used==="21"&&!a[0].unrealMinor,"MET-01 à 18 ans, le semi reste possible",a[0]); }

  // MET-03 : sortie longue plafonnée en durée (marathon 180 min, semi 150 min), jamais sous la distance nécessaire (28 km en marathon)
  { const prs=[]; for(const vmaRef of ["12","14","17"]) for(const o of ["21","42"]) for(const N of [16,20]) prs.push({...base,objectif:o,ref:"vma",refVal:vmaRef,volume:o==="42"?45:30,longest:o==="42"?20:14,raceDate:race(N)});
    const r=await run(prs), bad=r.filter(x=>{ if(x.err) return true; const cap={21:150,42:180}[x.used]; if(!cap) return false; const need={21:16,42:28}[x.used]; return x.longKm>Math.max(need,cap/60*x.vma*.64)+.6; });
    ok(bad.length===0,"MET-03 sortie longue : au plus 150 min (semi) ou 180 min (marathon), sauf la distance nécessaire",bad.map(x=>x.err||{vma:x.vma,used:x.used,longKm:x.longKm})[0]);
    const slow=r.find(x=>x.vma===12&&x.used==="42"); ok(!slow||slow.longKm<=28.6,"MET-03 VMA 12, marathon : sortie longue de 28 km au plus (32 km avant)",slow&&slow.longKm); }

  // MET-02 : énergie disponible jamais sous 30 kcal/kg de masse maigre, même avec un déficit de 300 + 100
  { const prs=[]; for(const [sexe,poids,taille] of [["H",80,180],["F",55,165],["F",60,168]]) for(const o of ["10","21","42"]) prs.push({...base,sexe,poids,taille,objectif:o,volume:35,longest:15,raceDate:race(16)});
    const r=await run(prs), bad=r.filter(x=>x.err||!(x.ea>=29.95));
    ok(bad.length===0,"MET-02 énergie disponible ≥ 30 kcal/kg de masse maigre chaque semaine ("+r.length+" profils)",bad.map(x=>x.ea||x.err)); }

  // MET-07 : débutant, une semaine allégée ne dépasse jamais de plus de 10 % la semaine normale d'avant
  { const prs=[]; for(const o of ["5","10"]) for(const N of [10,12,16,20]) prs.push({...base,niveau:"deb",objectif:o,volume:"",longest:3,seances:"3",raceDate:race(N)});
    const r=await run(prs); let n=0; const worse=[]; for(const x of r){ if(x.err){ worse.push(x.err); continue; } x.weeks.forEach((w,i)=>{ if(!w.dl||i===0) return; n++; const prev=[...x.weeks.slice(0,i)].reverse().find(y=>!y.dl&&y.ph!=="taper"&&y.ph!=="race"); if(prev&&w.km>prev.km*1.1+.3) worse.push("S"+w.w+" "+w.km.toFixed(1)+" > "+prev.km.toFixed(1)); }); }
    ok(n>0&&worse.length===0,"MET-07 débutant : semaines allégées jamais plus de 10 % au-dessus de la semaine normale d'avant ("+n+" semaines allégées)",worse.slice(0,4)); }

  // MET-12 : consignes des tests et de la VMA : arrêt et 15 en cas de douleur dans la poitrine, malaise, palpitations
  { const src=fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8"); ok((src.match(/douleur dans la poitrine, de malaise, de palpitations ou d'essoufflement anormal/g)||[]).length>=3,"MET-12 signes cardiaques dans les consignes des tests et des séances VMA"); }

  // MET-11 : l'assistant propose le maintien par défaut
  { const p2=await b.newPage(); await p2.addInitScript(()=>{ localStorage.setItem("carnet.cookies",JSON.stringify({v:1,analytics:false,at:new Date().toISOString()})); });
    await p2.goto(S.url+"/"); await p2.waitForTimeout(600); await p2.click('#homeCta [data-act="wizard"]'); await p2.waitForTimeout(300);
    ok(await p2.evaluate(()=>{ const r=document.querySelector('input[name="wz_def"]:checked'); return !!r&&r.value==="0"; }),"MET-11 assistant : maintien (0) sélectionné par défaut");
    ok(await p2.evaluate(()=>!/conseillé/.test(document.querySelector('[data-s="4"]').textContent)),"MET-11 assistant : plus de déficit « conseillé »"); await p2.close(); }

  ok(E.length===0,"aucune erreur de page",E.slice(0,3));
  await b.close(); S.close(); console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})();
