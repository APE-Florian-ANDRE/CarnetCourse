// Plan : complexité (simple / standard / avancé) et ajustement par l'IA (api/plan.js) — moteur, garde-fous, consentement, faux serveur, affichage
const {chromium}=require("playwright"); const L=require("./lib"); const http=require("http"), fs=require("fs"), path=require("path");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"5",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",raceDate:""};
const seed=(o={})=>JSON.stringify({profile:{...prof,...o.profile},isExample:false,log:[],feel:{"2026-10-08":{rpe:8,mood:2,pain:1,zone:"genou",note:"NOTE-SECRETE",at:5}},week:2,seen:15,...(o.aip?{aip:o.aip}:{})});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):"")); };
const JWT="aaaaaaaaaa.bbbbbbbbbb.cccccccccc"; const GOOD={...L.SESSION(),access_token:JWT};
// app.js de test : les fonctions internes du moteur sont exposées pour les vérifier directement
const appT=()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,planSig,qOpts,prefParse,sessionKm,sessionMin,zoneMins,vmaOf,cleanAip,SUBST,get state(){return state;}};\n})();\n");
(async()=>{
 // faux serveur api/plan : renvoie le 2e remplaçant permis de chaque séance, allège la semaine en cours, et un conseil hostile (HTML) pour vérifier l'échappement
 const hits=[]; let mode="ok"; const api=http.createServer((req,res)=>{ const cors={"Access-Control-Allow-Origin":req.headers.origin||"*","Access-Control-Allow-Headers":"content-type, authorization","Access-Control-Allow-Methods":"POST, OPTIONS"};
   if(req.method==="OPTIONS"){ res.writeHead(204,cors); return res.end(); }
   let b=""; req.on("data",c=>b+=c); req.on("end",()=>{ let j={}; try{ j=JSON.parse(b); }catch(e){} hits.push({auth:req.headers.authorization||"",body:j,raw:b});
     const send=(st,o)=>{ res.writeHead(st,{...cors,"Content-Type":"application/json"}); res.end(JSON.stringify(o)); };
     if(mode==="429") return send(429,{reply:"Trop de demandes pour le moment : réessaie dans quelques minutes."});
     if(mode==="bad") return send(200,{plan:"pas un objet"});
     const delay=mode==="slow"?1800:0;
     const sem=(j.semaines||[]).map((w,i)=>({s:w.s,focus:i===0?"<img src=x onerror=window.__pwn=1>Régularité":"Régularité",conseil:"Couche-toi tôt la veille de la séance d'intensité.",q:(w.qualite||[]).map(x=>x.options[1]||"garder"),allege:i===0&&(w.qualite||[]).length>0}));
     setTimeout(()=>send(200,{plan:{resume:"Plus de fartlek pour ménager ta fatigue.",semaines:sem}}),delay); }); });
 await new Promise(r=>api.listen(0,"127.0.0.1",r)); const API="http://127.0.0.1:"+api.address().port+"/api/plan"; L.EXTRA.v=" http://127.0.0.1:"+api.address().port;
 const b=await chromium.launch(); const E=[];
 const mk=async(S,{session=GOOD,sd=seed(),width=1280,db=L.makeDb()}={})=>{ const ctx=await b.newContext({viewport:{width,height:900},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource|net::ERR|CORS|status of (4|5)\d\d/.test(m.text())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,db,{session}); await p.addInitScript(({sd,pend})=>{ if(!sessionStorage.__seed){ sessionStorage.__seed=1; localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); if(pend) localStorage.setItem("carnet.consent",pend); } },{sd,pend:session?JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()}):null});
  await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };

 /* ---- moteur ---- */
 { const S=await L.serve({"/config.js":L.cfgJs(),"/app.js":appT}); const p=await mk(S);
   const R=await p.evaluate(()=>{ const T=window.__T, out={};
     const wkInfo=(pl,n)=>{ const v=T.vmaOf(n).vma; return pl.map(wk=>{ const ds=wk.days.filter(d=>d.run&&d.run.type!=="race"); return {w:wk.w,phase:wk.phase,km:ds.reduce((a,d)=>a+T.sessionKm(d.run,v),0),q:wk.days.filter(d=>d.run&&d.run.type==="q").map(d=>({k:d.run.kind,h:d.run.hardMin||0,km:T.sessionKm(d.run,v)})),easy:T.zoneMins(wk.days).easy,renfo:wk.days.filter(d=>d.renfo).map(d=>d.renfo.t+d.renfo.m)}; }); };
     const P=(o)=>T.profileNums({...T.state.profile,...o});
     const profiles={int10:{},conf42:{niveau:"conf",objectif:"42",raceDate:"2027-04-11",volume:45,longest:20},intForme:{objectif:"forme"},deb:{niveau:"deb",objectif:"forme",seances:"3",volume:8,longest:4},trail:{sport:"trail",objectif:"21",raceDate:"2027-03-14",volume:30,longest:14},long:{objectif:"21",raceDate:"2027-09-12"}};
     out.prof={};
     for(const [k,o] of Object.entries(profiles)){ const r={};
       for(const c of ["","standard","simple","avance"]){ const n=P({...o,cplx:c}); r[c||"none"]={info:wkInfo(T.buildPlan(n),n),deb:n.niveau==="deb"}; }
       out.prof[k]=r; }
     // ajustement IA : chaque séance reçoit son 2e remplaçant permis, une semaine sur trois est allégée
     const n=P({}), plan0=T.buildPlan({...n,noAi:true}), wk={};
     for(const w of plan0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"But "+w.w,c:"Conseil "+w.w,q:qs.map(d=>T.qOpts(d.run.kind,n)[1]||""),a:w.w%3===0?1:0}; }
     T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"r",wk}});
     const plan1=T.buildPlan(n); out.ai={before:wkInfo(plan0,n),after:wkInfo(plan1,n),n:plan1.ai&&plan1.ai.n,tips:plan1.filter(w=>w.aiTip).length,N:plan1.length,opts:plan0.map(w=>w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind).map(d=>T.qOpts(d.run.kind,n)))};
     out.aiRace=(()=>{ const n2=P({objectif:"10",raceDate:"2026-12-20"}), p0=T.buildPlan({...n2,noAi:true}), wk2={}; for(const w of p0) wk2[w.w]={f:"",c:"x",q:["fartlek","fartlek"],a:1};
       T.state.aip=T.cleanAip({p:{sig:T.planSig(n2),at:Date.now(),cplx:"standard",resume:"",wk:wk2}}); const p1=T.buildPlan(n2);
       return p0.filter(w=>w.phase==="taper"||w.phase==="race").every(w=>JSON.stringify(w.days)===JSON.stringify(p1[w.w-1].days)); })();
     out.aiDeb=(()=>{ const n3=P(profiles.deb), p0=T.buildPlan({...n3,noAi:true}), wk3={}; for(const w of p0) wk3[w.w]={f:"",c:"x",q:["vma","vma"],a:0};
       T.state.aip=T.cleanAip({p:{sig:T.planSig(n3),at:Date.now(),cplx:"standard",resume:"",wk:wk3}}); const p1=T.buildPlan(n3);
       return JSON.stringify(p0.map(w=>w.days))===JSON.stringify(p1.map(w=>w.days)); })();
     out.sig=(()=>{ T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk}}); const other=P({seances:"4"}); return !T.buildPlan(other).ai&&!!T.buildPlan(n).ai; })();
     out.fix={
       simpleVma:(()=>{ const n=P({types:["vma"],cplx:"simple",objectif:"forme"}); return T.buildPlan(n).some(w=>w.days.some(d=>d.run&&d.run.kind==="vma")); })(),
       debLong:(()=>{ const o={niveau:"deb",objectif:"10",seances:"3",volume:15,longest:6,raceDate:"2027-06-27",start:"2026-10-26"}; return JSON.stringify(T.buildPlan(P({...o,cplx:"avance"})).map(w=>w.days))===JSON.stringify(T.buildPlan(P({...o,cplx:"standard"})).map(w=>w.days)); })(),
       fallback:(()=>{ const o={objectif:"10",volume:0,longest:10,seances:"4",types:["seuil","cotes","fartlek","ld"],raceDate:"2027-05-30",start:"2026-10-26",ref:"5",refVal:"35:12"}, rank={forme:0,5:1,10:2,21:3,42:4}, used=c=>{ const pl=T.buildPlan(P({...o,cplx:c})); return pl.unreal? pl.unreal.used : o.objectif; };
         return ["simple","avance"].every(c=>rank[used(c)]<=rank[used("standard")]); })(),
       count:(()=>{ const n=P({}), p0=T.buildPlan({...n,noAi:true}), wk={}; for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"",c:"x",q:qs.map(d=>T.qOpts(d.run.kind,n)[1]||""),a:1}; }
         T.state.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:"standard",resume:"",wk}}); const p1=T.buildPlan(n); const qn=p0.reduce((a,w)=>a+w.days.filter(d=>d.run&&d.run.type==="q").length,0); T.state.aip={}; return {n:p1.ai.n,qn}; })()
     };
     out.clean=[T.cleanAip({p:{sig:"abc",at:5,cplx:"zzz",resume:"<b>x</b>"+"y".repeat(400),wk:{"0":{c:"no"},"3":{f:"<i>f</i>",c:"c",q:["seuil","rm -rf",7],a:true},"x":{}}}}),T.cleanAip({p:{sig:"../",at:5}}),T.cleanAip([1]),T.cleanAip({p:{x:1,at:9}})];
     // préférences de séances : motifs reconnus sans IA, jamais plus de charge
     T.state.aip={};
     out.pp=["pas de côtes","Sans VMA, j'aime le fartlek","je n'aime pas le fractionné","je préfère les côtes au fractionné","du fartlek plutôt que de la VMA","pas de fractionné le lundi","plutôt des séances courtes en semaine","les côtes ne me dérangent pas","j'aime le fartlek mais pas les montées","je ne veux plus de seuil","j'adore la VMA, pas de VMA","j'ai peur des côtes","à côté du travail, pas le temps"].map(t=>[t,T.prefParse(t)]);
     const RK={fartlek:1,cotes:1.5,seuil:2,vma:3,allure:9};
     const kinds=pl=>pl.flatMap(w=>w.days.filter(d=>d.run&&d.run.type==="q").map(d=>d.run.kind));
     const cmpPl=(a,b,n)=>{ const A=wkInfo(a,n), B=wkInfo(b,n); return {len:A.length===B.length, km:A.every((w,i)=>w.km<=B[i].km+.05), rank:A.every((w,i)=>w.q.length<B[i].q.length||w.q.every((x,j)=>RK[x.k]<=RK[B[i].q[j].k])), easy:A.every((w,i)=>w.easy>=Math.min(B[i].easy,.8)-1e-9), nq:A.every((w,i)=>w.q.length<=B[i].q.length), sess:A.every((w,i)=>w.q.length<B[i].q.length||w.q.every((x,j)=>x.km<=B[i].q[j].km+.01))}; };
     out.pe={};
     for(const [nm,o] of Object.entries({int10:{},intForme:{objectif:"forme"},conf42:profiles.conf42,trail:profiles.trail})){ const n0=P(o), b0=T.buildPlan(n0), r={};
       for(const t of ["pas de côtes","pas de VMA","plutôt du fartlek","j'aime le seuil","j'adore la VMA"]){ const n1=P({...o,pref:t}), b1=T.buildPlan(n1); r[t]={k0:kinds(b0),k1:kinds(b1),k1h:b1.filter(w=>w.phase!=="taper"&&w.phase!=="race").flatMap(w=>w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind==="cotes")).length,cmp:cmpPl(b1,b0,n1)}; }
       out.pe[nm]=r; }
     { const o=profiles.deb, n0=P(o); out.peDeb=["j'aime le seuil","pas de fartlek","j'adore la VMA"].map(t=>JSON.stringify(T.buildPlan(P({...o,pref:t})).map(w=>w.days))===JSON.stringify(T.buildPlan(n0).map(w=>w.days))); }
     out.peDay=JSON.stringify(T.buildPlan(P({pref:"pas de fractionné le lundi, plutôt des séances courtes en semaine"})).map(w=>w.days))===JSON.stringify(T.buildPlan(P({})).map(w=>w.days));
     out.peOpts=[T.qOpts("seuil",P({pref:"pas de VMA"})),T.qOpts("cotes",P({pref:"sans fartlek"}))];
     out.peSig=[T.planSig(P({}))===T.planSig(P({pref:""})),T.planSig(P({}))!==T.planSig(P({pref:"j'aime les côtes"})),T.planSig(P({pref:"j'aime les côtes"}))!==T.planSig(P({pref:"j'aime le fartlek"}))];
     out.peClean=P({pref:"a\u0000b\u202ec  "+"x".repeat(400)}).pref;
     T.state.aip={};
     return out; });
   for(const [k,r] of Object.entries(R.prof)){
     ok(JSON.stringify(r.none.info)===JSON.stringify(r.standard.info),"M1 "+k+" : sans réglage = standard (plan inchangé)");
     ok(r.simple.info.every(w=>w.q.length<=1&&!w.q.some(x=>x.k==="vma")),"M2 "+k+" simple : une séance d'intensité au plus par semaine, jamais de VMA",r.simple.info.filter(w=>w.q.length>1||w.q.some(x=>x.k==="vma")).map(w=>w.w));
     const kmS=r.standard.info.reduce((a,w)=>a+w.km,0), kmSi=r.simple.info.reduce((a,w)=>a+w.km,0);
     ok(kmSi<=kmS*1.03+1,"M3 "+k+" simple : volume total pas plus haut que standard",[kmS,kmSi]);
     ok(r.simple.info.every((w,i)=>w.easy>=Math.min(r.standard.info[i].easy,.8)-1e-9),"M4 "+k+" simple : part de facile jamais sous celle du standard (ou 80 %)",r.simple.info.map((w,i)=>[w.w,w.easy,r.standard.info[i].easy]).filter(x=>x[1]<Math.min(x[2],.8)-1e-9));
     const hS=r.standard.info.reduce((a,w)=>a+w.q.reduce((x,y)=>x+y.h,0),0), hA=r.avance.info.reduce((a,w)=>a+w.q.reduce((x,y)=>x+y.h,0),0);
     const hSi=r.simple.info.reduce((a,w)=>a+w.q.reduce((x,y)=>x+y.h,0),0);
     ok(hSi<=hS+1e-9,"M4b "+k+" simple : minutes d'intensité du plan au plus celles du standard",[hS,hSi]);
     if(r.standard.deb||k==="conf42") ok(JSON.stringify(r.avance.info)===JSON.stringify(r.standard.info),"M5 "+k+" avancé : sans effet (débutant ou déjà confirmé)");
     else ok(hA>=hS&&r.avance.info.length===r.standard.info.length,"M5 "+k+" avancé : intensité totale au moins égale à standard",[hS,hA]);
     ok(r.avance.info.every((w,i)=>Math.abs(w.km-r.standard.info[i].km)<=Math.max(2,r.standard.info[i].km*.12)),"M6 "+k+" avancé : volume de chaque semaine proche de standard");
   }
   const A=R.ai, bef=A.before, aft=A.after;
   ok(A.n>5&&A.tips===A.N,"M7 IA appliquée : "+A.n+" séances modifiées, un conseil sur chaque semaine",[A.n,A.tips,A.N]);
   ok(aft.every((w,i)=>w.km<=bef[i].km*1.05+.6),"M8 IA : volume de chaque semaine jamais au-dessus du plan (+5 %)",aft.map((w,i)=>[w.km,bef[i].km]).filter(([a,c])=>a>c*1.05+.6));
   ok(aft.every((w,i)=>w.easy>=Math.min(bef[i].easy,.8)-1e-9),"M9 IA : part de facile jamais sous celle du plan (ou 80 %)");
   ok(aft.every((w,i)=>w.q.reduce((a,x)=>a+x.h,0)<=bef[i].q.reduce((a,x)=>a+x.h,0)*1.1+1),"M10 IA : minutes d'intensité de chaque semaine au plus +10 %");
   ok(aft.every((w,i)=>w.q.every(x=>!x.k||A.opts[i].flat().includes(x.k))),"M11 IA : types choisis parmi les remplaçants permis");
   ok(aft.every(w=>new Set(w.q.map(x=>x.k)).size===w.q.length),"M12 IA : jamais deux fois le même type dans une semaine");
   ok(aft.filter((w,i)=>w.w%3===0&&bef[i].q.length&&w.phase!=="taper"&&w.phase!=="race").every(w=>w.q.length===bef[w.w-1].q.length-1),"M13 IA : semaine allégée = une séance d'intensité en moins");
   ok(R.aiRace,"M14 IA : affûtage et semaine de course jamais modifiés");
   ok(R.aiDeb,"M15 IA : débutant, aucune séance d'intensité changée de type");
   ok(R.sig,"M16 IA : profil modifié depuis l'ajustement, ajustement ignoré");
   ok(!R.fix.simpleVma,"M19 simple : aucune VMA même si c'est la seule séance cochée");
   ok(R.fix.debLong,"M20 avancé : sans effet pour un débutant, même sur un plan de plus de 20 semaines");
   ok(R.fix.fallback,"M21 objectif trop loin : la complexité ne fait jamais viser plus loin que le standard");
   ok(R.fix.count.n<=R.fix.count.qn,"M22 IA : une séance changée puis allégée compte une seule fois",R.fix.count);
   { const pp=Object.fromEntries(R.pp.map(([t,r])=>[t,r.no.join()+"|"+r.like.join()]));
     const exp={"pas de côtes":"cotes|","Sans VMA, j'aime le fartlek":"vma|fartlek","je n'aime pas le fractionné":"vma|","je préfère les côtes au fractionné":"|cotes","du fartlek plutôt que de la VMA":"|","pas de fractionné le lundi":"|","plutôt des séances courtes en semaine":"|","les côtes ne me dérangent pas":"|","j'aime le fartlek mais pas les montées":"cotes|fartlek","je ne veux plus de seuil":"seuil|","j'adore la VMA, pas de VMA":"vma|","j'ai peur des côtes":"|","à côté du travail, pas le temps":"|"};
     ok(Object.entries(exp).every(([t,e])=>pp[t]===e),"P1 préférences : motifs reconnus (refus|envie)",Object.entries(exp).filter(([t,e])=>pp[t]!==e).map(([t,e])=>[t,pp[t],e])); }
   for(const [nm,r] of Object.entries(R.pe)){
     for(const [t,x] of Object.entries(r)) ok(Object.values(x.cmp).every(Boolean),"P2 "+nm+" « "+t+" » : jamais plus de km (semaine et séance), jamais un type plus dur, part de facile tenue (ou 80 %), jamais plus de séances d'intensité",x.cmp);
     const nc=r["pas de côtes"]; // refus sans remplaçant valide : footing facile ; plus aucune séance de côtes hors affûtage et course
     ok(nc.k1h===0,"P3 "+nm+" « pas de côtes » : plus aucune séance de côtes hors affûtage et course",[nc.k1h,nc.k0.filter(k=>k==="cotes").length,nc.k1.filter(k=>k==="cotes").length]);
     const nv=r["pas de VMA"]; if(nv.k0.includes("vma")) ok(nv.k1.filter(k=>k==="vma").length<nv.k0.filter(k=>k==="vma").length,"P4 "+nm+" « pas de VMA » : moins de VMA (seuil ou fartlek à la place)",[nv.k0.filter(k=>k==="vma").length,nv.k1.filter(k=>k==="vma").length]);
     const lf=r["plutôt du fartlek"], cnt=(a,k)=>a.filter(x=>x===k).length; ok(cnt(lf.k1,"fartlek")>cnt(lf.k0,"fartlek")&&cnt(lf.k1,"vma")<=cnt(lf.k0,"vma"),"P5 "+nm+" « plutôt du fartlek » : plus de fartlek, jamais plus de VMA",[cnt(lf.k0,"fartlek"),cnt(lf.k1,"fartlek")]);
     const lv=r["j'adore la VMA"]; ok(cnt(lv.k1,"vma")<=cnt(lv.k0,"vma"),"P6 "+nm+" « j'adore la VMA » : jamais plus de VMA sans IA (type plus dur)");
     ok(r["j'aime le seuil"].k1.filter(k=>k==="vma").length<=cnt(r["j'aime le seuil"].k0,"vma"),"P6b "+nm+" « j'aime le seuil » : pas de VMA en plus"); }
   ok(R.peDeb.every(Boolean),"P7 débutant : préférences sans effet sur le plan (pas de type plus dur)",R.peDeb);
   ok(R.peDay,"P8 préférence liée à un jour ou phrase sans type : plan inchangé sans IA (laissée à l'IA)");
   ok(!R.peOpts[0].includes("vma")&&R.peOpts[0][0]==="seuil"&&!R.peOpts[1].includes("fartlek"),"P9 options envoyées à l'IA : type refusé retiré",R.peOpts);
   ok(R.peSig.every(Boolean),"P10 empreinte : préférences vides = profil d'avant ; préférences changées = ajustement IA à relancer",R.peSig);
   ok(R.peClean.length===300-3&&!/[\u0000\u202e]/.test(R.peClean)||Array.from(R.peClean).length<=300&&!/[\u0000\u202e]/.test(R.peClean),"P11 préférences nettoyées (caractères de contrôle, 300 caractères au plus)",R.peClean.length);
   const [c0,c1,c2,c3]=R.clean;
   ok(c0.p&&c0.p.cplx==="standard"&&!/[<>]/.test(c0.p.resume)&&c0.p.resume.length<=320&&Object.keys(c0.p.wk).join()==="3"&&c0.p.wk[3].f==="if/i"&&c0.p.wk[3].q.join()==="seuil,,"&&c0.p.wk[3].a===1,"M17 nettoyage de l'ajustement enregistré (balises, longueurs, types, semaines)",c0);
   ok(JSON.stringify(c1)==="{}"&&JSON.stringify(c2)==="{}"&&c3.p.x===1,"M18 empreinte invalide rejetée, marque de retrait gardée");
   await p.ctx.close(); S.close(); }

 /* ---- interface ---- */
 { const S0=await L.serve({"/config.js":L.cfgJs()}); const p=await mk(S0);
   ok(await p.evaluate(()=>document.querySelector("#aiPlan").hidden),"U0 sans PLAN_AI_URL : bloc caché"); await p.ctx.close(); S0.close(); }
 const S=await L.serve({"/config.js":L.cfgJs({PLAN_AI_URL:API,CHAT_PROVIDER_NAME:"Fournisseur-Test (États-Unis)"})});
 { const p=await mk(S);
   await p.click("#tab-profil"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>!document.querySelector("#aiPlan").hidden&&/Pas encore/.test(document.querySelector("#aipSt").textContent)),"U1 bloc visible, aucun ajustement");
   ok(await p.evaluate(()=>document.querySelector('input[name="cplx"][value="standard"]').checked),"U2 complexité standard cochée par défaut");
   await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend");
   ok(await p.evaluate(()=>/Fournisseur-Test/.test(document.querySelector(".sheet").textContent)&&!document.querySelector("#aipOk").checked&&!document.querySelector("#aipFeel").checked),"U3 feuille : fournisseur nommé, rien de coché");
   await p.click("#aipSend"); await p.waitForTimeout(300);
   ok(hits.length===0&&await p.evaluate(()=>!document.querySelector("#aipErr").hidden),"U4 sans accord : rien n'est envoyé");
   await p.check("#aipOk"); await p.fill("#aipWish","je veux en finir, plus envie de vivre"); await p.click("#aipSend"); await p.waitForTimeout(300);
   ok(hits.length===0&&await p.evaluate(()=>/3114/.test(document.querySelector("#aipErr").textContent)),"U5 demande grave : message de prudence, rien n'est envoyé");
   await p.fill("#aipWish","je préfère les côtes"); await p.click("#aipSend"); await p.waitForTimeout(1200);
   const h=hits[0]||{body:{}};
   ok(h.auth==="Bearer "+JWT,"U6 jeton de connexion joint");
   ok(h.body.v===1&&h.body.complexite==="standard"&&h.body.souhait==="je préfère les côtes"&&h.body.profil&&h.body.profil.age===35&&!h.body.ressenti&&!/NOTE-SECRETE|genou|"poids"|taille/.test(h.raw),"U7 corps : complexité, souhait, âge ; ni ressenti non coché, ni notes, ni poids",h.body);
   ok(Array.isArray(h.body.semaines)&&h.body.semaines[0].s===4&&h.body.semaines.every(w=>(w.qualite||[]).every(x=>x.options[0]===x.type)),"U8 semaines à venir seulement (à partir de la semaine en cours), options permises",h.body.semaines&&h.body.semaines[0]);
   ok(await p.evaluate(()=>!document.querySelector(".sheet")&&/Ajusté le/.test(document.querySelector("#aipSt").textContent)&&!document.querySelector("#aipOff").hidden),"U9 succès : feuille fermée, statut « Ajusté le », bouton Retirer");
   ok(await p.evaluate(()=>/Plan ajusté par l'IA/.test(document.querySelector("#toasts").textContent)),"U10 message de confirmation");
   await p.click("#tab-semaine"); await p.waitForTimeout(200);
   const wk=await p.evaluate(()=>({tip:(document.querySelector("#weekAlerts .aitip")||{}).textContent||"",img:!!document.querySelector("#weekAlerts img"),pwn:!!window.__pwn,light:/semaine allégée/.test(document.querySelector("#days").textContent)}));
   ok(/Conseil de l'IA/.test(wk.tip)&&/Couche-toi tôt/.test(wk.tip)&&!wk.img&&!wk.pwn,"U11 conseil de la semaine affiché comme du texte (HTML neutralisé)",wk);
   ok(wk.light,"U12 semaine allégée par l'IA : footing à la place de la dernière séance d'intensité");
   await p.click("#tab-plan"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>/Plan ajusté par l'IA/.test(document.querySelector("#planAlerts").textContent)),"U13 onglet Plan : ajustement signalé");
   await p.reload(); await p.waitForTimeout(900);
   ok(await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem("carnet-course.v1")); return !!(d.aip&&d.aip.p&&d.aip.p.sig&&Object.keys(d.aip.p.wk).length>3); }),"U14 ajustement enregistré et rechargé");
   await p.click("#tab-profil"); await p.click("#ps-trn summary"); await p.waitForTimeout(150); await p.click('input[name="cplx"][value="simple"] + span'); await p.waitForTimeout(400);
   ok(await p.evaluate(()=>/a changé/.test(document.querySelector("#aipSt").textContent)&&/Simple/.test(document.querySelector("#aipCplx").textContent)),"U15 complexité changée : ajustement plus appliqué, à relancer");
   await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.check("#aipFeel"); await p.click("#aipSend"); await p.waitForTimeout(1200);
   const h2=hits[1]||{body:{}};
   ok(h2.body.complexite==="simple"&&Array.isArray(h2.body.ressenti)&&h2.body.ressenti[0].douleur===1&&!/NOTE-SECRETE|genou|date/.test(JSON.stringify(h2.body.ressenti)),"U16 relance en simple, ressenti coché : effort, forme, douleur seulement",h2.body.ressenti);
   ok(await p.evaluate(()=>/en simple/.test(document.querySelector("#aipSt").textContent)),"U17 statut : ajusté en simple");
   await p.click("#aipOff"); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>/Pas encore/.test(document.querySelector("#aipSt").textContent)&&document.querySelector("#aipOff").hidden),"U18 Retirer : le plan suit de nouveau les règles");
   // préférences de séances : champ du profil, compteur, rappel sans IA, envoi à l'IA, ajustement à relancer
   await p.evaluate(()=>{ document.querySelector("#ps-trn").open=true; }); await p.waitForTimeout(150);
   await p.fill("#pref","je n'aime pas les côtes, plutôt du fartlek ; pas de fractionné le lundi"); await p.waitForTimeout(500);
   const pu=await p.evaluate(()=>({cnt:document.querySelector("#prefCnt").textContent,fx:document.querySelector("#prefFx").hidden?"":document.querySelector("#prefFx").textContent,hint:document.querySelector("#prefHint").textContent,st:document.querySelector("#aipSt").textContent,saved:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.pref}));
   ok(pu.cnt==="71 / 300"&&/pas de côtes/.test(pu.fx)&&/fartlek/.test(pu.fx)&&/ajustement IA/.test(pu.hint),"U29 préférences : compteur, rappel de ce qui s'applique sans IA, note d'usage",pu);
   ok(pu.saved==="je n'aime pas les côtes, plutôt du fartlek ; pas de fractionné le lundi","U30 préférences enregistrées dans le profil",pu.saved);
   ok(/Pas encore|a changé/.test(pu.st),"U31 préférences changées : statut de l'ajustement mis à jour",pu.st);
   { const n0=hits.length; await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.click("#aipSend"); await p.waitForTimeout(1200);
     const h3=hits[n0]||{body:{}}; ok(h3.body.preferences==="je n'aime pas les côtes, plutôt du fartlek ; pas de fractionné le lundi"&&(h3.body.semaines||[]).every(w=>(w.qualite||[]).every(x=>x.type==="cotes"||!x.options.includes("cotes")))&&(h3.body.semaines||[]).some(w=>(w.qualite||[]).some(x=>x.type==="fartlek")),"U32 préférences envoyées à l'IA ; côtes jamais proposées en remplacement",h3.body.preferences); }
   await p.evaluate(()=>{ document.querySelector("#ps-trn").open=true; });
   await p.fill("#pref","je veux en finir, plus envie de vivre"); await p.waitForTimeout(400);
   { const n0=hits.length; await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.click("#aipSend"); await p.waitForTimeout(500);
     ok(hits.length===n0&&await p.evaluate(()=>/3114/.test(document.querySelector("#aipErr").textContent)),"U33 préférences graves : message de prudence, rien n'est envoyé"); await p.keyboard.press("Escape"); await p.waitForTimeout(200); }
   await p.evaluate(()=>{ document.querySelector("#ps-trn").open=true; }); await p.fill("#pref",""); await p.waitForTimeout(300);
   mode="429"; await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.click("#aipSend"); await p.waitForTimeout(800);
   ok(await p.evaluate(()=>/Trop de demandes/.test(document.querySelector("#aipErr").textContent)&&!!document.querySelector(".sheet")),"U19 erreur 429 : message dans la feuille");
   mode="bad"; await p.click("#aipSend"); await p.waitForTimeout(800);
   ok(await p.evaluate(()=>/n'a pas pu/.test(document.querySelector("#aipErr").textContent)),"U20 réponse invalide : message générique"); mode="ok";
   await p.ctx.close(); }
 { const n0=hits.length; const p=await mk(S,{session:null}); await p.click("#tab-profil"); await p.waitForTimeout(200);
   const vis=await p.evaluate(()=>!document.querySelector("#aiPlan").hidden);
   const g=await p.evaluate(()=>({st:document.querySelector("#aipSt").textContent,btn:document.querySelector("#aipGo").textContent}));
   if(vis){ await p.click("#aipGo"); await p.waitForTimeout(300); }
   ok(hits.length===n0&&(!vis||(/Connecte-toi/.test(g.st)&&/Se connecter/.test(g.btn)&&await p.evaluate(()=>!document.querySelector(".sheet #aipSend")))),"U21 invité : le bloc demande de se connecter, rien n'est envoyé",g);
   await p.ctx.close(); }
 { const db=L.makeDb(); const p=await mk(S,{db}); await p.click("#tab-profil"); await p.waitForTimeout(200);
   // envoi lent : Échap ferme la feuille (le focus reste dedans), puis une autre feuille ouverte n'est pas fermée par la réponse tardive
   mode="slow"; await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.click("#aipSend"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!!document.activeElement.closest(".sheet")),"U24 pendant l'envoi : le focus reste dans la feuille");
   await p.keyboard.press("Escape"); await p.waitForTimeout(150); ok(await p.evaluate(()=>!document.querySelector(".sheet")),"U25 pendant l'envoi : Échap ferme la feuille");
   await p.click("#rgGo"); await p.waitForTimeout(2200);
   ok(await p.evaluate(()=>!!document.querySelector('.sheet[data-kind="regen"]')&&/Plan ajusté par l'IA/.test(document.querySelector("#toasts").textContent)),"U26 réponse tardive : la feuille Regénérer reste ouverte, l'ajustement est quand même appliqué");
   await p.keyboard.press("Escape"); await p.waitForTimeout(1600);
   ok(JSON.stringify([...db.rows.values()].map(r=>r.doc&&r.doc.aip)).includes('"sig"'),"U27 ajustement enregistré dans le compte (synchro entre appareils)");
   // profil changé pendant l'attente : la réponse n'est pas appliquée
   await p.click("#aipGo"); await p.waitForSelector(".sheet #aipSend"); await p.check("#aipOk"); await p.click("#aipSend"); await p.waitForTimeout(150); await p.keyboard.press("Escape");
   await p.click("#ps-trn summary"); await p.waitForTimeout(150); await p.click('input[name="cplx"][value="avance"] + span'); await p.waitForTimeout(2200);
   ok(await p.evaluate(()=>/a changé/.test(document.querySelector("#aipSt").textContent)&&/profil a changé pendant/.test(document.querySelector("#toasts").textContent)),"U28 profil changé pendant l'attente : réponse ignorée et signalée");
   mode="ok"; await p.ctx.close(); }
 { const p=await mk(S,{sd:seed({profile:{age:16}})}); await p.click("#tab-profil"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>document.querySelector("#aiPlan").hidden),"U22 moins de 18 ans : bloc caché"); await p.ctx.close(); }
 { const p=await mk(S,{width:390}); await p.click("#tab-profil"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=390),"U23 mobile : pas de défilement horizontal"); await p.ctx.close(); }
 ok(!E.length,"aucune erreur JS ni avertissement console",E.slice(0,5));
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); api.close(); process.exit(fails?1:0); })();
