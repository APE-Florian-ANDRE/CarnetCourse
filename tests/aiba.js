// Avant / après des séances modifiées par l'IA : cas limites du moteur (aiFrom / aiLight), échappement, interface (cartes, profil, clavier, mobile, synchro)
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"5",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",raceDate:""};
const seed=(o={})=>JSON.stringify({profile:{...prof,...o.profile},isExample:false,log:[],week:o.week||4,seen:15});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,400):"")); };
const SHOTS=process.env.AIBA_SHOTS||"";
// app.js de test : fonctions internes exposées
const appT=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,planSig,qOpts,sessionKm,vmaOf,cleanAip,aibaHtml,aiSnap,recompute,persist,get state(){return state;},get plan(){return plan;}};\n})();\n");
// ajustement simulé : chaque séance d'intensité reçoit son 2e remplaçant permis ; allègement selon fa(w)
const INJ=(fa)=>`(()=>{ const T=window.__T, n=T.profileNums(T.state.profile), p0=T.buildPlan({...n,noAi:true}), wk={};
  for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"",c:"Conseil "+w.w,q:qs.map(d=>T.qOpts(d.run.kind,n,w.qPool)[1]||""),a:(${fa})(w.w)?1:0}; }
  T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:n.cplx||"standard",resume:"",wk}}); T.persist(); T.recompute(); return true; })()`;
