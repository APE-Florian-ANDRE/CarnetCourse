// Séances de test en début de plan (mission D) : moteur (présence, nombre, variantes prudentes, plans courts, volume jamais dépassé),
// calcul de la VMA et bornes, interface (saisie sur la carte, refus d'un résultat aberrant, bouton de mise à jour, recalcul, annulation,
// panneau Notifications passif, synchro entre deux onglets, case du profil, téléphone 375 px).
// Usage : NODE_PATH=… node tests/evaltest.js [--n=400]
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const NF=+((process.argv.find(x=>x.startsWith("--n="))||"--n=400").slice(4));
const inject=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,sessionKm,sessionMin,vmaOf,planSig,evEst,evDebStart,zoneMins,cleanEvr};\n})();\n");
const iso=d=>d.toISOString().slice(0,10), addD=(s,n)=>{ const d=new Date(s+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const TODAY=iso(new Date()), monday=s=>{ const d=new Date(s+"T12:00:00Z"); return addD(s,-((d.getUTCDay()+6)%7)); };
const base={sexe:"H",age:35,taille:178,poids:75,cible:"",mg:"",activite:"1.25",niveau:"int",objectif:"10",volume:25,longest:10,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"2",longDay:"6",
  start:monday(addD(TODAY,7)),raceDate:"",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",sport:"course",sObj:"",hSem:"",cplx:"standard",pref:"",evalOn:"1",debRun:""};
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,600):"")); };
function rnd(seed){ let x=seed>>>0; return ()=>{ x=(x*1664525+1013904223)>>>0; return x/4294967296; }; }

// exécuté dans la page : résumé des séances de test d'un plan, et comparaison avec le même plan sans tests
function engine(arr){ const T=window.__T; return arr.map(pr=>{ try{
  const n=T.profileNums(pr), v=T.vmaOf(n).vma, on=T.buildPlan({...n,noAi:true}), off=T.buildPlan({...n,evalOn:0,noAi:true});
  const km=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0);
  const tests=[], bad=[];
  on.forEach((wk,j)=>wk.days.forEach((d,i)=>{ if(!d.run||!d.run.ev) return; const o=off[j].days[i];
    tests.push({w:wk.w,i,t:d.run.ev.t,type:d.run.type,z3:d.run.blocks.some(b=>b.z==="z3"&&b.min>0),z2:d.run.blocks.some(b=>b.z==="z2"),km:T.sessionKm(d.run,v),km0:o&&o.run?T.sessionKm(o.run,v):-1,wasQ:!!(o&&o.run&&o.run.type==="q"),title:d.run.title,note:d.run.note||""}); }));
  on.forEach((wk,j)=>{ if(km(wk)>km(off[j])+1e-6) bad.push("S"+wk.w+" "+km(wk).toFixed(2)+" > "+km(off[j]).toFixed(2)); });
  const w1=on[0], first=w1&&w1.days.find(d=>d.run&&d.kind!=="before");
  const diff=on.slice(2).some((wk,j)=>JSON.stringify(wk.days)!==JSON.stringify(off[j+2].days));
  return {N:on.length,tests,bad,first:first?first.run.type:null,ph1:w1?w1.phase:null,diff,sigOn:T.planSig({...n,evalOn:1}),sigOff:T.planSig({...n,evalOn:0})};
}catch(e){ return {err:String(e&&e.stack||e).slice(0,300)}; } }); }

