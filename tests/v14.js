// v14 : sports (trail, VTT, force, remise en forme), ressenti après séance, import Apple Santé / Polar Flow
// invariants des plans, nettoyage des données, parcours dans la page, synchronisation avec un compte (faux Supabase), aucun réseau
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path"); const FX=require("./fx14");
const INJ='"use strict"; window.__T={buildPlan,profileNums,sessionKm,vmaOf,energy,dayFuel,get state(){return state;},get P(){return P;},get plan(){return plan;},get E(){return E;},weekText:(...a)=>weekText(...a),timerSteps:(...a)=>timerSteps(...a),sessionDur:(...a)=>sessionDur(...a),dataOut:()=>dataOut(),importClean:(...a)=>importClean(...a),loadState:(...a)=>loadState(...a)};';
const TMP=path.join(require("os").tmpdir(),"carnet-v14-"+process.pid); fs.mkdirSync(TMP,{recursive:true});
const iso=d=>d.toISOString().slice(0,10), addD=(s,n)=>iso(new Date(Date.parse(s+"T12:00:00Z")+n*864e5));
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):"")); };
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"1",longDay:"6",start:iso(new Date(Date.now()-14*864e5)),deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:"",sport:"vtt",sObj:"moyen",hSem:"5"};
const PEND=JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()});
(async()=>{ const b=await chromium.launch(); const E=[], CSPV=[], NET=[];
 const S=await L.serve({"/app.js":()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace('"use strict";',INJ),"/config.js":L.cfgJs()});
 const mk=async({session,seed,pend,db,width=390,height=844}={})=>{ const ctx=await b.newContext({viewport:{width,height},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())) E.push(m.type()+" "+m.text().slice(0,200)); });
  p.on("request",r=>{ const u=r.url(); if(!u.startsWith(S.url)&&!u.startsWith("data:")&&!u.startsWith("blob:")) NET.push(u); });
  await L.fake(p,db||L.makeDb(),{session});
  await p.addInitScript(({seed,pend})=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI)); if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(seed){ localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","14"); } if(pend) localStorage.setItem("carnet.consent",pend); } },{seed,pend});
  await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 const csp=async p=>{ const v=await p.evaluate(()=>window.__csp||[]); if(v.length) CSPV.push(...v); };
 const seed=(extra={})=>JSON.stringify({profile:prof,isExample:false,log:[],week:1,seen:14,...extra});

 // V1 : invariants des plans de sport
 { const p=await mk({}); const r=await p.evaluate(()=>{ const T=window.__T, bad={}, note=(k,m)=>{ (bad[k]=bad[k]||[]).push(m); }; let n=0;
    const base={sexe:"H",age:32,taille:178,poids:75,cible:"",mg:"",activite:"1.4",niveau:"int",objectif:"forme",volume:0,longest:0,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"1",longDay:"6",start:"2026-10-05",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:""};
    const combos=[]; for(const sport of ["trail","vtt","force","forme"]) for(const sObj of (sport==="vtt"?["court","moyen","long"]:sport==="force"?["ppl","oly"]:[""])) for(const niveau of ["deb","int","conf"]) for(const seances of ["3","4","5","6"]) for(const who of [{},{age:16,minor:true},{age:70,poids:50},{sexe:"F",poids:45,taille:170},{poids:130,taille:165}]) for(const nWeeks of [0,6,16,30]) for(const hSem of ["",0,4,12]) combos.push({sport,sObj,niveau,seances,...who,nWeeks,hSem});
    let i=0; for(const c of combos.filter(()=>(i++)%13===0)){ const id=JSON.stringify(c), P=T.profileNums({...base,...c}); let w; try{ w=T.buildPlan(P); }catch(e){ note("throw",id+" "+e.message); continue; } n++;
      const E=T.energy(P,w); let prev=null, prevDp=null; if(!w.length) note("vide",id);
      for(const wk of w){ if(wk.days.length!==7) note("jours",id); const f=T.dayFuel(P,E,wk), js=JSON.stringify([wk,f]); if(/NaN|undefined|Infinity/.test(js)) note("nan",id+" w"+wk.w);
        const am=P.sexe==="F"?1200:1500; for(const d of f.days){ if(d.kcal<Math.max(E.bmr,Math.min(d.maint,am))-1) note("plancher",id+" w"+wk.w); }
        if((P.minor||E.bmi<18.5)&&f.days.some(d=>d.want>0)) note("déficit mineur/IMC",id);
        const vol=wk.days.reduce((a,d)=>a+(d.run?T.sessionDur(d.run):0),0), normal=!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race";
        if(P.sport!=="trail"){ if(normal&&prev!=null&&vol>prev*1.105+3) note("volume +10 %",id+" w"+wk.w); if(wk.deload&&prev!=null&&vol>prev*.99+1) note("semaine allégée plus lourde",id+" w"+wk.w); if(normal) prev=vol; }
        else if(normal){ if(!(wk.dplus>=0)) note("D+ absent",id); if(prevDp!=null&&wk.dplus>prevDp*1.1+60) note("D+ +10 %",id+" w"+wk.w); prevDp=wk.dplus; }
        for(const d of wk.days) if(d.run){ if(d.run.rpeAvg>(P.minor||P.age<18?8:9)) note("RPE",id); try{ const st=T.timerSteps(d.run,d.kind); if(!st||!st.length) note("minuteur vide",id); }catch(e){ note("minuteur",id+e.message); } }
        try{ T.weekText(wk.w); }catch(e){ note("weekText",id+" "+e.message); } } }
    return {n,bad:Object.fromEntries(Object.entries(bad).map(([k,v])=>[k,[v.length,v.slice(0,2)]]))}; });
   ok(r.n>400&&!Object.keys(r.bad).length,"V1 plans trail/VTT/force/forme : 7 jours, pas de NaN, planchers, mineurs, +10 %, semaine allégée, RPE, minuteur ("+r.n+" profils)",r.bad); await p.ctx.close(); }

 // V2 : nettoyage et aller-retour des nouvelles données
 { const p=await mk({}); const r=await p.evaluate(()=>{ const T=window.__T, out=[], ck=(n,c,x)=>out.push([n,!!c,x]);
    const pr={sexe:"H",age:32,taille:178,poids:80,start:"2026-10-05",niveau:"int",objectif:"forme",seances:"4",renfo:"1",longDay:"6",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",sport:"force",sObj:"oly",hSem:"5"};
    const day=i=>new Date(Date.UTC(2020,0,1)+i*864e5).toISOString().slice(0,10); const feel={}, acts={}, rhr={};
    for(let i=0;i<1200;i++) feel[day(i)]={rpe:9,mood:1,pain:2,zone:"epaule",note:"é".repeat(400),sig:"<b>"+"x".repeat(200),at:Date.now()};
    feel["2026-10-06"]={rpe:"abc",mood:99,pain:7,zone:"<script>",note:"<img src=x onerror=alert(1)>‮\u0000\n\ttab",at:5};
    for(let i=0;i<2000;i++) acts[day(i%1200)+"|course|"+(1+i%1400)+"|0700|"+(i%5000)]={date:day(i%1200),type:"run",min:30,km:1e9,kcal:-5,fc:"x",src:"<s>",at:1};
    acts["2026-10-01|__proto__|30|0700|50"]={at:1}; acts["constructor"]={at:1};
    for(let i=0;i<400;i++) rhr[new Date(Date.UTC(2020,0,6)+i*7*864e5).toISOString().slice(0,10)]={bpm:i%2?"60":999,at:1};
    const txt=JSON.stringify({app:"carnet-de-course",format:1,version:14,profile:pr,log:[],feel,acts,rhr}).replace('"feel":{','"feel":{"__proto__":{"polluted":1},"constructor":{"prototype":{"p2":1}},');
    const res=T.importClean(txt), D=res.data||{}; ck("sans erreur",!res.err,res.err); ck("prototype propre",({}).polluted===undefined&&({}).p2===undefined);
    ck("feel ≤ 500, notes ≤ 200, zones fermées",Object.keys(D.feel).length<=500&&Object.values(D.feel).every(v=>v.x||(v.note.length<=200&&(v.zone===""||/^[a-z]+$/.test(v.zone))&&!/[<>"]/.test(v.sig))));
    ck("acts ≤ 1500, bornés",Object.keys(D.acts).length<=1500&&Object.values(D.acts).every(v=>v.del||(v.km<=500&&v.kcal>=0&&v.src==="apple")));
    ck("rhr ≤ 260, bornes",Object.keys(D.rhr).length<=260&&Object.values(D.rhr).every(v=>v.x||(v.bpm>=25&&v.bpm<=120)));
    ck("pire cas < 1 Mo",JSON.stringify({feel:D.feel,acts:D.acts,rhr:D.rhr}).length<1024*1024);
    ck("fichier > 2 Mo refusé",!!T.importClean("{"+" ".repeat(2.1*1024*1024)+"}").err);
    T.loadState({profile:pr,isExample:false,log:[],week:1,feel:{"2026-10-06":{rpe:7,mood:3,pain:1,zone:"genou",note:"ok <b>",sig:"s",at:3}},acts:{"2026-10-06|vtt|90|0700|300":{date:"2026-10-06",type:"vtt",min:90,km:30,kcal:700,fc:140,src:"polar",at:3}},rhr:{"2026-10-05":{bpm:55,at:3}}});
    const o=JSON.parse(JSON.stringify(T.dataOut())), g=(T.importClean(JSON.stringify(o)).data)||{}, na=x=>JSON.stringify(x,(k,v)=>k==="at"?0:v);
    ck("export puis import identiques",na(g.feel)===na(o.feel)&&na(g.acts)===na(o.acts)&&na(g.rhr)===na(o.rhr)&&o.feel["2026-10-06"].note==="ok <b>");
    const old=T.importClean(JSON.stringify({app:"carnet-de-course",format:1,profile:{...pr,sport:undefined,sObj:undefined,hSem:undefined},log:[]})); ck("ancien export (sans les nouveaux champs) accepté, sport = course",!old.err&&(old.data.profile.sport==null||old.data.profile.sport==="course")&&Object.keys(old.data.feel).length===0,old.err||JSON.stringify(old.data.profile));
    const P1=T.profileNums({...pr,sport:"__proto__",sObj:"<x>",hSem:"1e999"}); ck("sport hostile → course",P1.sport==="course"&&P1.hSem>=0&&P1.hSem<=25);
    ck("VTT : orientation invalide → moyen",T.profileNums({...pr,sport:"vtt",sObj:"oly",hSem:-5}).sObj==="moyen"); ck("force : 3 à 5 séances",T.profileNums({...pr,sport:"force",seances:"6"}).seances<=5);
    return out; });
   for(const [n,c,x] of r) ok(c,"V2 "+n,x); await p.ctx.close(); }

 // V3 : sport dans le profil, ressenti, messages de sécurité (invité)
 { const p=await mk({seed:seed()}); const sp=await p.evaluate(()=>window.__T.state.profile.sport); ok(sp==="vtt","V3 profil VTT chargé");
   ok((await p.textContent("#weekSub")).includes("d'entraînement"),"V3 en-tête de semaine en durée (pas en km)",await p.textContent("#weekSub"));
   ok(await p.evaluate(()=>[...document.querySelectorAll("#days .day .pace")].some(e=>/Facile|Tempo|Dur|Très facile/.test(e.textContent))),"V3 séances VTT à l'effort (pas d'allure au km)");
   await p.click("#tab-profil"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>document.querySelector("#sport").value==="vtt"&&!document.querySelector("#sObj").closest("[hidden]")&&document.querySelector("#objectif").closest("[data-sp]").hidden),"V3 champs du profil adaptés au sport (orientation visible, objectif de course masqué)");
   await p.click("#tab-semaine"); await p.waitForTimeout(150);
   const nF=await p.locator("[data-feel]").count(); ok(nF>=1,"V3 bouton Ressenti sur les séances passées ou du jour ("+nF+")");
   await p.locator("[data-feel]").first().click(); await p.waitForTimeout(350);
   await p.click("#fSave"); ok((await p.textContent("#fMsg")).includes("Choisis l'effort"),"V3 ressenti : RPE obligatoire"); 
   await p.selectOption("#fRpe","9"); await p.check("input[name=fPain][value='2']",{force:true}); await p.click("#fSave"); ok((await p.textContent("#fMsg")).includes("où"),"V3 ressenti : zone obligatoire si douleur");
   await p.selectOption("#fZone",{index:2}); await p.fill("#fNote","<img src=x onerror=window.__x=1> mollet"); await p.click("#fSave"); await p.waitForTimeout(300);
   const sheet=await p.textContent(".sheet"); ok(/Ressenti enregistré/.test(sheet)&&/avis d'un médecin/.test(sheet)&&/n'est pas modifié/.test(sheet)&&/aucun diagnostic/.test(sheet),"V3 douleur forte : message explicite, pas de diagnostic, plan non modifié");
   const before=await p.evaluate(()=>JSON.stringify(window.__T.plan.map(w=>w.days.map(d=>d.run&&d.run.title)))); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!window.__x&&!document.querySelector("#days img, #feelCard img, #weekAlerts img")),"V3 note libre affichée en texte (aucun HTML exécuté)");
   ok(await p.evaluate(()=>[...document.querySelectorAll("#weekAlerts .alert")].some(a=>/Douleur forte/.test(a.textContent))),"V3 alerte de la semaine");
   ok(await p.evaluate(()=>[...document.querySelectorAll("#days .chip")].some(c=>/À alléger/.test(c.textContent))),"V3 prochaine séance dure proposée plus légère (puce, sans changer le plan)");
   const after=await p.evaluate(()=>JSON.stringify(window.__T.plan.map(w=>w.days.map(d=>d.run&&d.run.title)))); ok(before===after,"V3 le plan n'est pas modifié");
   // deux RPE 9 d'affilée sans douleur : conseil de repos
   await csp(p); await p.ctx.close(); }
 { const p=await mk({seed:seed()}); await p.click("#tab-suivi"); ok((await p.textContent("#feelCard")).includes("Après une séance"),"V3 Suivi : état vide du ressenti"); await p.ctx.close(); }

 // V4 : import Apple Santé / Polar Flow
 { const D=TMP, wr=(n,d)=>{ fs.writeFileSync(path.join(D,n),d); return path.join(D,n); };
   const t0=iso(new Date()); const w=(n)=>addD(t0,-n);
   const mkRec=(d,kg)=>` <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="x" unit="kg" value="${kg}" creationDate="${d} 07:30:00 +0200" startDate="${d} 07:30:00 +0200" endDate="${d} 07:30:00 +0200"/>`;
   const mkWo=(d,t,mn)=>` <Workout workoutActivityType="HKWorkoutActivityType${t}" duration="${mn}" durationUnit="min" totalDistance="20" totalDistanceUnit="km" totalEnergyBurned="500" totalEnergyBurnedUnit="kcal" creationDate="${d} 08:00:00 +0200" startDate="${d} 08:00:00 +0200" endDate="${d} 09:00:00 +0200"/>`;
   const recent=wr("recent.xml",`<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="fr_FR">\n${mkRec(w(3),"79.0")}\n${mkRec(w(5),"79.4")}\n${mkRec(w(200),"90.0")}\n${mkWo(w(2),"Cycling",75)}\n${mkWo(w(4),"Running",40)}\n</HealthData>`);
   const files={apple:wr("export.zip",FX.appleZip()),polar:wr("polar.zip",FX.polarZip()),bomb:wr("bomb.zip",FX.bombZip(300)),junk:wr("junk.xml","<html><body>x</body></html>"),dtd:wr("dtd.xml",FX.appleXml()),big:wr("big.xml",Buffer.concat(FX.bigAppleXml(60).map(x=>Buffer.from(x)))),empty:wr("empty.json","")};
   const p=await mk({seed:seed()}); await p.click("#tab-suivi"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>!!document.querySelector("#impOpen")&&/Ces\s+données ne changent jamais tes calories/.test(document.querySelector("#impCard").textContent.replace(/\s+/g," "))||/ne changent jamais tes calories/.test(document.querySelector("#impCard").textContent)),"V4 carte d'import : promesse « ne change jamais tes calories »");
   const kcal0=await p.evaluate(()=>JSON.stringify(window.__T.plan.map(w=>window.__T.dayFuel(window.__T.P,window.__T.E,w).days.map(d=>d.kcal))));
   const pick=async f=>{ const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.click("#stPick")]); await fc.setFiles(f); };
   await p.click("#impOpen"); await p.waitForTimeout(300);
   ok(/Apple Santé/.test(await p.textContent(".sheet"))&&/Polar Flow/.test(await p.textContent(".sheet"))&&/n'est envoyé nulle part/.test(await p.textContent(".sheet")),"V4 explication de l'export et mention de confidentialité");
   for(const [k,exp] of [["junk",/pas reconnu/],["bomb",/anormale/],["empty",/vide/]]){ await pick(files[k]); await p.waitForSelector("#stMsg .alert",{timeout:20000}); ok(exp.test(await p.textContent("#stMsg")),"V4 message clair : "+k,await p.textContent("#stMsg")); }
   await pick(files.apple); await p.waitForSelector("#stA",{timeout:20000}); const pv=await p.textContent(".sheet");
   ok(/Fichier lu/.test(pv)&&/Rien n'est encore importé/.test(pv)&&/nouvelles activités/.test(pv),"V4 aperçu avant import");
   ok(await p.evaluate(()=>window.__T.state.acts&&Object.keys(window.__T.state.acts).length===0),"V4 rien n'est enregistré avant le choix");
   await p.click("[data-close]"); await p.waitForTimeout(300); ok(await p.evaluate(()=>Object.keys(window.__T.state.acts).length===0),"V4 « Annuler » n'importe rien");
   await p.click("#impOpen"); await pick(files.apple); await p.waitForSelector("#stA"); await p.click("#stPick"); await p.waitForTimeout(500);
   const na=await p.evaluate(()=>Object.keys(window.__T.state.acts).length); ok(na===8,"V4 8 activités importées (doublons et valeurs invalides écartés)",na);
   ok(await p.evaluate(()=>document.querySelectorAll("#impCard .actl li").length>=8&&!document.querySelector("#impCard img")),"V4 liste « Activités importées » (texte seulement)");
   await p.click("#impOpen"); await pick(files.apple); await p.waitForSelector(".sheet .sh-b .alert.warn",{timeout:20000}); ok(/rien de nouveau/.test(await p.textContent(".sheet .sh-b")),"V4 second import identique : rien de nouveau (dédoublonnage)"); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
   await p.click("#impOpen"); await pick(files.polar); await p.waitForSelector("#stA",{timeout:20000}); ok(/Polar/.test(await p.textContent(".sheet")),"V4 Polar Flow (zip de JSON, CSV, TCX) lu"); await p.click("#stPick"); await p.waitForTimeout(400);
   await p.click("#impOpen"); await pick(recent); await p.waitForSelector("#stW",{timeout:20000}); const pv2=await p.textContent(".sheet"); ok(/2 pesées hebdomadaires|1 pesée hebdomadaire/.test(pv2)&&/plus de 12 semaines/.test(pv2),"V4 pesées récentes proposées, pesée ancienne écartée"); await p.click("#stPick"); await p.waitForTimeout(400);
   ok(await p.evaluate(()=>window.__T.state.log.length>=1&&window.__T.state.log.every(x=>x.poids>=35&&x.poids<=250)),"V4 pesées ajoutées au suivi");
   const kcal1=await p.evaluate(()=>JSON.stringify(window.__T.plan.map(w=>window.__T.dayFuel(window.__T.P,window.__T.E,w).days.map(d=>d.kcal))));
   ok(kcal0===kcal1,"V4 les activités importées ne changent aucune calorie du plan");
   ok(/prévu et réalisé/.test(await p.textContent("#impCard")),"V4 comparaison prévu et réalisé de la semaine");
   await p.click("#impClear"); await p.waitForTimeout(300); await p.click("#scGo"); await p.waitForTimeout(400); ok(await p.evaluate(()=>Object.keys(window.__T.state.acts).filter(k=>!window.__T.state.acts[k].del).length===0),"V4 « Tout retirer » : activités retirées (marques d'effacement)");
   { const t=Date.now(); await p.click("#impOpen"); await pick(files.big); await p.waitForSelector("#stA, .sheet .alert",{timeout:60000}); ok(Date.now()-t<30000,"V4 gros fichier (60 Mo) lu en moins de 30 s : "+(Date.now()-t)+" ms"); await p.keyboard.press("Escape"); await p.waitForTimeout(200); }
   { const huge=wr("huge.xml",Buffer.concat(FX.bigAppleXml(300).map(x=>Buffer.from(x))));
     // gel de l'interface : mesuré pendant une première lecture complète (la lecture est rapide : elle peut finir avant 600 ms)
     await p.click("#impOpen"); await pick(huge); await p.waitForTimeout(50);
     const lag=await p.evaluate(()=>new Promise(r=>{ let m=0, l=performance.now(); const iv=setInterval(()=>{ const n=performance.now(); m=Math.max(m,n-l); l=n; },20); setTimeout(()=>{ clearInterval(iv); r(m); },600); }));
     ok(lag<400,"V4 pendant la lecture d'un fichier de 300 Mo, l'interface ne gèle pas (pire retard "+Math.round(lag)+" ms)",lag);
     await p.waitForSelector("#stA, .sheet .alert",{timeout:60000}).catch(()=>{}); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
     // annulation : dès que le bouton devient « Annuler la lecture », avant la fin de la lecture
     const n0=await p.evaluate(()=>Object.keys(window.__T.state.acts).length);
     await p.click("#impOpen"); await pick(huge); await p.waitForFunction(()=>/Annuler la lecture/.test((document.querySelector("#stPick")||{}).textContent||""),null,{timeout:5000}); const t=Date.now(); await p.click("#stPick");
     await p.waitForSelector("#stMsg .alert",{timeout:5000}).catch(()=>{}); const txt=await p.textContent(".sheet .sh-b").catch(()=>"(feuille fermée)");
     ok(/annulée/.test(txt)&&Date.now()-t<4000&&await p.evaluate(n0=>Object.keys(window.__T.state.acts).length===n0,n0),"V4 « Annuler la lecture » répond tout de suite, rien n'est importé",txt); await p.keyboard.press("Escape"); await p.waitForTimeout(200); fs.rmSync(huge,{force:true}); }
   ok(NET.length===0,"V4 aucune requête hors du site pendant les imports",NET.slice(0,3)); await csp(p); await p.ctx.close(); }

 // V5 : compte (faux Supabase) : synchronisation, fusion entre appareils, effacement
 { const db=L.makeDb(); const feel={}; const day=iso(new Date(Date.now()-86400e3)); feel[day]={rpe:7,mood:3,pain:0,zone:"",note:"bien",sig:"x",at:Date.now()};
   const acts={}; acts[day+"|vtt|90|0700|300"]={date:day,type:"vtt",min:90,km:30,kcal:700,fc:140,src:"apple",at:Date.now()};
   const A=await mk({session:L.SESSION(),seed:seed({feel,acts,rhr:{}}),pend:PEND,db}); await A.waitForTimeout(1500);
   const doc=db.rows.get("u-1")&&db.rows.get("u-1").doc; ok(doc&&doc.feel&&doc.feel[day]&&doc.acts&&doc.acts[day+"|vtt|90|0700|300"],"V5 ressenti et activités synchronisés dans le compte",doc&&Object.keys(doc));
   ok(JSON.stringify(doc).length<1500000,"V5 document sous la limite de 1,5 Mo"); ok(!JSON.stringify(db.rows.get("u-1")).includes("Zoé"),"V5 ni nom ni e-mail");
   const B=await mk({session:L.SESSION(),pend:PEND,db}); await B.waitForTimeout(1500); await B.evaluate(()=>{ const o=document.querySelector("#homeCta [data-act=open]"); if(o&&!document.querySelector("#home").hidden) o.click(); }); await B.waitForTimeout(400);
   ok(await B.evaluate(d=>window.__T.state.feel[d]&&window.__T.state.acts[d+"|vtt|90|0700|300"]&&window.__T.state.profile.sport==="vtt",day),"V5 autre appareil : ressenti, activités et sport retrouvés");
   await B.click("#tab-suivi"); await B.waitForTimeout(200); await B.click("#impCard .actl .del"); await B.waitForTimeout(900);
   ok(Object.values(db.rows.get("u-1").doc.acts).some(v=>v.del===1),"V5 retrait d'une activité : marque d'effacement dans le compte");
   await A.reload(); await A.waitForTimeout(1500); ok(await A.evaluate(d=>window.__T.state.acts[d+"|vtt|90|0700|300"]&&window.__T.state.acts[d+"|vtt|90|0700|300"].del===1,day),"V5 la marque d'effacement se propage (rien ne ressuscite)");
   await A.click(".js-av >> visible=true"); await A.waitForTimeout(300); await A.click("[data-acc=erase]"); await A.click("#erNext"); await A.click("#erGo"); await A.waitForTimeout(1000);
   const d2=db.rows.get("u-1").doc; ok(d2.erased===true&&!d2.feel&&!d2.acts&&!d2.rhr,"V5 « Effacer mes données » : ressenti, activités et FC de repos effacés du compte",Object.keys(d2));
   ok(await A.evaluate(()=>{ const s=window.__T.state; return !Object.keys(s.feel||{}).length&&!Object.keys(s.acts||{}).length; }),"V5 effacement local");
   await csp(A); await A.ctx.close(); await B.ctx.close(); }

 // V6 : l'assistant propose le sport ; le profil créé donne le bon plan
 for(const c of [{sport:"trail",objectif:"21",race:addD(iso(new Date()),110)},{sport:"vtt",sObj:"long",hSem:"6",race:addD(iso(new Date()),133)},{sport:"force",sObj:"oly",niveau:"conf"},{sport:"forme",hSem:"3"},{sport:"vtt",hSem:"40",expectErr:true}]){
  const p=await mk({}); await p.evaluate(()=>document.querySelector('[data-act="wizard"]').click()); await p.waitForTimeout(300);
  const r=await p.evaluate(async c=>{ const set=(id,x)=>{const e=document.getElementById(id); if(!e) return; e.value=x; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true}));};
    const rad=(n,x)=>{ const r=[...document.querySelectorAll(`#wiz input[name="${n}"]`)].find(r=>r.value===String(x)&&!r.disabled); if(r){ r.checked=true; r.dispatchEvent(new Event("change",{bubbles:true})); } };
    const next=()=>document.getElementById("wzNext").click(), err=()=>{const e=document.getElementById("wzErr"); return e.hidden?"":e.textContent;};
    rad("wz_sexe","H"); set("wzAge",32); set("wzTaille",178); set("wzPoids","82"); set("wzCible","76"); next(); let e=err(); if(e) return {err:e,step:1};
    rad("wz_niveau",c.niveau||"int"); set("wzSport",c.sport); if(c.sObj) set("wzSObj",c.sObj); if(c.objectif) set("wzObjectif",c.objectif); if(c.race!==undefined) set("wzRace",c.race); set("wzVolume","20"); set("wzLongest","10"); if(c.hSem!==undefined) set("wzHSem",c.hSem); next(); e=err(); if(e) return {err:e,step:2};
    rad("wz_seances","4"); rad("wz_renfo","1"); rad("wz_lieu","dehors"); rad("wz_equip","salle"); rad("wz_longDay","6"); rad("wz_act","1.25"); next(); e=err(); if(e) return {err:e,step:3};
    rad("wz_def","300"); document.getElementById("wzAck").checked=true; next(); e=err(); if(e) return {err:e,step:4}; const sum=document.querySelector("#wiz").innerText; next(); e=err(); if(e) return {err:e,step:5};
    const T=window.__T; return {ok:true,profile:JSON.parse(JSON.stringify(T.state.profile)),len:T.plan.length,sum}; },c);
  if(c.expectErr) ok(!r.ok&&/0 à 25/.test(r.err||""),"V6 assistant : heures de sport hors limites refusées ("+c.sport+")",r);
  else ok(r.ok&&r.profile.sport===c.sport&&(!c.sObj||r.profile.sObj===c.sObj)&&r.len>=4,"V6 assistant : "+c.sport+" -> profil et plan de "+(r.len||"?")+" semaines",r.err||r.profile);
  await p.ctx.close(); }
 // V7 : VTT / remise en forme, heures par semaine : la semaine 2 part de la charge réellement placée en semaine 1 (+10 % au plus), « placées » exact, semaine 1 <= 1,5 x les heures (grille complète, 7 jours de début)
 { const p=await mk({}); const r=await p.evaluate(()=>{ const T=window.__T, bad=[]; let n=0;
    const base={sexe:"H",age:35,taille:178,poids:75,cible:"",mg:"",activite:"1.4",objectif:"forme",volume:0,longest:0,ref:"none",refVal:"",fcmax:"",renfo:"1",longDay:"6",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:"",sObj:"moyen"};
    const dur=wk=>wk.days.filter(d=>d.run&&d.kind!=="before").reduce((a,d)=>a+T.sessionDur(d.run),0), cnt=wk=>wk.days.filter(d=>d.run&&d.kind!=="before").length;
    for(const sport of ["vtt","forme"]) for(const niveau of ["deb","int","conf"]) for(const seances of ["3","4","5","6"]) for(const h of [1,1.5,2,2.5,3,4,5,""]) for(let d=0;d<7;d++){
      const start="2026-10-"+String(12+d).padStart(2,"0"), P=T.profileNums({...base,sport,niveau,seances,hSem:h,start}), w=T.buildPlan(P), w1=w[0], w2=w[1]; n++;
      const tag=[sport,niveau,seances,h,start].join(" "), v1=dur(w1), v2=dur(w2);
      if(h&&v1>1.5*h*60+1) bad.push(tag+" S1 "+v1+" > 1,5 h");
      if(w1.dropped&&w1.dropped.placed!==cnt(w1)) bad.push(tag+" placées "+w1.dropped.placed+" au lieu de "+cnt(w1));
      if(d===0&&!w2.deload&&w2.phase!=="taper"&&w2.phase!=="race"&&v2>v1*1.1+3&&v2>50) bad.push(tag+" S1 "+v1+" S2 "+v2); }
    const ex=T.buildPlan(T.profileNums({...base,sport:"forme",niveau:"int",seances:"6",hSem:1.5,age:19,taille:139,poids:38,start:"2026-10-12"})); return {n,bad:bad.slice(0,5),nb:bad.length,ex:[dur(ex[0]),dur(ex[1]),cnt(ex[0]),ex[0].dropped]}; });
   ok(r.nb===0,"V7 "+r.n+" cas (sport x niveau x séances x heures x jour de début) : semaine 1 <= 1,5 x heures, « placées » exact, semaine 2 <= +10 %",r.bad);
   ok(r.ex[1]<=r.ex[0]*1.1+3&&r.ex[3]&&r.ex[3].placed===r.ex[2],"V7 cas du testeur (forme 19 ans, 6 séances, 1,5 h, lundi) : S1 "+Math.round(r.ex[0])+" min, S2 "+Math.round(r.ex[1])+" min, "+r.ex[2]+" séances placées sur 6",r.ex);
   await p.ctx.close(); }
 // V8 : jour de l'objectif et veille à l'équilibre pour VTT, force et remise en forme ; minuteur = durée affichée (force) ; rappel discret de la semaine 1 de force
 { const p=await mk({}); const r=await p.evaluate(()=>{ const T=window.__T, out={eve:[],tim:0,n:0};
    const base={sexe:"H",age:35,taille:178,poids:75,cible:"",mg:"",activite:"1.4",niveau:"int",objectif:"forme",volume:0,longest:0,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"1",longDay:"6",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",sObj:"moyen",start:"2026-10-12",raceDate:"2026-11-28"};
    for(const sport of ["vtt","force","forme"]){ const P=T.profileNums({...base,sport,sObj:sport==="force"?"ppl":"moyen"}), w=T.buildPlan(P), E=T.energy(P,w), wk=w.find(x=>x.phase==="race"), f=T.dayFuel(P,E,wk), ri=wk.days.findIndex(d=>d.obj); out.eve.push([sport,ri,Math.round(f.days[ri].def),Math.round(f.days[(ri+6)%7].def)]); }
    for(const niveau of ["deb","int","conf"]) for(const seances of ["3","4","5"]) { const P=T.profileNums({...base,sport:"force",sObj:"ppl",niveau,seances,raceDate:""}); for(const wk of T.buildPlan(P).slice(0,8)) for(const d of wk.days) if(d.run&&d.kind!=="before"){ out.n++; const sec=T.timerSteps(d.run,d.kind).reduce((a,x)=>a+x.sec,0)/60; if(Math.abs(sec-T.sessionDur(d.run))>0.51) out.tim++; } }
    return out; });
   ok(r.eve.every(e=>e[1]>=0&&Math.abs(e[2])<=10&&Math.abs(e[3])<=10),"V8 jour de l'objectif et veille à l'équilibre (VTT, force, remise en forme)",r.eve);
   ok(r.tim===0&&r.n>100,"V8 force : durée affichée = somme des blocs du minuteur (à l'arrondi à la minute près) sur "+r.n+" séances",r.tim);
   await p.ctx.close(); }
 ok(E.length===0,"console propre (aucune erreur ni avertissement)",E.slice(0,4)); ok(CSPV.length===0,"aucune violation de la CSP",CSPV.slice(0,4)); ok(NET.length===0,"aucune requête hors du site",NET.slice(0,3));
 await b.close(); S.close(); try{ fs.rmSync(TMP,{recursive:true,force:true}); }catch(e){} console.log(fails?"ÉCHECS : "+fails:"TOUT OK"); process.exit(fails?1:0); })();