(async()=>{
 const b=await chromium.launch(); const E=[];
 const S=await L.serve({"/config.js":L.cfgJs({PLAN_AI_URL:"https://plan.example.test/api/plan"}),"/app.js":appT});
 const mk=async({session=L.SESSION(),sd=seed(),width=1280,db=L.makeDb(),ctx=null,clock=null}={})=>{ const c=ctx||await b.newContext({viewport:{width,height:900},locale:"fr-FR"}); const p=await c.newPage(); if(clock) await p.clock.install({time:new Date(clock)});   // avant les scripts d'amorçage (dates de consentement cohérentes)
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource|net::ERR|CORS|status of (4|5)\d\d/.test(m.text())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,db,{session}); await p.addInitScript(({sd,pend})=>{ if(!sessionStorage.__seed&&!localStorage.getItem("__seeded")){ sessionStorage.__seed=1; localStorage.setItem("__seeded","1"); localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); if(pend) localStorage.setItem("carnet.consent",pend); } },{sd,pend:session?JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()}):null});
  await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=c; return p; };

 /* ---- moteur ---- */
 { const p=await mk();
   const R=await p.evaluate(()=>{ const T=window.__T, out={};
     const P=o=>T.profileNums({...T.state.profile,...o});
     // pour chaque plan : séance par séance, comparaison avec le plan sans IA
     const check=(o,fa)=>{ const n=P(o), p0=T.buildPlan({...n,noAi:true}), v=T.vmaOf(n).vma, wk={};
       for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"",c:"c",q:qs.map(d=>T.qOpts(d.run.kind,n,w.qPool)[1]||""),a:fa(w,qs.length)?1:0}; }
       const sv=T.state.aip; T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:n.cplx||"standard",resume:"",wk}}); const p1=T.buildPlan(n); T.state.aip=sv;
       const r={N:p1.ai?p1.ai.n:0,mods:0,bad:[],lightNoFrom:0,noQweekMods:0,unchanged:0,doubleMod:0,lights:0,lightGap:[]};
       p1.forEach((w,k)=>{ const qn=p0[k].days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind).length;
         w.days.forEach((d,i)=>{ if(!d.run) return; const o0=p0[k].days[i];
           if(d.run.aiLight&&!d.run.aiFrom) r.lightNoFrom++;
           if(!d.run.aiFrom){ if(o0.run&&o0.run.title!==d.run.title&&!(w.phase==="taper"||w.phase==="race")&&d.run.ai) r.unchanged++; return; }
           r.mods++; if(!qn) r.noQweekMods++;
           const f=d.run.aiFrom;
           if(!o0.run||o0.run.title!==f.t||Math.abs(T.sessionKm(o0.run,v)-f.km)>1e-9) r.bad.push({w:w.w,i,avant:f.t,plan:o0.run&&o0.run.title,kmA:f.km,kmP:o0.run&&T.sessionKm(o0.run,v)});
           if(d.run.aiLight){ r.lights++; const ka=T.sessionKm(d.run,v); if(ka<f.km-.5) r.lightGap.push({w:w.w,i,avant:f.t,kmAvant:+f.km.toFixed(1),kmApres:+ka.toFixed(1)}); }
           if(o0.run&&o0.run.title===d.run.title&&!d.run.aiLight) r.doubleMod++; }); });
       return r; };
     const all=()=>true;
     out.int=check({},all);                                                   // changée puis allégée (toutes les semaines allégées)
     out.simple=check({cplx:"simple"},w=>w.w%2===0);
     out.avance=check({cplx:"avance"},w=>w.w%2===0);
     out.conf42=check({niveau:"conf",objectif:"42",raceDate:"2027-04-11",volume:45,longest:20},all);
     out.fallback=check({objectif:"42",volume:0,longest:6,seances:"4",raceDate:"2026-12-20",start:"2026-10-26"},all);
     out.fallbackUnreal=(()=>{ const pl=T.buildPlan(P({objectif:"42",volume:0,longest:6,seances:"4",raceDate:"2026-12-20",start:"2026-10-26"})); return !!pl.unreal; })();
     out.deb=check({niveau:"deb",objectif:"forme",seances:"3",volume:8,longest:4},all);
     out.trail=check({sport:"trail",objectif:"21",raceDate:"2027-03-14",volume:30,longest:14},all);
     // préférences puis IA : l'« avant » est la séance affichée avant l'IA (préférences comprises) ; les footings des préférences n'ont pas d'avant / après
     out.pref=(()=>{ const o={pref:"je n'aime pas les côtes, plutôt du fartlek"}, r=check(o,w=>w.w%2===0), pl=T.buildPlan({...P(o),noAi:true});
       return {...r,prefN:pl.flatMap(w=>w.days).filter(d=>d.run&&d.run.pref).length,prefFrom:pl.flatMap(w=>w.days).filter(d=>d.run&&d.run.pref&&d.run.aiFrom).length}; })();
     out.noQ=(()=>{ const n=P({}), p0=T.buildPlan({...n,noAi:true}); return p0.filter(w=>!w.days.some(d=>d.run&&d.run.type==="q"&&d.run.kind)).map(w=>w.w); })();
     // changée puis allégée : l'avant de la séance allégée est la séance d'origine, pas la séance choisie par l'IA
     out.chain=(()=>{ const n=P({}), p0=T.buildPlan({...n,noAi:true}), wk={}; let tw=0;
       for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); if(!tw&&new Date(T.state.profile.start+"T00:00:00").getTime()+(w.w-1)*7*864e5>Date.now()&&qs.length>=1&&w.phase!=="taper"&&w.phase!=="race"&&T.qOpts(qs[qs.length-1].run.kind,n,w.qPool).length>1) tw=w.w;
         wk[w.w]={f:"",c:"",q:qs.map(d=>T.qOpts(d.run.kind,n,w.qPool)[1]||""),a:w.w===tw?1:0}; }
       T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk}}); const p1=T.buildPlan(n); T.state.aip={};
       const w0=p0[tw-1], w1=p1[tw-1], qs=w0.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind), last=qs[qs.length-1], i=w0.days.indexOf(last), d1=w1.days[i];
       // la même séance sans allègement : est-elle changée par l'IA ?
       const wk2=JSON.parse(JSON.stringify(wk)); wk2[tw].a=0; T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk:wk2}}); const p2=T.buildPlan(n); T.state.aip={};
       const changedFirst=!!(p2[tw-1].days[i].run&&p2[tw-1].days[i].run.aiFrom);
       return {tw,changedFirst,light:!!d1.run.aiLight,from:d1.run.aiFrom&&d1.run.aiFrom.t,orig:last.run.title,n:p1.ai.n,count:p1.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length}; })();
     out.sig=(()=>{ const n=P({}), p0=T.buildPlan({...n,noAi:true}), wk={}; for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"",c:"",q:qs.map(d=>T.qOpts(d.run.kind,n,w.qPool)[1]||""),a:1}; }
       T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk}}); const other=T.buildPlan(P({seances:"4"})), off=T.buildPlan({...n,noAi:true}); T.state.aip={};
       const none=pl=>!pl.some(w=>w.days.some(d=>d.run&&(d.run.aiFrom||d.run.aiLight))); return none(other)&&none(off); })();
     // échappement : titres, résumé et contenu hostiles
     out.esc=(()=>{ const bad='<img src=x onerror="window.__pwn=1">', run={title:bad,blocks:[{l:bad,min:10,z:"z1"}],aiFrom:{t:bad+'"><script>window.__pwn=1</script>',s:bad,km:3,min:20}};
       const h=T.aibaHtml(3,{i:2,run}), el=document.createElement("div"); el.innerHTML=h;
       return {img:!!el.querySelector("img,script"),txt:el.textContent.includes("<img src=x"),btn:!!el.querySelector("button[data-aiba]")}; })();
     return out; });
   const inv=(r,lab)=>{ ok(r.N===r.mods,lab+" : nombre de séances modifiées = repères avant / après",r); ok(!r.bad.length,lab+" : « Avant » = la séance du plan sans IA (titre, distance)",r.bad.slice(0,3));
     ok(!r.lightNoFrom&&!r.noQweekMods&&!r.doubleMod,lab+" : aucun allègement sans avant, rien dans une semaine sans intensité, aucune séance identique signalée",r); };
   inv(R.int,"A1 changée puis allégée (toutes semaines)");
   ok(!R.int.lightGap.length,"A12 semaine allégée : le footing garde la distance de la séance « Avant » (la note dit « même distance »)",R.int.lightGap.slice(0,4)); inv(R.simple,"A2 complexité simple"); inv(R.avance,"A3 complexité avancée");
   inv(R.conf42,"A4 confirmé marathon");
   ok(R.fallbackUnreal,"A5 objectif irréaliste : repli confirmé"); inv(R.fallback,"A5 objectif irréaliste (repli)");
   ok(R.deb.mods===0&&R.deb.N===0,"A6 débutant : aucune séance modifiée ni allégée, aucun avant / après",R.deb);
   inv(R.trail,"A7 trail");
   inv(R.pref,"A13 préférences puis IA (« avant » = séance après préférences)"); ok(R.pref.prefN>0&&!R.pref.prefFrom&&R.pref.mods>0,"A14 séances changées par les préférences sans repère IA ; l'IA modifie ensuite le plan",R.pref);
   ok(true,"A8 semaines sans intensité dans le plan de test : "+JSON.stringify(R.noQ));
   ok(R.chain.light&&R.chain.from===R.chain.orig&&R.chain.count===R.chain.n,"A9 séance changée puis allégée : un seul repère, l'avant est la séance d'origine",R.chain);
   ok(R.sig,"A10 profil modifié ou IA coupée : aucun avant / après");
   ok(!R.esc.img&&R.esc.txt&&R.esc.btn,"A11 titres et contenu hostiles échappés dans l'avant / après",R.esc);
   await p.ctx.close(); }

 /* ---- interface : cartes de la semaine ---- */
 { const db=L.makeDb(); const p=await mk({db});
   await p.evaluate(INJ("w=>w%2===0")); await p.click("#tab-semaine"); await p.waitForTimeout(200);
   // semaine affichée : la première qui contient au moins une séance modifiée
   const wMod=await p.evaluate(()=>{ const pl=window.__T.plan; const w=pl.find(w=>w.w>=4&&w.days.some(d=>d.run&&d.run.aiFrom&&!d.run.aiLight)); return w&&w.w; });
   const goW=async w=>{ await p.selectOption("#weekSel",String(w)); await p.waitForTimeout(200); };
   await goW(wMod);
   const ids=await p.evaluate(()=>[...document.querySelectorAll("#days [data-aiba]")].map(b=>{ const id=b.getAttribute("aria-controls"); return {id,n:document.querySelectorAll("#"+CSS.escape(id)).length,exp:b.getAttribute("aria-expanded"),day:b.closest("article").dataset.day,chip:!!b.closest("article").querySelector(".chip.ai")}; }));
   ok(ids.length>0&&ids.every(x=>x.n===1&&x.exp==="false"&&x.chip),"B1 aria-controls pointe vers un id unique, replié au départ, repère sur la carte",ids);
   const chipN=await p.evaluate(()=>document.querySelectorAll("#days .chip.ai").length);
   ok(chipN===ids.length,"B2 un repère par avant / après",{chipN,n:ids.length});
   // clavier : Tab jusqu'au bouton, Entrée ouvre, Espace ferme
   await p.focus("#days [data-aiba]"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
   const k1=await p.evaluate(()=>{ const b=document.querySelector("#days [data-aiba]"); return {exp:b.getAttribute("aria-expanded"),vis:!document.getElementById(b.getAttribute("aria-controls")).hidden,foc:document.activeElement===b}; });
   await p.keyboard.press("Space"); await p.waitForTimeout(100);
   const k2=await p.evaluate(()=>{ const b=document.querySelector("#days [data-aiba]"); return {exp:b.getAttribute("aria-expanded"),hid:document.getElementById(b.getAttribute("aria-controls")).hidden}; });
   ok(k1.exp==="true"&&k1.vis&&k1.foc&&k2.exp==="false"&&k2.hid,"B3 clavier : Entrée ouvre, Espace referme, le focus reste sur le bouton",{k1,k2});
   // le bouton est atteignable par Tab depuis le bouton précédent
   const tabR=await p.evaluate(()=>{ const all=[...document.querySelectorAll("#days button, #days a[href], #days summary")].filter(x=>x.offsetParent!==null&&x.tabIndex>=0); const b=document.querySelector("#days [data-aiba]"); return all.indexOf(b); });
   if(tabR>0){ await p.evaluate(i=>{ const all=[...document.querySelectorAll("#days button, #days a[href], #days summary")].filter(x=>x.offsetParent!==null&&x.tabIndex>=0); all[i-1].focus(); },tabR); await p.keyboard.press("Tab"); }
   ok(tabR>=0&&await p.evaluate(()=>document.activeElement===document.querySelector("#days [data-aiba]")),"B4 Tab atteint le bouton « Voir avant / après »",tabR);
   // l'état ouvert ne fuit pas vers une autre semaine
   await p.click("#days [data-aiba]"); const day0=ids[0].day;
   const other=await p.evaluate(d=>{ const pl=window.__T.plan; const w=pl.find(w=>w.w>=4&&w.w!==+document.querySelector("#weekSel").value&&w.days[d].run&&w.days[d].run.aiFrom); return w&&w.w; },+day0);
   if(other){ await goW(other); ok(await p.evaluate(d=>{ const b=document.querySelector(`#days [data-aiba="${d}"]`); return !!b&&b.getAttribute("aria-expanded")==="false"&&document.getElementById(b.getAttribute("aria-controls")).hidden; },day0),"B5 changement de semaine : la même journée d'une autre semaine reste repliée"); }
   else ok(true,"B5 (pas d'autre semaine avec une séance modifiée le même jour)");
   await goW(wMod);
   ok(await p.evaluate(d=>document.querySelector(`#days [data-aiba="${d}"]`).getAttribute("aria-expanded")==="true",day0),"B6 retour sur la semaine : l'avant / après ouvert le reste");
   // Après = la séance affichée sur la carte (titre, distance)
   const coh=await p.evaluate(()=>[...document.querySelectorAll("#days [data-aiba]")].map(b=>{ const a=b.closest("article"), c=document.getElementById(b.getAttribute("aria-controls")), now=c.querySelector(".aiba-r.now"), bef=c.querySelector(".aiba-r:not(.now)");
     return {title:a.querySelector(".title").textContent,after:now.querySelector("b").textContent,before:bef.querySelector("b").textContent,afterTxt:now.textContent,chip:[...a.querySelectorAll(".chip.rest")].map(x=>x.textContent).join("|")}; }));
   ok(coh.every(x=>x.title===x.after),"B7 « Après » reprend le titre de la carte",coh);
   ok(coh.every(x=>{ const km=(x.chip.match(/([\d,]+) km/)||[])[1], ka=(x.afterTxt.match(/([\d,]+) km/)||[])[1]; return km&&ka&&km.replace(/,0$/,"")===ka; }),"B8 « Après » : même distance que la puce de la carte",coh.map(x=>[x.chip,x.afterTxt]));
   // déplacer une séance modifiée : le repère et l'avant / après la suivent ; l'état ouvert ne passe pas sur la séance échangée
   const mv=await p.evaluate(()=>{ const a=document.querySelector("#days [data-aiba]").closest("article"); const d=+a.dataset.day; const t=a.querySelector(".title").textContent; return {d,t}; });
   const target=await p.evaluate(d=>{ const pl=window.__T.plan, w=pl[+document.querySelector("#weekSel").value-1]; for(let j=0;j<7;j++) if(j!==d&&w.days[j].kind!=="before"&&w.days[j].kind!=="race"&&!(w.days[j].run&&w.days[j].run.aiFrom)) return j; return -1; },mv.d);
   if(target>=0&&await p.$(`#days [data-move="${mv.d}"]`)){ await p.click(`#days [data-move="${mv.d}"]`); await p.waitForSelector(".sheet [data-to]"); await p.click(`.sheet [data-to="${target}"]`); await p.waitForTimeout(300);
     const r=await p.evaluate(({d,j,t})=>{ const A=document.querySelector(`#days article[data-day="${j}"]`), B=document.querySelector(`#days article[data-day="${d}"]`);
       return {tTitle:A&&A.querySelector(".title")&&A.querySelector(".title").textContent,tChip:!!(A&&A.querySelector(".chip.ai")),tBtn:A&&A.querySelector("[data-aiba]")&&A.querySelector("[data-aiba]").getAttribute("aria-expanded"),sChip:!!(B&&B.querySelector(".chip.ai")),sBtn:!!(B&&B.querySelector("[data-aiba]"))}; },{d:mv.d,j:target,t:mv.t});
     ok(r.tTitle===mv.t&&r.tChip&&!r.sChip&&!r.sBtn,"B9 séance modifiée déplacée : repère et avant / après la suivent",r);
     ok(r.tBtn==="true","B10 séance modifiée déplacée : son avant / après ouvert reste ouvert (l'état suit la séance, pas le jour)",r);
     await p.click("#resetMoves"); await p.waitForTimeout(200); }
   else ok(true,"B9 (pas de déplacement possible)");
   // séance modifiée dans le passé de la semaine en cours, marquée faite
   await goW(4);
   const past=await p.evaluate(()=>{ const w=window.__T.plan[3], t=new Date(); const today=(t.getDay()+6)%7; return w.days.map((d,i)=>({i,mod:!!(d.run&&d.run.aiFrom),q:!!(d.run&&d.run.type==="q"),title:d.run&&d.run.title})).filter(x=>x.i<=today); });
   ok(true,"B11 semaine en cours, jours passés : "+JSON.stringify(past.filter(x=>x.q||x.mod)));
   await p.ctx.close(); }

 /* ---- séance faite AVANT l'ajustement : l'IA ne la remplace pas, la marque « Faite » reste ---- */
 { const p=await mk({clock:"2026-10-22T10:00:00",session:null});
   await p.click("#tab-semaine"); await p.waitForTimeout(200); await p.selectOption("#weekSel","4"); await p.waitForTimeout(200);
   const qd=await p.evaluate(()=>{ const w=window.__T.plan[3], today=(new Date().getDay()+6)%7; const d=w.days.find(d=>d.i<today&&d.run&&d.run.type==="q"&&d.run.kind&&window.__T.qOpts(d.run.kind,window.__T.profileNums(window.__T.state.profile),w.qPool).length>1); return d? d.i : -1; });
   if(qd>=0&&await p.$(`#days [data-done="${qd}"]`)){ await p.click(`#days [data-done="${qd}"]`); await p.waitForTimeout(200);
     const t0=await p.evaluate(i=>document.querySelector(`#days article[data-day="${i}"] .title`).textContent,qd);
     await p.evaluate(INJ("w=>false")); await p.waitForTimeout(200);
     const r=await p.evaluate(i=>{ const a=document.querySelector(`#days article[data-day="${i}"]`); return {title:a.querySelector(".title").textContent,ai:!!a.querySelector(".chip.ai"),done:!!a.querySelector(".chip.ok"),pressed:a.querySelector("[data-done]").getAttribute("aria-pressed")}; },qd);
     ok(!r.ai&&r.done&&r.title===t0,"C1 séance d'origine cochée avant l'ajustement : l'IA ne la remplace pas, la marque « Faite » reste",{avant:t0,...r});
     await p.evaluate(INJ("w=>w===4")); await p.waitForTimeout(200);
     const r2=await p.evaluate(i=>{ const a=document.querySelector(`#days article[data-day="${i}"]`); return {title:a.querySelector(".title").textContent,ai:a.querySelector(".chip.ai")&&a.querySelector(".chip.ai").textContent,done:!!a.querySelector(".chip.ok")}; },qd);
     ok(!r2.ai&&r2.done&&r2.title===t0,"C2 séance d'origine cochée puis semaine allégée par l'IA : la séance n'est pas réécrite et reste « Faite »",{avant:t0,...r2}); }
   else ok(false,"C1 aucune séance d'intensité modifiable avant le jeudi de la semaine 4 (date simulée)",qd);
   await p.ctx.close(); }

 /* ---- préférences : séance de côtes cochée AVANT « pas de côtes » : jamais remplacée, la coche reste ; une séance de côtes à venir non cochée devient un footing ---- */
 { const p=await mk({clock:"2026-10-22T10:00:00",session:null,sd:seed({profile:{objectif:"forme"}})});
   const tg=await p.evaluate(()=>{ const out=[]; for(const w of window.__T.plan){ if(w.phase==="taper"||w.phase==="race") continue; for(const d of w.days) if(d.run&&d.run.type==="q"&&d.run.kind==="cotes"&&(w.w>4||(w.w===4&&d.i>=3))) out.push({w:w.w,i:d.i,t:d.run.title}); } return out; });
   ok(tg.length>=2,"PL0 plan de test : au moins deux séances de côtes à venir",tg);
   if(tg.length>=2){ const [c1,c2]=[tg[0],tg.find(x=>x.w>tg[0].w)||tg[1]], day=new Date("2026-09-28T10:00:00"); day.setDate(day.getDate()+(c1.w-1)*7+c1.i);
     await p.clock.setSystemTime(day); await p.click("#tab-semaine"); await p.waitForTimeout(200); await p.selectOption("#weekSel",String(c1.w)); await p.waitForTimeout(200);
     await p.click(`#days [data-done="${c1.i}"]`); await p.waitForTimeout(200);
     await p.evaluate(()=>{ const T=window.__T; T.state.profile.pref="pas de côtes"; T.persist(); T.recompute(); }); await p.selectOption("#weekSel",String(c1.w)); await p.waitForTimeout(250);
     const r=await p.evaluate(({c1,c2})=>{ const T=window.__T, a=document.querySelector(`#days article[data-day="${c1.i}"]`), d1=T.plan[c1.w-1].days[c1.i], d2=T.plan[c2.w-1].days[c2.i];
       return {kind1:d1.run&&d1.run.kind,title:a.querySelector(".title").textContent,done:!!a.querySelector(".chip.ok"),pressed:a.querySelector("[data-done]").getAttribute("aria-pressed"),type2:d2.run&&d2.run.type,pref2:!!(d2.run&&d2.run.pref),note2:d2.run&&d2.run.note||""}; },{c1,c2});
     ok(r.kind1==="cotes"&&r.title===c1.t&&r.done,"PL1 séance de côtes cochée puis « pas de côtes » : la séance reste des côtes et reste cochée",{avant:c1,...r});
     ok(r.type2==="easy"&&r.pref2&&/Préférence : pas de côtes/.test(r.note2),"PL2 séance de côtes à venir non cochée : devient un footing facile (note « Préférence : pas de côtes »)",{c2,...r});
     await p.reload(); await p.waitForTimeout(900); await p.click("#tab-semaine"); await p.waitForTimeout(200); await p.selectOption("#weekSel",String(c1.w)); await p.waitForTimeout(200);
     const r3=await p.evaluate(i=>{ const a=document.querySelector(`#days article[data-day="${i}"]`); return {title:a.querySelector(".title").textContent,done:!!a.querySelector(".chip.ok")}; },c1.i);
     ok(r3.title===c1.t&&r3.done,"PL3 après rechargement : séance de côtes et coche gardées",r3); }
   await p.ctx.close(); }
 /* ---- séance de l'IA cochée « Faite » : l'IA reste appliquée et la coche aussi, même après recalcul, rechargement et passage du jour ---- */
 { const p=await mk({clock:"2026-10-22T10:00:00",session:null});
   await p.evaluate(INJ("w=>false")); await p.click("#tab-semaine"); await p.waitForTimeout(200);
   // première séance modifiée (non allégée) à partir d'aujourd'hui (jeudi de la semaine 4)
   const tg=await p.evaluate(()=>{ for(const w of window.__T.plan) for(const d of w.days) if(d.run&&d.run.aiFrom&&!d.run.aiLight&&(w.w>4||(w.w===4&&d.i>=3))) return {w:w.w,i:d.i,t:d.run.title}; return null; });
   if(tg){ const day=new Date("2026-09-28T10:00:00"); day.setDate(day.getDate()+(tg.w-1)*7+tg.i);
     await p.clock.setSystemTime(day); await p.selectOption("#weekSel",String(tg.w)); await p.waitForTimeout(200);
     await p.click(`#days [data-done="${tg.i}"]`); await p.waitForTimeout(200);
     const st=()=>p.evaluate(i=>{ const a=document.querySelector(`#days article[data-day="${i}"]`); return {title:a.querySelector(".title").textContent,ai:!!a.querySelector(".chip.ai"),done:!!a.querySelector(".chip.ok"),btn:!!a.querySelector("[data-aiba]")}; },tg.i);
     const good=r=>r.title===tg.t&&r.ai&&r.done&&r.btn;
     const r0=await st(); ok(good(r0),"G1 séance de l'IA cochée « Faite » : puce IA, titre IA et coche",{tg,...r0});
     await p.evaluate(()=>window.__T.recompute()); await p.waitForTimeout(150); const r1=await st();
     ok(good(r1),"G2 après recalcul : l'IA reste appliquée et la coche aussi",{tg,...r1});
     await p.reload(); await p.waitForTimeout(900); await p.click("#tab-semaine"); await p.selectOption("#weekSel",String(tg.w)); await p.waitForTimeout(200); const r2=await st();
     ok(good(r2),"G3 après rechargement : l'IA reste appliquée et la coche aussi",{tg,...r2});
     // (b) le jour passe : la séance affichée ne change pas
     const next=new Date(day); next.setDate(next.getDate()+1); await p.clock.setSystemTime(next);
     await p.evaluate(()=>window.__T.recompute()); await p.waitForTimeout(150); const r3=await st();
     ok(good(r3),"G4 lendemain (date simulée), après recalcul : séance de l'IA et coche gardées",{tg,...r3});
     await p.reload(); await p.waitForTimeout(900); await p.click("#tab-semaine"); await p.selectOption("#weekSel",String(tg.w)); await p.waitForTimeout(200); const r4=await st();
     ok(good(r4),"G5 lendemain, après rechargement : séance de l'IA et coche gardées",{tg,...r4}); }
   else ok(false,"G1 aucune séance modifiée par l'IA à venir");
   await p.ctx.close(); }

 /* ---- profil : liste repliée, profil modifié, retrait, rechargement, deux onglets ---- */
 { const db=L.makeDb(); const c=await b.newContext({viewport:{width:1280,height:900},locale:"fr-FR"}); const p=await mk({db,ctx:c});
   await p.evaluate(INJ("w=>w%2===0")); await p.click("#tab-profil"); await p.waitForTimeout(200);
   const l1=await p.evaluate(()=>({hid:document.querySelector("#aipMods").hidden,open:document.querySelector("#aipMods").open,n:document.querySelectorAll("#aipModsL li").length,t:document.querySelector("#aipModsT").textContent,ai:window.__T.plan.ai.n,cards:window.__T.plan.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length}));
   ok(!l1.hid&&!l1.open&&l1.n===l1.cards&&l1.n===l1.ai,"D1 profil : liste repliée, autant de lignes que de séances modifiées",l1);
   await p.focus("#aipModsT"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
   ok(await p.evaluate(()=>document.querySelector("#aipMods").open),"D2 clavier : Entrée sur le résumé déplie la liste");
   // deux onglets : le second reçoit l'ajustement par la synchro locale
   const p2=await c.newPage(); p2.on("pageerror",e=>E.push("PE2 "+e.message)); await L.fake(p2,db,{session:L.SESSION()}); await p2.goto(S.url+"/"); await p2.waitForTimeout(900);
   await p2.click("#tab-semaine"); await p2.waitForTimeout(200);
   const t2=await p2.evaluate(()=>window.__T.plan.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length);
   ok(t2===l1.cards,"D3 deuxième onglet : mêmes séances modifiées",{t2,c:l1.cards});
   await p.click("#aipOff"); await p.waitForTimeout(400);
   const t3=await p2.evaluate(()=>({n:window.__T.plan.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length,chips:document.querySelectorAll("#days .chip.ai, #days [data-aiba]").length}));
   ok(t3.n===0&&t3.chips===0,"D4 retrait dans un onglet : l'autre onglet n'affiche plus d'avant / après",t3);
   await p2.close();
   // rechargement : l'ajustement et l'avant / après reviennent
   await p.evaluate(INJ("w=>w%2===0")); await p.reload(); await p.waitForTimeout(900); await p.click("#tab-profil"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>!document.querySelector("#aipMods").hidden&&document.querySelectorAll("#aipModsL li").length>0),"D5 rechargement : la liste avant / après revient");
   // profil modifié : liste masquée, repères retirés des cartes
   await p.evaluate(()=>{ window.__T.state.profile.seances="4"; window.__T.persist(); window.__T.recompute(); }); await p.waitForTimeout(200);
   const l2=await p.evaluate(()=>({hid:document.querySelector("#aipMods").hidden,st:document.querySelector("#aipSt").textContent,cards:window.__T.plan.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length}));
   ok(l2.hid&&/a changé/.test(l2.st)&&l2.cards===0,"D6 profil modifié : liste masquée, plus aucune séance marquée",l2);
   await c.close(); }

 /* ---- invité ---- */
 { const p=await mk({session:null}); await p.evaluate(INJ("w=>w%2===0")); await p.click("#tab-profil"); await p.waitForTimeout(200);
   const g=await p.evaluate(()=>({vis:!document.querySelector("#aiPlan").hidden,mods:!document.querySelector("#aipMods").hidden,li:document.querySelectorAll("#aipModsL li").length,cards:window.__T.plan.flatMap(w=>w.days).filter(d=>d.run&&d.run.aiFrom).length,st:document.querySelector("#aipSt").textContent}));
   ok(!g.vis||g.li===g.cards,"E1 invité avec ajustement local : liste et cartes cohérentes",g);
   ok(true,"E1 info invité : "+JSON.stringify(g));
   await p.ctx.close(); }

 /* ---- mobile 375 px et bureau 1280 px ---- */
 for(const width of [375,1280]){ const p=await mk({width}); await p.evaluate(INJ("w=>w%2===0")); await p.click("#tab-semaine"); await p.waitForTimeout(200);
   const wm=await p.evaluate(()=>window.__T.plan.find(w=>w.w>=4&&w.days.some(d=>d.run&&d.run.aiLight)).w); await p.selectOption("#weekSel",String(wm)); await p.waitForTimeout(200);
   const bs=await p.$$("#days [data-aiba]"); for(const x of bs){ await x.click(); } await p.waitForTimeout(150);
   const r=await p.evaluate(()=>{ const bt=[...document.querySelectorAll("#days [data-aiba]")]; return {sw:document.documentElement.scrollWidth,h:bt.map(x=>x.getBoundingClientRect().height),w:bt.map(x=>x.getBoundingClientRect().width),over:[...document.querySelectorAll(".aiba-r")].some(x=>x.scrollWidth>x.clientWidth+1)}; });
   ok(r.sw<=width&&!r.over,`F1 ${width} px : pas de défilement horizontal, lignes avant / après contenues`,r);
   ok(r.h.every(h=>h>=24)&&r.w.every(w=>w>=24),`F2 ${width} px : cible tactile du bouton ≥ 24 px (WCAG 2.5.8)`,r);
   if(SHOTS){ const a=await p.$("#days [data-aiba]"); await a.evaluate(e=>e.closest("article").scrollIntoView()); await p.screenshot({path:path.join(SHOTS,`aiba-semaine-${width}.png`)});
     await p.click("#tab-profil"); await p.evaluate(()=>{ const d=document.querySelector("#aipMods"); d.open=true; d.scrollIntoView(); }); await p.waitForTimeout(150); await p.screenshot({path:path.join(SHOTS,`aiba-profil-${width}.png`)}); }
   await p.click("#tab-profil"); await p.evaluate(()=>{ document.querySelector("#aipMods").open=true; }); await p.waitForTimeout(100);
   ok(await p.evaluate(w=>document.documentElement.scrollWidth<=w,width),`F3 ${width} px : profil, liste dépliée sans défilement horizontal`);
   await p.ctx.close(); }

 ok(!E.length,"aucune erreur JS ni avertissement console",E.slice(0,5));
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); process.exit(fails?1:0); })();