(async()=>{
  const S=await L.serve({"/app.js":inject}); const b=await chromium.launch(); const E=[];
  const page=async(seed,{width=375,height=800,ctx:c0}={})=>{ const ctx=c0||await b.newContext({viewport:{width,height},locale:"fr-FR"}); const p=await ctx.newPage();
    p.on("pageerror",e=>E.push(e.message)); p.on("console",m=>{ if(m.type()==="error") E.push("console "+m.text().slice(0,160)); });
    if(seed) await p.addInitScript(sd=>{ if(!sessionStorage.__s){ sessionStorage.__s=1; localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","99"); } },seed);
    await p.goto(S.url+"/"); await p.waitForFunction(()=>window.__T,null,{timeout:15000}); await p.waitForTimeout(400); p.ctx=ctx; return p; };
  const pe=await page(JSON.stringify({profile:base,isExample:false,log:[],week:1,seen:99}),{width:1200});
  const run=async prs=>{ const out=[]; for(let i=0;i<prs.length;i+=60) out.push(...await pe.evaluate(engine,prs.slice(i,i+60))); return out; };
  const race=N=>addD(monday(addD(TODAY,7)),7*(N-1)+6);

  /* ---------- moteur ---------- */
  { const [a,b5,b5low,b3,off]=await run([{...base,raceDate:race(12)},{...base,seances:"5",volume:40,longest:14,raceDate:race(12)},{...base,seances:"5",raceDate:race(12)},{...base,seances:"3",raceDate:race(12)},{...base,evalOn:"0",raceDate:race(12)}]);
    ok(a.tests.map(x=>x.t).join()==="vma6,end","E1 intermédiaire, 4 séances, 12 semaines : test VMA puis test d'endurance",a.tests);
    ok(a.tests[0].w===1&&a.tests[1].w===2,"E1 un test exigeant par semaine (S1 puis S2)",a.tests.map(x=>x.w));
    ok(b5.tests.length===3&&b5.tests.some(x=>x.t==="ref"),"E1 5 séances : trois tests dont le footing de référence",b5.tests.map(x=>x.t));
    ok(b5low.tests.length===2&&b5low.tests.every(x=>x.km<=x.km0+1e-9),"E1 5 séances à 25 km : le test d'endurance ne tient dans aucune séance, il est retiré (jamais de volume en plus)",b5low.tests.map(x=>x.t+" "+x.km.toFixed(1)+"/"+x.km0.toFixed(1)));
    ok(b3.tests.length===1&&b3.tests[0].t==="vma6","E1 3 séances : un seul test",b3.tests.map(x=>x.t));
    ok(off.tests.length===0,"E1 case décochée : aucun test");
    ok(a.sigOn!==a.sigOff,"E1 le choix entre dans planSig");
    ok(!a.diff,"E1 les semaines 3 et suivantes ne changent pas");
    ok(a.tests.every(x=>x.wasQ),"E1 les tests exigeants remplacent des séances d'intensité");
    const t0=a.tests[0]; ok(/échauffement|Pars vite/i.test(JSON.stringify(t0))&&/Ne fais pas ce test si tu as mal/.test(t0.note)&&/÷ 100/.test(t0.note),"E1 consignes : échauffement, mesure, quand ne pas faire le test",t0.note);
    ok(a.first!=="q"&&a.first!=="long"&&b5.first!=="q","E1 première séance du plan toujours facile (firstWeekFix)",[a.first,b5.first]); }
  { const [noV]=await run([{...base,types:["seuil","cotes","fartlek"],raceDate:race(12)}]); ok(noV.tests.map(x=>x.t).join()==="end","E1 VMA décochée : test d'endurance seulement",noV.tests); }
  // variantes prudentes : jamais de test maximal
  { const R=await run([{...base,niveau:"deb",volume:8,longest:3,seances:"3",raceDate:race(12)},{...base,age:16,raceDate:race(12)},{...base,age:68,raceDate:race(12)},{...base,poids:120,taille:175,raceDate:race(12)},{...base,evPain:true,raceDate:race(12)}]);
    const nm=["débutant","moins de 18 ans","65 ans et plus","IMC de 35 et plus","douleur notée"];
    R.forEach((r,k)=>ok(r.tests.length>=1&&r.tests.every(x=>x.t===(k?"cont":"deb")&&!x.z3&&!x.z2&&x.type==="easy"),"E2 "+nm[k]+" : variante prudente, sans test maximal",r.tests));
    ok(/minutes tu as couru sans t'arrêter/.test(R[0].tests[0].note),"E2 débutant : consigne « combien de minutes tu as couru sans t'arrêter »",R[0].tests[0]); }
  // plans courts, semaine 1 = course, autres sports
  { const R=await run([{...base,raceDate:race(4)},{...base,raceDate:race(5)},{...base,sport:"vtt",hSem:"4"},{...base,objectif:"forme"}]);
    ok(R[0].N===4&&R[0].tests.length===0,"E3 plan de 4 semaines : aucun test",R[0]);
    ok(R[1].N===5&&R[1].tests.length>=1,"E3 plan de 5 semaines : un test",R[1].tests);
    ok(R[2].tests.length===0,"E3 VTT : aucun test");
    ok(R[3].tests.length>=1,"E3 objectif forme : tests proposés",R[3].tests); }
  // fuzz : volume jamais dépassé (semaine et séance), première séance facile, aucune erreur
  { const r=rnd(11), pk=a=>a[Math.floor(r()*a.length)], P=[];
    for(let i=0;i<NF;i++){ const N=4+Math.floor(r()*30), st=addD(TODAY,Math.floor(r()*14)); P.push({...base,niveau:pk(["deb","int","conf"]),objectif:pk(["forme","5","10","21","42"]),cplx:pk(["simple","standard","avance"]),seances:pk(["3","4","5","6"]),
      volume:pk([0,8,15,25,40,70]),longest:pk([0,3,8,14,25]),age:pk([16,30,45,70]),poids:pk([60,75,120]),types:r()<.2?pk([[],["ld"],["seuil"]]):base.types,ref:pk(["none","vma","5"]),refVal:pk(["14","25:00",""]),
      start:st,raceDate:addD(monday(st),7*(N-1)+Math.floor(r()*7)),sport:r()<.2?"trail":"course",lieu:pk(["dehors","tapis","mixte"])}); }
    const R=await run(P); const err=R.filter(x=>x.err), over=R.filter(x=>!x.err&&x.bad.length), sess=R.filter(x=>!x.err&&x.tests.some(t=>t.km>t.km0+1e-6)), fst=R.filter(x=>!x.err&&x.ph1!=="race"&&(x.first==="q"||x.first==="long")),
      late=R.filter(x=>!x.err&&x.tests.some(t=>t.w>2)), short=R.filter(x=>!x.err&&x.N<=4&&x.tests.length), mx=R.filter((x,i)=>!x.err&&(P[i].niveau==="deb"||P[i].age<18||P[i].age>=65||P[i].poids>=120)&&x.tests.some(t=>t.z3||t.z2));
    ok(!err.length,"E4 "+NF+" profils aléatoires : aucune erreur",err.slice(0,2));
    ok(!over.length,"E4 volume de chaque semaine jamais au-dessus du plan sans tests",over.slice(0,2).map(x=>x.bad));
    ok(!sess.length,"E4 chaque séance de test au plus aussi longue que la séance remplacée",sess.slice(0,2).map(x=>x.tests));
    ok(!fst.length,"E4 première séance facile (firstWeekFix)",fst.length);
    ok(!late.length&&!short.length,"E4 tests en semaines 1 et 2 seulement, aucun sur un plan de 4 semaines",[late.length,short.length]);
    ok(!mx.length,"E4 débutant, mineur, 65 ans et plus, IMC 35 et plus : jamais de test maximal",mx.length);
    console.log("INFO "+R.filter(x=>x.tests&&x.tests.length).length+"/"+NF+" plans avec au moins un test"); }

  /* ---------- calcul de la VMA et bornes ---------- */
  { const r=await pe.evaluate(()=>{ const T=window.__T, e=(ev,rec)=>T.evEst(ev,rec);
      return {a:e({t:"vma6"},{v:1500}).vma,b:e({t:"end",T:30},{v:6.2}).vma,c:e({t:"end",T:30},{m:"5k",v:1500}).vma,d:e({t:"cont",T:30},{v:4,rpe:4}).vma,
        hi:e({t:"vma6"},{v:3200}).err,lo:e({t:"vma6"},{v:700}).err,ok8:e({t:"vma6"},{v:800}).err,cr:e({t:"cont",T:30},{v:4,rpe:8}).err,
        s10:T.evDebStart(10),s1:T.evDebStart(1),s30:T.evDebStart(30),s5:T.evDebStart(5),
        cl:T.cleanEvr({"2026-01-05":{t:"vma6",v:99999,at:1},"2026-01-06":{t:"zz",v:3,at:1},"2026-01-07":{t:"vma6",v:"1450",rpe:"20",at:5},"bad":{t:"deb",v:3}})}; });
    ok(r.a===15,"V1 6 min : VMA = distance ÷ 100 (1 500 m → 15 km/h)",r.a);
    ok(r.b===14.3,"V1 30 min : VMA = vitesse ÷ 0,87 (6,2 km → 14,3 km/h)",r.b);
    ok(r.c===13.8,"V1 5 km en 25:00 : VMA = 12 km/h ÷ 0,87 = 13,8",r.c);
    ok(r.d===10.7,"V1 test en aisance : vitesse ÷ 0,75 (4 km en 30 min → 10,7)",r.d);
    ok(!!r.hi&&!!r.lo&&!r.ok8,"V2 VMA hors de 8 à 25 km/h refusée (3 200 m, 700 m), 800 m accepté",r);
    ok(!!r.cr,"V2 test en aisance à RPE 8 : estimation refusée",r.cr);
    ok(r.s10===5&&r.s1===0&&r.s30===8&&r.s5===2,"V3 débutant : premier palier = moitié de la course continue, 8 min au plus",r);
    ok(Object.keys(r.cl).join()==="2026-01-07"&&r.cl["2026-01-07"].rpe===0&&r.cl["2026-01-07"].v===1450,"V4 nettoyage des résultats : bornes, type inconnu, date invalide",r.cl); }
  // débutant : le point de départ appliqué change les fractions de course, volume de la semaine 1 jamais au-dessus
  { const r=await pe.evaluate(pr=>{ const T=window.__T, n=T.profileNums(pr), v=T.vmaOf(n).vma, a=T.buildPlan({...n,noAi:true}), b=T.buildPlan({...T.profileNums({...pr,debRun:"12"}),noAi:true});
      const bout=pl=>{ const d=pl[1].days.find(x=>x.run&&x.run.deb); return d? d.run.deb.bouts : 0; }, km=wk=>wk.days.reduce((s,d)=>s+(d.run&&d.run.type!=="race"?T.sessionKm(d.run,v):0),0);
      return {a:bout(a),b:bout(b),k1:km(b[0]),cap:(n.volume||8)*1.05+.01,sig:T.planSig(n)!==T.planSig(T.profileNums({...pr,debRun:"12"}))}; },{...base,niveau:"deb",volume:8,longest:3,seances:"3",raceDate:race(12)});
    ok(r.b>r.a&&r.b===6,"V5 débutant, 12 min sans s'arrêter : fractions de 6 min dès le début",r);
    ok(r.k1<=r.cap&&r.sig,"V5 volume de la semaine 1 borné, point de départ dans planSig",r); }
  await pe.ctx.close();

  /* ---------- interface ---------- */
  const st0=addD(monday(TODAY),-7);   // semaine 1 passée : les tests peuvent être notés
  const seedI=o=>JSON.stringify({profile:{...base,start:st0,...o},isExample:false,log:[],week:1,seen:99});
  const ctxA=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"});
  const p=await page(seedI({}),{ctx:ctxA});
  const toW1=async pg=>{ for(let k=0;k<3&&await pg.evaluate(()=>document.querySelector("#weekTitle").textContent!=="Semaine 1");k++){ await pg.click("#prevW"); await pg.waitForTimeout(250); } };
  await toW1(p);
  const card=()=>p.evaluate(()=>{ const a=[...document.querySelectorAll("#days article")].find(x=>x.querySelector(".evb")); return a? {txt:a.querySelector(".evb").textContent,i:a.dataset.day,evr:!!a.querySelector("[data-evr]"),ap:!!a.querySelector("[data-evap]"),chip:!!a.querySelector(".chip.ev")} : null; });
  const lsP=()=>p.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")));
  let c=await card(); ok(c&&c.evr&&c.chip&&/Séance de test/.test(c.txt),"U1 carte de la séance de test : encadré, puce « Test », bouton « Noter mon résultat »",c);
  const nb0=await p.evaluate(()=>document.querySelector("#notifBtn").outerHTML);
  { await p.click(`#days [data-evr="${c.i}"]`); await p.waitForTimeout(250);
    const sh=await p.evaluate(()=>{ const s=document.querySelector('.sheet[data-kind="eval"]'); if(!s) return null; const i=s.querySelector("#evV"), l=s.querySelector('label[for="evV"]');
      return {lab:l&&l.textContent,dlg:s.getAttribute("role")||s.closest("[role=dialog]")?.getAttribute("role"),foc:document.activeElement.id,sw:document.documentElement.scrollWidth,vw:innerWidth,r:s.getBoundingClientRect().right}; });
    ok(sh&&/mètres/.test(sh.lab)&&sh.foc==="evV","U2 feuille de saisie : champ distance étiqueté, focus dessus",sh);
    ok(sh&&sh.sw<=sh.vw&&sh.r<=sh.vw+.5,"U2 375 px : la feuille ne déborde pas",sh);
    await p.fill("#evV","abc"); await p.click("#evSave"); await p.waitForTimeout(150);
    let m=await p.evaluate(()=>({msg:document.querySelector("#evMsg").textContent,inv:document.querySelector("#evV").getAttribute("aria-invalid"),evr:JSON.parse(localStorage.getItem("carnet-course.v1")).evr}));
    ok(/mètres/.test(m.msg)&&m.inv==="true"&&!Object.keys(m.evr||{}).length,"U3 saisie illisible : message relié au champ, rien d'enregistré",m);
    await p.fill("#evV","3200"); await p.click("#evSave"); await p.waitForTimeout(150);
    m=await p.evaluate(()=>({msg:document.querySelector("#evMsg").textContent,sheet:!!document.querySelector('.sheet[data-kind="eval"]'),evr:JSON.parse(localStorage.getItem("carnet-course.v1")).evr}));
    ok(/peu plausible/.test(m.msg)&&/32/.test(m.msg)&&m.sheet&&!Object.keys(m.evr||{}).length,"U3 résultat aberrant (3 200 m → 32 km/h) refusé avec un message, rien d'enregistré",m);
    await p.fill("#evV","1 450"); await p.selectOption("#evR","9"); await p.click("#evSave"); await p.waitForTimeout(400); }
  c=await card(); let L1=await lsP();
  ok(c&&/VMA estimée : 14,5/.test(c.txt)&&c.ap,"U4 résultat enregistré : VMA estimée 14,5 km/h et bouton « Mettre à jour mon plan avec ce résultat »",c);
  ok(L1.profile.ref==="none"&&Object.values(L1.evr||{}).length===1&&!Object.values(L1.evr)[0].ap,"U4 rien n'est appliqué sans le bouton (référence du profil inchangée)",{ref:L1.profile.ref,evr:L1.evr});
  ok(await p.evaluate(()=>document.activeElement&&document.activeElement.matches("[data-evap]")),"U4 focus sur le bouton de mise à jour");
  { await p.click("#notifBtn"); await p.waitForTimeout(250); const t=await p.evaluate(()=>document.querySelector('.sheet[data-kind="notif"]').textContent);
    ok(/Résultat de test en attente/.test(t)&&/14,5/.test(t),"U5 panneau Notifications : résultat en attente (section « Ton plan »)",t.slice(0,300));
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    ok(await p.evaluate(nb=>document.querySelector("#notifBtn").outerHTML===nb,nb0),"U5 aucun badge : bouton Notifications identique"); }
  const kmW=()=>p.evaluate(()=>[...document.querySelectorAll("#days .chip.rest")].map(x=>x.textContent).join("|"));
  const pace0=await p.evaluate(()=>document.querySelector("#days .pace")?.textContent||"");
  await p.click(`#days [data-evap="${c.i}"]`); await p.waitForTimeout(400);
  L1=await lsP(); c=await card();
  const tst=await p.evaluate(()=>document.querySelector("#toasts").textContent);
  ok(L1.profile.ref==="vma"&&L1.profile.refVal==="14,5"&&Object.values(L1.evr)[0].ap>0,"U6 mise à jour : référence VMA 14,5 km/h dans le profil, résultat marqué appliqué",{p:[L1.profile.ref,L1.profile.refVal],evr:L1.evr});
  ok(/Plan mis à jour : VMA de 14,5/.test(tst)&&/volume de départ/.test(tst),"U6 toast avec explication",tst);
  ok(/Plan mis à jour avec ce résultat/.test(c.txt)&&!c.ap,"U6 carte : résultat appliqué, plus de bouton",c);
  ok(await p.evaluate(()=>/14,5 km\/h/.test(document.querySelector("#vmaHint").textContent)&&document.querySelector("#refVal").value==="14,5"),"U6 profil recalculé : VMA utilisée 14,5 km/h");
  const pace1=await p.evaluate(()=>document.querySelector("#days .pace")?.textContent||""); ok(pace0&&pace1&&pace0!==pace1,"U6 allures recalculées",[pace0,pace1]);
  await p.click("#toasts .toast button"); await p.waitForTimeout(400); L1=await lsP();
  ok(L1.profile.ref==="none"&&!Object.values(L1.evr)[0].ap,"U7 « Annuler » : profil et résultat comme avant",{ref:L1.profile.ref,evr:L1.evr});
  // synchro : deuxième onglet du même navigateur
  { const q=await page(null,{ctx:ctxA}); await q.waitForTimeout(300);
    await toW1(q); const has=()=>q.evaluate(()=>{ const e=document.querySelector("#days .evb"); return e? e.textContent : ""; });
    ok(/VMA estimée : 14,5/.test(await has()),"U8 deuxième onglet : le résultat est là",await has());
    await p.click(`#days [data-evap="${c.i}"]`); await p.waitForTimeout(700); await toW1(q);   // profil changé ailleurs : l'onglet revient à la semaine en cours (comportement existant)
    ok(/Plan mis à jour avec ce résultat/.test(await has())&&await q.evaluate(()=>document.querySelector("#refVal").value==="14,5"),"U8 mise à jour faite dans le premier onglet : visible dans le second",await has());
    // effacé dans le second onglet : effacé dans le premier (marque horodatée)
    const qi=await q.evaluate(()=>document.querySelector("#days [data-evr]").dataset.evr); await q.click(`#days [data-evr="${qi}"]`); await q.waitForTimeout(250); await q.click("#evDel"); await q.waitForTimeout(700); await toW1(p);
    ok(await p.evaluate(()=>/Noter mon résultat/.test(document.querySelector("#days .evb").textContent)),"U8 résultat effacé dans le second onglet : effacé dans le premier");
    const r=await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem("carnet-course.v1")).evr)); ok(r.length===1&&r[0].x===1&&r[0].at>0,"U8 effacement gardé comme marque horodatée (mergeStamped)",r);
    await q.close(); }
  { const o=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,vw:innerWidth,b:[...document.querySelectorAll("#days .evb button")].map(x=>{ const r=x.getBoundingClientRect(); return [r.height,r.right]; })}));
    ok(o.sw<=o.vw&&o.b.every(([h,r])=>h>=24&&r<=o.vw),"U9 375 px : aucun défilement horizontal, boutons de l'encadré dans l'écran",o); }
  // case du profil
  { const st=await p.evaluate(()=>{ const c=document.querySelector("#evalOn"); return {on:c&&c.checked,hint:document.querySelector("#evalHint").textContent}; });
    ok(st.on&&/Ce plan en prévoit [12]\./.test(st.hint),"U10 profil : case « Commencer par des séances de test » cochée, nombre de tests annoncé",st);
    await p.evaluate(()=>{ const c=document.querySelector("#evalOn"); c.checked=false; c.dispatchEvent(new Event("input",{bubbles:true})); c.dispatchEvent(new Event("change",{bubbles:true})); }); await p.waitForTimeout(400);
    L1=await lsP(); ok(L1.profile.evalOn==="0"&&await p.evaluate(()=>!document.querySelector("#days .evb")),"U10 case décochée : plus de séance de test",L1.profile.evalOn); }
  await ctxA.close();
  // débutant : minutes de course continue → point de départ, sur demande
  { const ctx=await b.newContext({viewport:{width:375,height:800},locale:"fr-FR"}); const d=await page(seedI({niveau:"deb",volume:8,longest:3,seances:"3"}),{ctx}); await toW1(d);
    const i=await d.evaluate(()=>document.querySelector("#days [data-evr]")?.dataset.evr); ok(i!=null,"U11 débutant : test course / marche sur la carte");
    await d.click(`#days [data-evr="${i}"]`); await d.waitForTimeout(250); await d.fill("#evV","12"); await d.click("#evSave"); await d.waitForTimeout(200);
    ok(await d.evaluate(()=>/effort perçu/.test(document.querySelector("#evMsg").textContent)),"U11 débutant : effort perçu obligatoire");
    await d.fill("#evV","99"); await d.selectOption("#evR","4"); await d.click("#evSave"); await d.waitForTimeout(200);
    ok(await d.evaluate(()=>/plausible/.test(document.querySelector("#evMsg").textContent)),"U11 débutant : minutes au-delà de la séance refusées");
    await d.fill("#evV","12"); await d.click("#evSave"); await d.waitForTimeout(300);
    ok(await d.evaluate(()=>/fractions de 6 min|fractions de 5 min/.test(document.querySelector("#days .evb").textContent)),"U11 débutant : point de départ proposé",await d.evaluate(()=>document.querySelector("#days .evb").textContent));
    await d.click(`#days [data-evap="${i}"]`); await d.waitForTimeout(300);
    const pr=await d.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")).profile); ok(pr.debRun==="12"&&pr.ref==="none","U11 débutant : debRun = 12 enregistré dans le profil, sans toucher à la VMA",pr);
    await ctx.close(); }
  ok(!E.length,"aucune erreur de page",E.slice(0,3));
  await b.close(); S.close();
  console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
