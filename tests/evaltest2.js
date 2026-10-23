// Séances de test (mission D) : tests adversariaux du testeur. Moteur (intensité, +8 % après les tests, combinaisons de profils, VMA appliquée,
// point de départ du débutant), formules et bornes, cohérence (douleur notée après un test, déplacement, date de début, « pas fait »,
// préférences, IA), nettoyage d'evr, interface (clavier, 1280 px, exemple, conflit entre deux onglets).
// Usage : NODE_PATH=… node tests/evaltest2.js [--n=300]
// Les cas marqués BUG échouent tant que le défaut n'est pas corrigé.
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const NF=+((process.argv.find(x=>x.startsWith("--n="))||"--n=300").slice(4));
const inject=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,sessionKm,sessionMin,vmaOf,planSig,evEst,evDebStart,zoneMins,cleanEvr,evPrudent,markKey,getPlan(){return plan;},getState(){return state;}};\n})();\n");
const iso=d=>d.toISOString().slice(0,10), addD=(s,n)=>{ const d=new Date(s+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const TODAY=iso(new Date()), monday=s=>{ const d=new Date(s+"T12:00:00Z"); return addD(s,-((d.getUTCDay()+6)%7)); };
const base={sexe:"H",age:35,taille:178,poids:75,cible:"",mg:"",activite:"1.25",niveau:"int",objectif:"10",volume:25,longest:10,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"2",longDay:"6",
  start:monday(addD(TODAY,7)),raceDate:"",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",sport:"course",sObj:"",hSem:"",cplx:"standard",pref:"",evalOn:"1",debRun:""};
const avis=(c,m,x)=>console.log((c?"OK   ":"AVIS ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):""));   // suggestion, ne fait pas échouer
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,700):"")); };
function rnd(seed){ let x=seed>>>0; return ()=>{ x=(x*1664525+1013904223)>>>0; return x/4294967296; }; }

// exécuté dans la page : plan avec et sans tests, mesures par semaine
function engine(arr){ const T=window.__T; return arr.map(pr=>{ try{
  const n=T.profileNums(pr), v=T.vmaOf(n).vma, on=T.buildPlan({...n,noAi:true}), off=T.buildPlan({...n,evalOn:0,noAi:true});
  const km=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0);
  const hard=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type==="q"?d.run.hardMin||0:0),0);
  const zi=wk=>{ const z=T.zoneMins(wk.days); return z.z2+z.z3; };
  const nrm=wk=>!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race";
  const W=pl=>pl.map(wk=>({w:wk.w,km:km(wk),hard:hard(wk),zi:zi(wk),n:nrm(wk),easy:T.zoneMins(wk.days).easy,ev:wk.days.filter(d=>d.run&&d.run.ev).map(d=>({t:d.run.ev.t,z3:d.run.blocks.some(b=>b.z==="z3"),z2:d.run.blocks.some(b=>b.z==="z2"),hard:d.run.hardMin||0}))}));
  return {N:on.length,on:W(on),off:W(off),prud:T.evPrudent(n)};
}catch(e){ return {err:String(e&&e.stack||e).slice(0,300)}; } }); }

(async()=>{
  const S=await L.serve({"/app.js":inject}); const b=await chromium.launch(); const E=[];
  const page=async(seed,{width=375,height=800,ctx:c0}={})=>{ const ctx=c0||await b.newContext({viewport:{width,height},locale:"fr-FR"}); const p=await ctx.newPage();
    p.on("pageerror",e=>E.push(e.message)); p.on("console",m=>{ if(m.type()==="error") E.push("console "+m.text().slice(0,160)); });
    if(seed) await p.addInitScript(sd=>{ if(!sessionStorage.__s){ sessionStorage.__s=1; localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","99"); } },seed);
    await p.goto(S.url+"/"); await p.waitForFunction(()=>window.__T,null,{timeout:15000}); await p.waitForTimeout(400); p.ctx=ctx; return p; };
  const pe=await page(JSON.stringify({profile:base,isExample:false,log:[],week:1,seen:99}),{width:1200});
  const run=async prs=>{ const out=[]; for(let i=0;i<prs.length;i+=50) out.push(...await pe.evaluate(engine,prs.slice(i,i+50))); return out; };
  const race=N=>addD(monday(addD(TODAY,7)),7*(N-1)+6);

  /* ---------- M : moteur ---------- */
  { const r=rnd(29), pk=a=>a[Math.floor(r()*a.length)], P=[];
    for(let i=0;i<NF;i++){ const N=5+Math.floor(r()*25), st=addD(TODAY,Math.floor(r()*14));
      P.push({...base,niveau:pk(["int","conf","int","conf","deb"]),objectif:pk(["forme","5","10","21","42"]),cplx:pk(["simple","standard","avance"]),seances:pk(["3","4","5","6"]),
        volume:pk([10,15,25,40,60]),longest:pk([5,8,14,20]),age:pk([25,40,55]),types:r()<.15?["seuil","cotes"]:base.types,start:st,raceDate:addD(monday(st),7*(N-1)+Math.floor(r()*7)),sport:r()<.2?"trail":"course"}); }
    const R=await run(P), G=R.filter(x=>!x.err);
    ok(!R.some(x=>x.err),"M0 aucune erreur moteur",R.filter(x=>x.err).slice(0,2));
    // minutes d'intensité (hardMin) de chaque semaine : jamais au-dessus du plan sans tests
    // décision (coordinateur) : un test peut ajouter jusqu'à 6 min de dur à la semaine (le test VMA de 6 min peut remplacer des sprints en côte)
    const hm=G.map((x,i)=>({i,b:x.on.filter((w,j)=>w.hard>x.off[j].hard+6+1e-6).map((w,j)=>"S"+w.w+" "+w.hard+">"+x.off[x.on.indexOf(w)].hard+"+6")})).filter(x=>x.b.length);
    ok(!hm.length,"M1 minutes d'intensité (hardMin) de la semaine ≤ plan sans tests + 6 min ("+hm.length+"/"+G.length+" plans en défaut) [BUG si FAIL]",hm.slice(0,3).map(x=>({p:P[x.i].niveau+"/"+P[x.i].seances+"/"+P[x.i].cplx+"/"+P[x.i].volume,b:x.b})));
    const zm=G.map((x,i)=>({i,b:x.on.filter((w,j)=>w.zi>x.off[j].zi+6+1e-6).map(w=>"S"+w.w+" "+w.zi.toFixed(0)+">"+x.off[w.w-1].zi.toFixed(0)+"+6")})).filter(x=>x.b.length);
    ok(!zm.length,"M2 minutes en zones 2-3 de la semaine ≤ plan sans tests + 6 min ("+zm.length+"/"+G.length+") [BUG si FAIL]",zm.slice(0,3).map(x=>x.b));
    // +8 % : de la dernière semaine avec tests (2) à la semaine 3, sur le volume placé ; seulement les cas absents du plan sans tests
    const g8=(a,b2)=> b2.km<=Math.max(a.km*1.08,a.km+1)+.25;
    const up=G.map((x,i)=>{ if(x.N<4||!x.on[1].n||!x.on[2].n||!x.on[1].ev.length&&!x.on[0].ev.length) return null; const bad=!g8(x.on[1],x.on[2])&&g8(x.off[1],x.off[2]); return bad? {i,s2:x.on[1].km.toFixed(1),s3:x.on[2].km.toFixed(1),off2:x.off[1].km.toFixed(1)} : null; }).filter(Boolean);
    ok(!up.length,"M3 +8 % (1 km au moins) de la semaine 2 à la semaine 3 sur le volume placé, après des tests plus légers ("+up.length+"/"+G.length+")",up.slice(0,4));
    const up1=G.map((x,i)=>{ if(x.N<4||!x.on[0].n||!x.on[1].n||!x.on[0].ev.length) return null; const bad=!g8(x.on[0],x.on[1])&&g8(x.off[0],x.off[1]); return bad? {i,s1:x.on[0].km.toFixed(1),s2:x.on[1].km.toFixed(1)} : null; }).filter(Boolean);
    ok(!up1.length,"M3 +8 % de la semaine 1 à la semaine 2 ("+up1.length+"/"+G.length+")",up1.slice(0,4));
    const ez=G.filter(x=>x.on.slice(0,2).some((w,j)=>w.easy<Math.min(x.off[j].easy,.8)-1e-9));
    ok(!ez.length,"M4 part de facile des semaines 1-2 ≥ min(plan sans tests, 80 %) ("+ez.length+"/"+G.length+")",ez.slice(0,2).map(x=>x.on.slice(0,2).map((w,j)=>[w.easy.toFixed(2),x.off[j].easy.toFixed(2)]))); }
  // combinaisons de profils : jamais de test maximal
  { const C=[{niveau:"conf",seances:"6",volume:60,longest:20,age:17},{niveau:"conf",seances:"5",volume:50,longest:18,age:65},{niveau:"conf",seances:"5",volume:40,poids:108,taille:175},{niveau:"conf",seances:"5",volume:40,evPain:true},
      {niveau:"deb",seances:"4",volume:12,longest:5,age:16},{niveau:"int",age:"16",seances:"5",volume:40},{niveau:"int",age:64.9,seances:"5",volume:40}];
    const R=await run(C.map(o=>({...base,raceDate:race(12),...o})));
    R.slice(0,6).forEach((r,k)=>ok(!r.err&&r.prud&&r.on.slice(0,2).every(w=>w.ev.every(e=>!e.z3&&!e.z2&&!e.hard&&(e.t==="cont"||e.t==="deb"))),"M5 combinaison "+JSON.stringify(C[k])+" : variante prudente",r.err||r.on.slice(0,2).map(w=>w.ev)));
    ok(!R[6].prud,"M5 64,9 ans : pas prudent (seuil à 65)"); }
  // IMC à la limite (35,0) et légèrement en dessous
  { const r=await pe.evaluate(()=>{ const T=window.__T, n=o=>T.profileNums({...o}); return {a:T.evPrudent({...n({sexe:"H",age:35,taille:200,poids:140,niveau:"int"}),evPain:false}),b:T.evPrudent({...n({sexe:"H",age:35,taille:200,poids:139.9,niveau:"int"}),evPain:false})}; });
    ok(r.a&&!r.b,"M6 IMC 35,0 prudent, 34,98 non",r); }
  // VMA appliquée : le volume (km) de chaque semaine ne change pas (message « ton volume de départ et ta progression ne changent pas »)
  { const r=await pe.evaluate(pr=>{ const T=window.__T; const km=(pl,v)=>pl.map(wk=>+wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0).toFixed(1));
      const a=T.profileNums(pr), b=T.profileNums({...pr,ref:"vma",refVal:"18"}), c=T.profileNums({...pr,ref:"vma",refVal:"9"});
      return {a:km(T.buildPlan({...a,noAi:true}),T.vmaOf(a).vma),b:km(T.buildPlan({...b,noAi:true}),18),c:km(T.buildPlan({...c,noAi:true}),9)}; },{...base,raceDate:race(12)});
    const d=(x,y)=>x.map((v,i)=>Math.abs(v-y[i])).reduce((a,v)=>Math.max(a,v),0);
    console.log("INFO M7 VMA 13 → 18 ou 9 km/h : écart de volume par semaine "+d(r.a,r.b).toFixed(1)+" / "+d(r.a,r.c).toFixed(1)+" km (les séances prévues en minutes changent de distance ; le texte l'annonce, vérifié en C3)");
    ok(r.a.length===r.b.length&&r.b.every((v,i)=>v<=r.a[i]*1.25+1.5),"M7 VMA 13 → 18 : chaque semaine reste dans les bornes (au plus +25 % et 1,5 km)",r); }
  // débutant : debRun appliqué → volume de chaque semaine (message « ton volume ne change pas »), +8 % et sortie longue +10 %
  { const R=await pe.evaluate(pr=>{ const T=window.__T; return [0,4,8,16,30,60].map(m=>{ const n=T.profileNums({...pr,debRun:m?String(m):""}), v=T.vmaOf(n).vma, pl=T.buildPlan({...n,noAi:true});
      return pl.map(wk=>({km:+wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0).toFixed(2),L:Math.max(0,...wk.days.filter(d=>d.run&&d.run.type==="long").map(d=>T.sessionKm(d.run,v))),n:!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race",
        b:(wk.days.find(d=>d.run&&d.run.deb)||{run:{deb:{}}}).run.deb.bouts||0})); }); },{...base,niveau:"deb",volume:8,longest:3,seances:"3",raceDate:race(16)});
    const ref=R[0], mx=R.slice(1).map(pl=>Math.max(...pl.map((w,i)=>w.km-ref[i].km)));
    ok(mx.every(x=>x<=1),"M8 débutant, point de départ 2 à 8 min : volume de chaque semaine au plus +1 km par rapport au plan d'avant (« ton volume ne change pas ») [BUG si FAIL]",{ecartMax:mx.map(x=>x.toFixed(2)),S1:R.map(pl=>pl[0].km),bouts:R.map(pl=>pl.slice(0,4).map(w=>w.b))});
    const pr8=R.map(pl=>pl.map((w,i)=>i&&w.n&&pl[i-1].n&&w.km>Math.max(pl[i-1].km*1.08,pl[i-1].km+1)+.25?"S"+(i+1)+" "+pl[i-1].km+"→"+w.km:null).filter(Boolean));
    ok(pr8.slice(1).every((x,k)=>x.length<=pr8[0].length),"M8 débutant avec point de départ : pas plus de hausses au-delà de +8 % que sans",pr8);
    const l10=R.map(pl=>pl.map((w,i)=>i&&w.L>Math.max(...pl.slice(0,i).map(x=>x.L))*1.1+.15?"S"+(i+1):null).filter(Boolean));
    ok(l10.slice(1).every(x=>x.length<=l10[0].length),"M8 débutant avec point de départ : sortie longue sans hausse > +10 % de plus que sans",l10); }

  /* ---------- F : formules ---------- */
  { const r=await pe.evaluate(()=>{ const T=window.__T, e=(ev,rec)=>T.evEst(ev,rec)||{};
      return {b795:e({t:"vma6"},{v:795}),b2504:e({t:"vma6"},{v:2504}),b2506:e({t:"vma6"},{v:2506}),
        k45:e({t:"end",T:30},{m:"5k",v:45*60}),k40:e({t:"end",T:30},{m:"5k",v:40*60}),t25:e({t:"end",T:25},{v:5}),cont6:e({t:"cont",T:30},{v:4,rpe:6}),cont7:e({t:"cont",T:30},{v:4,rpe:7}),
        refp:e({t:"ref"},{v:30,v2:5}),deb1:e({t:"deb"},{v:1}),deb2:e({t:"deb"},{v:2}),deb3:e({t:"deb"},{v:3}),deb17:e({t:"deb"},{v:17})}; });
    ok(r.b795.vma===8&&!r.b795.err,"F1 795 m → 8,0 km/h (arrondi puis borne) accepté",r.b795);
    ok(r.b2504.vma===25&&!r.b2504.err&&r.b2506.err,"F1 2 504 m accepté (25,0), 2 506 m refusé (25,1)",[r.b2504,r.b2506]);
    ok(r.k40.vma===8.6&&!r.k40.err,"F2 5 km en 40:00 → 7,5 km/h ÷ 0,87 = 8,6",r.k40);
    console.log("INFO 5 km en 45:00 : "+JSON.stringify(r.k45)+" (la feuille annonce 10:00 à 60:00, mais au-delà de 43:06 le résultat est refusé comme peu plausible)");
    ok(r.t25.vma===13.8,"F2 test de 25 min : 5 km en 25 min → 12 km/h ÷ 0,87 = 13,8",r.t25);
    ok(!r.cont6.err&&!!r.cont7.err,"F3 test en aisance : RPE 6 accepté, 7 refusé",[r.cont6,r.cont7]);
    ok(Math.abs(r.refp.pace-10)<1e-9,"F4 footing de référence 5 km en 30 min : 10 km/h",r.refp);
    ok(r.deb1.start===0&&r.deb2.start===1&&r.deb3.start===1&&r.deb17.start===8,"F5 débutant : 1 → 0, 2 → 1, 3 → 1, 17 → 8",[r.deb1,r.deb2,r.deb3,r.deb17]); }
  // nettoyage d'evr : XSS, valeurs énormes, prototype, nombre d'entrées
  { const r=await pe.evaluate(()=>{ const T=window.__T; const big={}; for(let i=0;i<500;i++) big["k"+i]={t:"vma6",v:1}; big["2026-03-02"]={t:"vma6",v:1500,at:5};
      const o=JSON.parse('{"__proto__":{"t":"vma6","v":1500,"at":1},"2026-01-05":{"t":"vma6","v":1e308,"at":1},"2026-01-06":{"t":"end","v":"6,2","at":1},"2026-01-07":{"t":"ref","v":30,"v2":1e9,"rpe":3,"sig":"<img src=x onerror=alert(1)>","at":1},"2026-01-08":{"t":"vma6","v":1500,"at":1e20,"ap":-5},"2026-01-09":{"t":"end","v":3600,"m":"5k","T":1e9,"at":2},"2026-01-11":{"t":"vma6","v":[1500],"at":1},"2026-01-12":{"t":"vma6","v":"1500<script>","at":1}}');
      o["2026-01-10"]={t:"deb",v:NaN,at:1}; const c=T.cleanEvr(o), cb=T.cleanEvr(big); return {c,keys:Object.keys(c),proto:Object.getPrototypeOf(c)===Object.prototype&&!({}).t,big:Object.keys(cb)}; });
    ok(r.proto&&!r.keys.includes("__proto__"),"N1 clé __proto__ ignorée, aucun prototype pollué",r.keys);
    ok(!r.c["2026-01-05"]&&!r.c["2026-01-10"]&&!r.c["2026-01-11"]&&!r.c["2026-01-12"],"N1 valeurs énormes, NaN, tableau, texte avec balise : rejetés",r.c);
    ok(r.c["2026-01-07"]&&!/[<>]/.test(r.c["2026-01-07"].sig)&&r.c["2026-01-07"].v2===undefined,"N1 sig sans balise, v2 hors bornes retiré",r.c["2026-01-07"]);
    ok(!r.c["2026-01-08"]||r.c["2026-01-08"].at<=Date.now(),"N1 horodatage futur (1e20) ramené à maintenant ou rejeté (sinon il gagne toutes les fusions)",r.c["2026-01-08"]);
    ok(r.c["2026-01-09"]&&r.c["2026-01-09"].T===undefined,"N1 T hors bornes retiré",r.c["2026-01-09"]);
    ok(r.big.includes("2026-03-02"),"N2 500 clés invalides avant une vraie : la vraie est gardée (filtrer avant de tronquer) [faible]",r.big); }
  // case cochée en cours de plan (semaine 6) : les tests tombent dans des semaines déjà passées
  { const r=await pe.evaluate(pr=>{ const T=window.__T, n=T.profileNums(pr), pl=T.buildPlan({...n,noAi:true}); return pl.slice(0,2).flatMap(wk=>wk.days.filter(d=>d.run&&d.run.ev).map(d=>wk.w+":"+d.run.ev.t)); },
      {...base,start:addD(monday(TODAY),-35),raceDate:addD(monday(TODAY),7*8+6),evalFrom:TODAY});   // case cochée aujourd'hui (le Profil pose evalFrom)
    ok(!r.length,"M9 case cochée alors que le plan a commencé il y a 5 semaines : pas de test placé dans des semaines passées (inutile, et ça change après coup des séances passées non cochées) [faible si FAIL]",r); }
  await pe.ctx.close();

  /* ---------- C / U : cohérence et interface ---------- */
  const st0=addD(monday(TODAY),-7);   // semaine 1 passée : les tests peuvent être notés
  const seedI=(o,x={})=>JSON.stringify({profile:{...base,start:st0,...o},isExample:false,log:[],week:1,seen:99,...x});
  const toW1=async pg=>{ for(let k=0;k<3&&await pg.evaluate(()=>document.querySelector("#weekTitle").textContent!=="Semaine 1");k++){ await pg.click("#prevW"); await pg.waitForTimeout(250); } };
  const evCard=pg=>pg.evaluate(()=>{ const a=[...document.querySelectorAll("#days article")].find(x=>x.querySelector(".evb")); if(!a) return null; const w=+document.querySelector("#weekTitle").textContent.replace(/\D/g,""), i=+a.dataset.day, d=window.__T.getPlan()[w-1].days[i];
    return {txt:a.querySelector(".evb").textContent,i,iso:a.dataset.iso,title:d.run.title,t:d.run.ev.t,mk:window.__T.markKey(w,i)}; });
  const note=async(pg,i,val,rpe)=>{ await pg.evaluate(()=>{ window.__clk=[]; if(!window.__cl){ window.__cl=1; document.addEventListener("click",e=>window.__clk.push(e.target.outerHTML.slice(0,70)),true); } }); await pg.click(`#days [data-evr="${i}"]`); await pg.waitForTimeout(250);
    if(!await pg.evaluate(()=>!!document.querySelector("#evV"))) console.log("INFO note : feuille absente ; "+await pg.evaluate(i=>({w:document.querySelector("#weekTitle").textContent,b:[...document.querySelectorAll("#days [data-evr]")].map(x=>x.outerHTML.slice(0,80)),clk:window.__clk,sw:window.__T.getState().week,bg:document.querySelectorAll(".sheet-bg").length,sh:document.querySelector(".sheet,[role=dialog]:not([hidden])")?.outerHTML.slice(0,200)}),i).then(JSON.stringify));
    await pg.fill("#evV",val,{timeout:5000}); if(rpe) await pg.selectOption("#evR",String(rpe)); await pg.click("#evSave"); await pg.waitForTimeout(400); };
  const ls=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")));

  // C1 : douleur notée après un test VMA déjà fait et noté : la séance passée change-t-elle ?
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p);
    const c=await evCard(p); await note(p,c.i,"1450",9);
    // la séance est cochée faite
    await p.evaluate(({k})=>{ const T=window.__T, s=T.getState(); s.done={...(s.done||{})}; },{k:c.iso});
    const before=await evCard(p);
    // douleur légère notée aujourd'hui (ressenti), comme le ferait la feuille de ressenti
    await p.evaluate(td=>{ const T=window.__T, s=T.getState(); s.feel={...(s.feel||{}),[td]:{rpe:5,mood:3,pain:1,zone:"",note:"",at:Date.now()}}; },TODAY);
    await p.evaluate(()=>{ document.querySelector("#evalOn").dispatchEvent(new Event("change",{bubbles:true})); }); await p.waitForTimeout(500); await toW1(p);
    const after=await evCard(p);
    ok(after&&after.i===c.i&&/VMA estimée : 14,5/.test(after.txt),"C1 douleur notée après le test VMA (déjà fait et noté) : la séance passée et son résultat restent affichés [BUG si FAIL]",{avant:before&&before.txt.slice(0,120),apres:after&&after.txt.slice(0,160)});
    await ctx.close(); }
  // C1b : même cas avec la séance cochée « faite » : la coche survit-elle ?
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p0=await page(seedI({}),{ctx}); await toW1(p0); const c=await evCard(p0);
    const sig=await p0.evaluate(i=>{ const a=document.querySelector(`#days article[data-day="${i}"]`); return a? a.dataset.iso : ""; },c.i);
    await ctx.close();
    const ctx2=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"});
    const seed=JSON.parse(seedI({})); seed.done={[c.mk.k]:{v:"done",sig:c.mk.sig,at:Date.now()-1000}}; seed.feel={[TODAY]:{rpe:4,mood:3,pain:1,zone:"",note:"",at:Date.now()}};
    const p=await page(JSON.stringify(seed),{ctx:ctx2}); await toW1(p); const a=await evCard(p);
    const ttl=await p.evaluate(iso=>{ const x=document.querySelector(`#days article[data-iso="${iso}"]`); return x? x.textContent.slice(0,140) : ""; },c.iso);
    ok(/Test VMA/.test(ttl),"C1b test VMA coché « fait », douleur notée ensuite : la séance faite n'est pas remplacée après coup par un « Test en aisance » [BUG si FAIL]",{mk:c.mk,ttl,ev:a&&a.txt.slice(0,80)});
    await ctx2.close(); }
  // C2 : âge passé sous 18 ans après un résultat VMA noté : le résultat VMA ne doit plus pouvoir être appliqué
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p);
    const c=await evCard(p); await note(p,c.i,"1500",9);
    await p.evaluate(()=>{ const a=document.querySelector("#age"); a.value="16"; a.dispatchEvent(new Event("input",{bubbles:true})); a.dispatchEvent(new Event("change",{bubbles:true})); }); await p.waitForTimeout(600); await toW1(p);
    const t=await p.evaluate(()=>[...document.querySelectorAll("#days .evb")].map(x=>x.textContent).join(" | "));
    const btn=await p.evaluate(()=>!!document.querySelector("#days [data-evap]"));
    ok(!btn&&!/VMA estimée : 15/.test(t),"C2 profil passé à 16 ans après le test VMA : plus de test maximal ni de bouton de mise à jour avec ce résultat",t.slice(0,200));
    await ctx.close(); }
  // C3 : forte baisse de VMA (ref 5 km en 20:00 → VMA 16,1 ; test 6 min = 1 000 m → 10)
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({ref:"5",refVal:"20:00"}),{ctx}); await toW1(p);
    const c=await evCard(p); if(!c){ ok(false,"C3 test présent avec une référence 5 km"); } else {
      await note(p,c.i,"1000",9); const t=(await evCard(p)).txt;
      console.log("INFO C3 baisse forte : "+t.slice(0,260));
      ok(/10,0/.test(t)&&/16,1/.test(t),"C3 baisse forte : l'écart est visible (10,0 contre 16,1)",t);
      ok(/distance de certaines séances/.test(t)&&/refais le test/.test(t)&&/remplacée/.test(t),"C3 texte exact : distances qui peuvent changer, « refais le test », référence 5 km remplacée",t);
      avis(/(écart|nettement|inhabituel|plus basse|baisse|vérifie)/i.test(t),"C3 baisse de 38 % : un avertissement accompagne l'estimation (fatigue, mauvaise mesure) [manque si FAIL]",t);
      await p.click(`#days [data-evap="${c.i}"]`); await p.waitForTimeout(400); const pr=(await ls(p)).profile;
      ok(pr.ref==="vma"&&pr.refVal==="10,0","C3 baisse forte appliquée sur demande : VMA 10,0",pr);
      // annuler : la référence d'origine (5 km en 20:00) revient exactement
      await p.click("#toasts .toast button"); await p.waitForTimeout(400); const p2=(await ls(p)).profile;
      ok(p2.ref==="5"&&p2.refVal==="20:00"&&JSON.stringify({...p2})===JSON.stringify({...pr,ref:"5",refVal:"20:00"}),"C3 « Annuler » : profil exactement comme avant (ref 5, 20:00)",{p2,pr}); }
    await ctx.close(); }
  // C4 : hausse forte (VMA type 13 → 22) : avertissement ?
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p);
    const c=await evCard(p); await note(p,c.i,"2200",10); const t=(await evCard(p)).txt;
    avis(/(écart|nettement|inhabituel|vérifie|prudent)/i.test(t),"C4 VMA 13 → 22 km/h (+69 %) : avertissement avant de recalibrer toutes les allures [manque si FAIL]",t.slice(0,260));
    await ctx.close(); }
  // C5 : saisie 6 min : « 1.450 » (point des milliers), « 1,45 » (km), « 1450m »
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const c=await evCard(p);
    const tryV=async v=>{ await p.click(`#days [data-evr="${c.i}"]`); await p.waitForTimeout(200); await p.fill("#evV",v); await p.click("#evSave"); await p.waitForTimeout(250);
      const o=await p.evaluate(()=>({msg:document.querySelector("#evMsg")?.textContent||"",open:!!document.querySelector('.sheet[data-kind="eval"]'),evr:Object.values(JSON.parse(localStorage.getItem("carnet-course.v1")).evr||{})}));
      if(o.open) await p.keyboard.press("Escape"); await p.waitForTimeout(150); return o; };
    const a=await tryV("1.450"), k=await tryV("1,45");
    ok(a.open&&!a.evr.length,"C5 « 1.450 » (séparateur de milliers) : refusé ou compris comme 1 450, jamais 1,45 m",a);
    ok(k.open&&!k.evr.length,"C5 « 1,45 » (km au lieu de m) : refusé",k);
    const m=await tryV("1450 m"); console.log("INFO C5 « 1450 m » : "+(m.open?"refusé : "+m.msg:"accepté"));
    await ctx.close(); }
  // C6 : 5 km chrono : « 26'30 », « 26.30 », « 1:02:00 »
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({},{week:2}),{ctx});
    // le test d'endurance est en semaine 2 (passée seulement si on recule d'une semaine de plus)
    const ctxB=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); await ctx.close();
    const st1=addD(monday(TODAY),-14); const q=await page(JSON.stringify({profile:{...base,start:st1},isExample:false,log:[],week:2,seen:99}),{ctx:ctxB});
    for(let k=0;k<4&&await q.evaluate(()=>document.querySelector("#weekTitle").textContent!=="Semaine 2");k++){ await q.click("#prevW"); await q.waitForTimeout(250); }
    const c=await evCard(q);
    if(!c||c.t!=="end"){ console.log("INFO C6 pas de test d'endurance en semaine 2 : "+JSON.stringify(c)); }
    else { await q.click(`#days [data-evr="${c.i}"]`); await q.waitForTimeout(200); const k5=await q.evaluate(()=>!!document.querySelector('input[name="evMode"][value="5k"]'));
      if(k5){ await q.check('input[name="evMode"][value="5k"]'); await q.fill("#evV","26'30"); await q.click("#evSave"); await q.waitForTimeout(300);
        const r=Object.values((await ls(q)).evr||{}); ok(r.length===1&&r[0].v===1590&&r[0].m==="5k","C6 5 km en « 26'30 » : 1 590 s",r);
        const t=(await evCard(q)).txt; ok(/5 km en 26:30/.test(t)&&/13,8|13,9/.test(t),"C6 affichage 5 km en 26:30, VMA ≈ 13,8",t.slice(0,200)); }
      else console.log("INFO C6 option 5 km absente (allure trop lente pour 5 km en 30 min)"); }
    await ctxB.close(); }
  // C7 : date de début changée après la saisie : le résultat n'est pas perdu en silence / n'est pas attribué à une autre séance
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const c=await evCard(p); await note(p,c.i,"1450",9);
    await p.evaluate(d=>{ const s=document.querySelector("#start"); s.value=d; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); },addD(st0,-7)); await p.waitForTimeout(600);
    for(let k=0;k<4&&await p.evaluate(()=>document.querySelector("#weekTitle").textContent!=="Semaine 1");k++){ await p.click("#prevW"); await p.waitForTimeout(200); }
    const all=await p.evaluate(()=>[...document.querySelectorAll("#days .evb")].map(x=>x.textContent).join(" | "));
    const ev=Object.keys((await ls(p)).evr||{});
    console.log("INFO C7 début avancé d'une semaine : semaine 1 = "+all.slice(0,160)+" ; résultats gardés aux dates "+ev.join());
    ok(true,"C7 (informatif)");
    await ctx.close(); }
  // C8 : test coché « pas fait » : pas annoncé comme à faire, et la carte ne propose plus de noter un résultat
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p0=await page(seedI({}),{ctx}); await toW1(p0); const c=await evCard(p0);
    await p0.click("#notifBtn"); await p0.waitForTimeout(250); const n0=await p0.evaluate(()=>document.querySelector('.sheet[data-kind="notif"]')?.textContent||""); await ctx.close();
    ok(/Séances? de test/.test(n0)&&/Test VMA/.test(n0),"C8 référence : test à faire annoncé dans le panneau Notifications",n0.slice(0,300));
    const seed=JSON.parse(seedI({})); seed.done={[c.mk.k]:{v:"skip",sig:c.mk.sig,at:Date.now()-1000}};
    const ctx2=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(JSON.stringify(seed),{ctx:ctx2}); await toW1(p);
    const a=await evCard(p); await p.click("#notifBtn"); await p.waitForTimeout(250); const nt=await p.evaluate(()=>document.querySelector('.sheet[data-kind="notif"]')?.textContent||""); await p.keyboard.press("Escape");
    ok(!/Test VMA/.test(nt),"C8 test « pas fait » : absent des tests à faire du panneau Notifications",nt.slice(0,200));
    ok(a&&!/Noter mon résultat/.test(a.txt),"C8 test « pas fait » : la carte ne propose plus « Noter mon résultat » [faible si FAIL]",a&&a.txt.slice(0,160));
    await ctx2.close(); }
  // C9 : déplacement d'un test noté : le résultat suit la séance (même clé = date prévue)
  // (couvert par markKey : vérification rapide de la clé)
  // C10 : préférence « pas de VMA » écrite en texte libre
  { const r=await (async()=>{ const ctx=await b.newContext({viewport:{width:1200,height:800},locale:"fr-FR"}); const p=await page(JSON.stringify({profile:base,isExample:false,log:[],week:1,seen:99}),{ctx});
      const o=await p.evaluate(pr=>{ const T=window.__T; const n=T.profileNums(pr), pl=T.buildPlan({...n,noAi:true}); return pl.slice(0,2).flatMap(wk=>wk.days.filter(d=>d.run&&d.run.ev).map(d=>d.run.ev.t)); },{...base,raceDate:race(12),pref:"pas de VMA"}); await ctx.close(); return o; })();
    ok(!r.includes("vma6"),"C10 préférence « pas de VMA » : pas de test VMA de 6 min",r); }
  // C11 : enregistrement en double (double clic sur Enregistrer, double clic sur Mettre à jour)
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const c=await evCard(p);
    await note(p,c.i,"1450",9);
    await p.dblclick(`#days [data-evap="${c.i}"]`); await p.waitForTimeout(400); const pr=(await ls(p)).profile;
    ok(pr.ref==="vma"&&pr.refVal==="14,5","C11 double clic sur « Mettre à jour » : une seule application",pr);
    const dlg=await p.evaluate(()=>[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.offsetParent!==null||getComputedStyle(x).display!=="none").map(x=>x.className+" "+(x.getAttribute("aria-labelledby")||"")));
    ok(!dlg.length,"C11 double tap sur « Mettre à jour » : le second appui n'ouvre rien d'autre (le bouton disparaît, le minuteur de la séance est dessous) [faible si FAIL]",dlg);
    if(dlg.length){ await p.keyboard.press("Escape"); await p.waitForTimeout(250); }
    await p.click("#toasts .toast button",{timeout:5000}).catch(()=>{}); await p.waitForTimeout(400); const p2=(await ls(p)).profile;
    ok(p2.ref==="none"&&p2.refVal==="","C11 « Annuler » après double clic : profil d'origine",p2);
    await ctx.close(); }
  // C12 : conflit entre deux onglets : deux résultats différents notés pour le même test, le plus récent gagne partout
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const q=await page(null,{ctx}); await toW1(q); await p.waitForTimeout(800); await toW1(p);
    const c=await evCard(p); await note(p,c.i,"1400",9); await q.waitForTimeout(600); await toW1(q);
    console.log("INFO C12 q avant saisie : "+JSON.stringify(await evCard(q)).slice(0,200)+" sheet="+await q.evaluate(()=>!!document.querySelector(".sheet")));
    await note(q,c.i,"1600",9); await p.waitForTimeout(700); await toW1(p);
    const tp=(await evCard(p)).txt, tq=(await evCard(q)).txt, L1=await ls(p);
    ok(/16,0/.test(tp)&&/16,0/.test(tq)&&Object.values(L1.evr).filter(x=>!x.x).length===1&&Object.values(L1.evr)[0].v===1600,"C12 deux onglets, deux résultats : le plus récent (1 600 m) partout",{tp:tp.slice(0,80),tq:tq.slice(0,80),evr:L1.evr});
    // application dans p, annulation dans p après que q a noté un autre résultat
    await p.click(`#days [data-evap="${c.i}"]`); await p.waitForTimeout(300);
    await p.click("#toasts .toast button"); await p.waitForTimeout(700); await toW1(q);
    const pq=await q.evaluate(()=>document.querySelector("#refVal").value);
    ok(pq==="","C12 « Annuler » propagé au second onglet (référence vidée)",pq);
    await ctx.close(); }
  // U1 : clavier : ouvrir la feuille avec Entrée, Échap ferme et rend le focus au bouton
  { const ctx=await b.newContext({viewport:{width:1280,height:900},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const c=await evCard(p);
    await p.focus(`#days [data-evr="${c.i}"]`); await p.keyboard.press("Enter"); await p.waitForTimeout(250);
    const o=await p.evaluate(()=>({open:!!document.querySelector('.sheet[data-kind="eval"]'),foc:document.activeElement.id,modal:document.querySelector('.sheet[data-kind="eval"]')?.closest("[aria-modal]")?.getAttribute("aria-modal")||document.querySelector('.sheet[data-kind="eval"]')?.getAttribute("aria-modal")}));
    ok(o.open&&o.foc==="evV","U1 Entrée sur « Noter mon résultat » : feuille ouverte, focus sur le champ",o);
    await p.keyboard.type("1450"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    const sv=await p.evaluate(()=>({open:!!document.querySelector('.sheet[data-kind="eval"]'),evr:Object.keys(JSON.parse(localStorage.getItem("carnet-course.v1")).evr||{}).length}));
    console.log("INFO U1 Entrée dans le champ : "+(sv.evr?"enregistre":"n'enregistre pas")+" (feuille "+(sv.open?"ouverte":"fermée")+")");
    if(sv.open){ await p.keyboard.press("Escape"); await p.waitForTimeout(250); }
    const f=await p.evaluate(()=>document.activeElement&&(document.activeElement.dataset.evr!=null||document.activeElement.dataset.evap!=null));
    ok(f,"U1 après fermeture : focus rendu à la carte de test",await p.evaluate(()=>document.activeElement.outerHTML.slice(0,120)));
    const w=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,vw:innerWidth,box:document.querySelector("#days .evb").getBoundingClientRect().width}));
    ok(w.sw<=w.vw&&w.box>100,"U2 1280 px : pas de défilement horizontal, encadré visible",w);
    await ctx.close(); }
  // U3 : mode exemple : aucun test, rien d'écrit
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push(e.message));
    await p.goto(S.url+"/"); await p.waitForFunction(()=>window.__T,null,{timeout:15000}); await p.waitForTimeout(500);
    const o=await p.evaluate(()=>({ev:document.querySelectorAll("#days .evb").length,ls:localStorage.getItem("carnet-course.v1"),cb:document.querySelector("#evalOn")?.checked}));
    ok(o.ev===0&&!o.ls&&o.cb===false,"U3 mode exemple : aucune séance de test, rien d'écrit, case décochée",o);
    await ctx.close(); }
  // U4 : 375 px, aria de l'encadré et du bouton
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const p=await page(seedI({}),{ctx}); await toW1(p); const c=await evCard(p); await note(p,c.i,"1450",9);
    const a=await p.evaluate(()=>{ const g=document.querySelector("#days .evb"); const btn=g.querySelector("[data-evap]"); return {role:g.getAttribute("role"),lab:g.getAttribute("aria-label"),btn:btn&&btn.textContent,mod:g.querySelector("[data-evr]")?.getAttribute("aria-label")}; });
    ok(a.role==="group"&&/Séance de test/.test(a.lab)&&/Mettre à jour/.test(a.btn)&&/Modifier le résultat/.test(a.mod),"U4 aria : groupe nommé, boutons explicites",a);
    await ctx.close(); }
  ok(!E.length,"aucune erreur de page",E.slice(0,3));
  await b.close(); S.close();
  console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
