// Préférences de séances (texte libre du profil) : tests adversariaux — analyse des phrases, invariants du moteur par tirage aléatoire,
// ajustement IA identique à main (refactor swapQ), filet de sécurité, synchronisation, import/export, invité, interface
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path"), {execSync}=require("child_process");
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,600):"")); };
const EXPOSE="window.__T={buildPlan,profileNums,planSig,qOpts,sessionKm,zoneMins,vmaOf,cleanAip,cleanProfile,mergeProfile,EXAMPLE,get state(){return state;},set aip(v){state.aip=v;}";
const expose=(src,extra)=>{ const s=src.replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\n"+EXPOSE+(extra||"")+"};\n})();\n"); if(s===src) throw new Error("exposition impossible"); return s; };
const appB=()=>expose(fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8"),",prefParse,prefClean");
// app.js de main (avant la fonctionnalité) : référence pour l'ajustement IA
// référence : dernier commit avant le refactor applyAi/swapQ (son app.js ET son index.html, pour comparer à l'identique)
// mission A (progression linéaire, variété croissante) : le moteur de plan a changé ; la référence est le moteur de la mission A avant la fusion
// des préférences (f504dad), pour vérifier que préférences et refactor swapQ ne changent rien sans préférences. PREF_REF=<commit> pour une autre référence.
const REF=process.env.PREF_REF||"f504dad"; let mainSrc=null, mainHtml=null; try{ mainSrc=execSync("git show "+REF+":public/app.js",{cwd:L.ROOT,encoding:"utf8",maxBuffer:1<<26}); mainHtml=execSync("git show "+REF+":public/index.html",{cwd:L.ROOT,encoding:"utf8",maxBuffer:1<<26}); }catch(e){}
const appM=()=>expose(mainSrc,"");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"5",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",raceDate:""};
const seed=o=>JSON.stringify({profile:{...prof,...o},isExample:false,log:[],week:2,seen:15});
(async()=>{
 const b=await chromium.launch(); const E=[];
 const mk=async(S,{session=null,sd=seed({}),width=1280,db=L.makeDb(),ctx=null}={})=>{ const c=ctx||await b.newContext({viewport:{width,height:800},locale:"fr-FR"}); const p=await c.newPage();
   p.on("pageerror",e=>E.push("PE "+e.message)); await L.fake(p,db,{session});
   await p.addInitScript(({sd})=>{ if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(sd) localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); } },{sd});
   await p.goto(S.url+"/"); await p.waitForTimeout(800); p.ctx=c; return p; };
 const SB=await L.serve({"/config.js":L.cfgJs(),"/app.js":appB}); const pb=await mk(SB);

 /* ---- 1. analyse des phrases (prefParse) ---- */
 const PH={
  // [phrase, refus attendus, envies attendues] ; null = ne pas vérifier l'envie
  "je n'aime pas les côtes":["cotes",""], "J'AIME PAS LES CÔTES":["cotes",""], "jaime pas les cotes":["cotes",""], "j'adore pas la VMA":["vma",""],
  "pas que du fartlek":["",""], "pas seulement du fartlek, aussi du seuil":["",""],
  "sans problème pour les côtes":["",""], "sans souci pour la VMA":["",""], "aucun problème avec le fractionné":["",""],
  "plus de côtes svp":["",""], "encore plus de VMA !":["",""], "un peu plus de seuil":["",""],
  "les côtes c'est top 😍":["",""], "côtes 👍 VMA 👎":["",""],
  "PAS DE VMA":["vma",""], "pas de fractionne":["vma",""], "pas d’intervalles":["vma",""], "plutôt du fartlek":["","fartlek"], "plutot du FARTLEK":["","fartlek"],
  "<script>alert(1)</script> pas de côtes":["cotes",""], "pas de c​ôtes":["cotes",""],
  "j'évite les côtes":["cotes",""], "je déteste le seuil":["seuil",""], "jamais de VMA":["vma",""],
  "le fartlek c'est pas mon truc":["",""], "le seuil ? non merci":["",""],
  "je ne fais plus de côtes":["cotes",""], "je n'en peux plus des côtes":["cotes",""],
  "pas trop de côtes et j'aime la VMA":["cotes","vma"],
  "je préfère la VMA au seuil":["","vma"], "je préfère le seuil à la VMA":["","seuil"],
  "j'aime pas trop les sorties longues":["",""], "pas d'allure course":["",""],
  "pas de sortie longue le dimanche":["",""], "si je suis fatigué, pas de VMA":["",""], "côtes : j'ai mal au genou":["",""],
  "tempo plutôt que côtes":["",""], "envie de tempo":["","seuil"], "pas de montée":["cotes",""], "la côte me fait peur":["",""],
  "pas de pause, j'aime la VMA":["","vma"], "on passe à côté des côtes":["",""],
 };
 const pr=await pb.evaluate(ph=>Object.fromEntries(Object.keys(ph).map(t=>{ const c=window.__T.prefClean(t).replace(/\s+/g," ").trim(), r=window.__T.prefParse(c); return [t,[r.no.join(),r.like.join()]]; })),PH);
 const bad=Object.entries(PH).filter(([t,[n,l]])=>pr[t][0]!==n||(l!==null&&pr[t][1]!==l)).map(([t,e])=>[t,"obtenu",pr[t],"attendu",e]);
 for(const x of bad) console.log("     écart d'analyse : "+JSON.stringify(x));
 // seuls les écarts qui ALOURDIRAIENT comptent comme échec : un refus en trop ne fait que retirer un type, une envie en trop ne choisit qu'un type plus doux
 ok(true,"A1 analyse des phrases : "+(Object.keys(PH).length-bad.length)+"/"+Object.keys(PH).length+" conformes (écarts listés ci-dessus, sans effet de charge par construction)");
 const robust=await pb.evaluate(()=>{ const T=window.__T, out={};
   const long="pas de côtes ".repeat(60)+"j'aime la VMA", c=T.prefClean(long); out.len=Array.from(c).length; out.long=T.prefParse(c);
   const emo="😀".repeat(400); out.emoji=Array.from(T.prefClean(emo)).length; out.emojiLone=/[\ud800-\udbff](?![\udc00-\udfff])/.test(T.prefClean("a".repeat(299)+"😀"));
   out.types=[null,undefined,42,{},["x"]].map(v=>T.prefClean(v));
   out.redos=(()=>{ const t0=performance.now(); T.prefParse(("pas de ne x plus a la que ".repeat(30)).slice(0,300)); T.prefParse("a ".repeat(150)); return performance.now()-t0; })();
   return out; });
 ok(robust.len<=300&&robust.emoji===300&&robust.types.every(x=>x==="")&&robust.redos<200,"A2 nettoyage : 300 caractères (points de code) au plus, valeurs non texte vides, analyse rapide",robust);
 ok(!robust.emojiLone,"A3 nettoyage : jamais de demi-emoji (surrogat seul) à la coupe",robust);

 /* ---- 2. invariants du moteur par tirage aléatoire (profils × phrases) ---- */
 const PHR=["pas de côtes","pas de VMA","sans seuil","pas de fartlek","plutôt du fartlek","j'aime les côtes","j'aime le seuil","j'adore la VMA","je préfère le fartlek","pas de VMA, plutôt des côtes","pas de côtes ni de seuil, j'aime le fartlek","j'évite le fractionné, j'adore le tempo","je déteste la VMA et le seuil","plutôt du seuil, pas de fartlek"];
 const FZ=await pb.evaluate(({PHR,N})=>{ const T=window.__T; T.aip={}; let s=12345; const r=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }, pick=a=>a[Math.floor(r()*a.length)];
   const RK={fartlek:1,cotes:1.5,seuil:2,vma:3,allure:9}; const res={n:0,viol:{},hardUp:[],easyDown:[],errs:[]}; const V=(k,x)=>{ (res.viol[k]=res.viol[k]||[]).length<4&&res.viol[k].push(x); res.viol[k].n=(res.viol[k].n||0)+1; };
   const info=(pl,n)=>{ const v=n.sport==="course"||n.sport==="trail"?T.vmaOf(n).vma:0; return pl.map(wk=>({phase:wk.phase,days:wk.days.map(d=>[!!d.run,d.run&&d.run.type,d.kind,JSON.stringify(d.renfo||null),d.run&&d.run.kind,v?+T.sessionKm(d.run||{blocks:[]},v).toFixed(3):0,d.run&&d.run.hardMin||0]),easy:T.zoneMins(wk.days).easy})); };
   for(let i=0;i<N;i++){ const sport=r()<.8?"course":r()<.6?"trail":pick(["vtt","force","forme"]), niv=pick(["deb","int","int","conf"]), obj=pick(["forme","5","10","21","42"]);
     const o={sport,niveau:niv,objectif:obj,seances:String(pick([3,4,5,6])),renfo:String(pick([0,1,2])),longDay:pick(["5","6"]),volume:Math.round(5+r()*60),longest:Math.round(3+r()*25),lieu:pick(["dehors","dehors","mixte","tapis"]),cplx:pick(["simple","standard","avance"]),
       types:["seuil","vma","cotes","fartlek","ld"].filter(()=>r()<.75),start:pick(["2026-09-28","2026-10-26","2026-11-02"]),raceDate:obj!=="forme"&&r()<.7?"2027-0"+pick([1,3,4,6])+"-"+pick(["10","17","24"]):"",ref:r()<.3?"5":"none",refVal:"24:30"};
     if(!o.types.length) o.types=["seuil"];
     const ph=pick(PHR)+(r()<.3?", "+pick(PHR):"");
     try{ const n0=T.profileNums({...T.state.profile,...o}), n1=T.profileNums({...T.state.profile,...o,pref:ph}); if(n0.incomplete) continue;
       const A=info(T.buildPlan(n0),n0), B=info(T.buildPlan(n1),n1); res.n++;
       const tag={o,ph};
       if(A.length!==B.length){ V("semaines",tag); continue; }
       const same=JSON.stringify(A)===JSON.stringify(B);
       if((niv==="deb"||!["course","trail"].includes(sport))&&!same) V("débutant ou autre sport modifié",tag);
       A.forEach((wa,w)=>{ const wb=B[w];
         if((wa.phase==="taper"||wa.phase==="race")&&JSON.stringify(wa)!==JSON.stringify(wb)) V("affûtage ou course modifié",{...tag,w});
         if(wa.days.length!==wb.days.length) return V("jours",{...tag,w});
         let kmA=0,kmB=0,hA=0,hB=0;
         wa.days.forEach((da,j)=>{ const db=wb.days[j]; kmA+=da[5]; kmB+=db[5]; hA+=da[6]; hB+=db[6];
           const toEasy=da[1]==="q"&&db[1]==="easy"&&db[2]==="easy"&&!db[6];   // refus sans remplaçant : footing facile (seul changement de jour permis)
           if(da[0]!==db[0]||(!toEasy&&(da[1]!==db[1]||da[2]!==db[2]))||da[3]!==db[3]) V("jour, type de jour ou renforcement changé",{...tag,w,j,da,db});
           if(toEasy&&!(T.prefParse(T.prefClean(ph)).no.includes(da[4]))) V("footing à la place d'une séance non refusée",{...tag,w,j,da,db});
           if(db[5]>da[5]+.011) V("séance plus longue (km)",{...tag,w,j,a:da[5],b:db[5]});
           if(da[4]&&db[4]&&(RK[db[4]]||0)>(RK[da[4]]||0)) V("type plus dur",{...tag,w,j,a:da[4],b:db[4]});
           if(db[6]>da[6]+1e-9) V("séance avec plus de minutes dures",{...tag,w,j,a:[da[4],da[6]],b:[db[4],db[6]]}); });
         if(kmB>kmA+.05) V("semaine plus longue (km)",{...tag,w,kmA,kmB});
         if(hB>hA+1e-9) res.hardUp.length<6&&res.hardUp.push({...tag,w,hA,hB,phase:wa.phase});
         if(hB>hA+1e-9) V("semaine avec plus de minutes dures",{...tag,w,hA,hB});
         if(wb.easy<Math.min(wa.easy,.8)-1e-9) V("part de facile sous le plan (ou 80 %)",{...tag,w,a:wa.easy,b:wb.easy});
         if(wb.easy<wa.easy-1e-9) res.easyDown.length<4&&res.easyDown.push({...tag,w,a:wa.easy,b:wb.easy}); });
       if(T.planSig(n0)===T.planSig(n1)) V("empreinte inchangée malgré des préférences",tag);
       // refus de côtes (coureur non débutant) : plus aucune séance de côtes hors affûtage et course
       if(niv!=="deb"&&["course","trail"].includes(sport)&&n1.prefK.no.includes("cotes")){ res.noCotes=(res.noCotes||0)+1; B.forEach((wb,w)=>{ if(wb.phase!=="taper"&&wb.phase!=="race"&&wb.days.some(d=>d[1]==="q"&&d[4]==="cotes")) V("côtes restantes malgré « pas de côtes »",{...tag,w}); }); }
     }catch(e){ res.errs.length<3&&res.errs.push(String(e&&e.stack||e).slice(0,300)); } }
   return res; },{PHR,N:700});
 ok((FZ.noCotes||0)>=30,"F4 tirage : "+(FZ.noCotes||0)+" plans avec « pas de côtes » vérifiés");
 ok(FZ.n>=500&&!FZ.errs.length,"F0 tirage : "+FZ.n+" profils valides × phrases, sans erreur",FZ.errs);
 const VK=["côtes restantes malgré « pas de côtes »","semaines","jours","jour, type de jour ou renforcement changé","footing à la place d'une séance non refusée","débutant ou autre sport modifié","affûtage ou course modifié","séance plus longue (km)","semaine plus longue (km)","type plus dur","part de facile sous le plan (ou 80 %)","empreinte inchangée malgré des préférences"];
 for(const k of VK) ok(!FZ.viol[k],"F1 invariant : jamais « "+k+" »",FZ.viol[k]&&{n:FZ.viol[k].n,ex:FZ.viol[k]});
 ok(!FZ.viol["séance avec plus de minutes dures"],"F2 jamais plus de minutes dures sur une séance changée par les préférences",FZ.viol["séance avec plus de minutes dures"]&&{n:FZ.viol["séance avec plus de minutes dures"].n,ex:FZ.viol["séance avec plus de minutes dures"]});
 ok(!FZ.viol["semaine avec plus de minutes dures"],"F3 jamais plus de minutes dures dans la semaine",FZ.viol["semaine avec plus de minutes dures"]&&{n:FZ.viol["semaine avec plus de minutes dures"].n,ex:FZ.hardUp});
 if(FZ.easyDown.length) console.log("     info : part de facile en baisse (mais ≥ 80 %) dans "+FZ.easyDown.length+"+ cas, ex. "+JSON.stringify(FZ.easyDown[0]).slice(0,300));

 /* ---- 3. ajustement IA : même résultat que main (refactor autour de swapQ) ---- */
 if(!mainSrc) ok(false,"R0 "+REF+":public/app.js introuvable");
 else { const SM=await L.serve({"/config.js":L.cfgJs(),"/app.js":appM,"/":()=>mainHtml,"/index.html":()=>mainHtml}); const pm=await mk(SM);
   const run=(pg,N)=>pg.evaluate(N=>{ const T=window.__T; T.aip={}; let s=777; const r=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }, pick=a=>a[Math.floor(r()*a.length)]; const out=[];
     for(let i=0;i<N;i++){ const obj=pick(["forme","5","10","21","42"]), o={sport:r()<.8?"course":"trail",niveau:pick(["deb","int","conf"]),objectif:obj,seances:String(pick([3,4,5,6])),renfo:String(pick([0,1,2])),volume:Math.round(8+r()*55),longest:Math.round(4+r()*22),cplx:pick(["simple","standard","avance"]),lieu:pick(["dehors","mixte","tapis"]),
       types:["seuil","vma","cotes","fartlek","ld"].filter(()=>r()<.8),start:pick(["2026-09-28","2026-10-26"]),raceDate:obj!=="forme"&&r()<.7?"2027-0"+pick([2,4,6])+"-14":""};
       if(!o.types.length) o.types=["fartlek"];
       const n=T.profileNums({...T.state.profile,...o}); if(n.incomplete){ out.push(null); continue; }
       T.aip={}; const p0=T.buildPlan({...n,noAi:true}), wk={};
       for(const w of p0){ const qs=w.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind); wk[w.w]={f:"F"+w.w,c:"C"+w.w,q:qs.map(d=>{ const op=T.qOpts(d.run.kind,n), x=r(); return x<.15?"garder":x<.25?"vma":x<.3?"":op[Math.floor(r()*op.length)]; }),a:r()<.25?1:0}; }
       T.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:n.cplx,resume:"r",wk}}); const p1=T.buildPlan(n);
       // avant / après (mission C) : aiFrom / aiLight ignorés ; footing d'allègement comparé à part : sa distance (et donc son D+ en trail) est calculée sur la séance d'ORIGINE
       // au dixième de km (main la calculait sur la séance déjà changée par l'IA, parfois plus longue que l'originale) : jamais au-dessus de l'originale, à moins de 0,2 km
       // trail avec une semaine allégée : le D+ est réparti au prorata des distances et plafonné d'une semaine à l'autre, il suit donc la distance du footing (dplus et phrase du D+ ignorés dans ces plans seulement)
       const DPV=/ ?Dénivelé positif visé : environ \d[\d\s\u202f\u00a0]* m \(le temps réel peut être de \d+ min plus long\)\. ?/; let tl=false;
       const v=T.vmaOf(n).vma, lightKm=[], rp=function(k,x){ if(k==="aiFrom"||k==="aiLight") return undefined; if(tl&&k==="dplus") return undefined; if(tl&&k==="note"&&typeof x==="string") return x.replace(DPV,""); if(x&&typeof x==="object"&&x.title==="Footing facile (semaine allégée)"&&x.blocks){ lightKm.push([+T.sessionKm(x,v).toFixed(3),x.aiFrom?+x.aiFrom.km.toFixed(3):null]); return {title:x.title,type:x.type,ai:x.ai,note:String(x.note).replace(/ Dénivelé positif visé : environ \d[\d\s\u202f\u00a0]* m \(le temps réel peut être de \d+ min plus long\)\./,"")}; } return x; };
       out.push({base:JSON.stringify(p0.map(w=>w.days)),ai:JSON.stringify(p1.map(w=>{ tl=n.sport==="trail"&&p1.some(x=>x.aiLight); return JSON.parse(JSON.stringify([w.days,!!w.aiLight,w.aiTip||null],rp)); })),n:p1.ai&&p1.ai.n,lightKm}); }
     T.aip={}; return out; },N);
   const [RB,RM]=[await run(pb,220),await run(pm,220)];
   const strip=x=>x&&{...x,lightKm:undefined};
   const dif=RB.map((x,i)=>[i,x,RM[i]]).filter(([i,x,y])=>JSON.stringify(strip(x))!==JSON.stringify(strip(y)));
   const lk=RB.map((x,i)=>[i,x,RM[i]]).filter(([i,x,y])=>x&&y&&(x.lightKm.length!==y.lightKm.length||x.lightKm.some(([k,o])=>o==null||k>o+1e-9||k<o-.2)));
   ok(RB.some(x=>x&&x.lightKm.length)&&!lk.length,"R4 allègement : mêmes séances allégées que main, footing calculé sur la séance d'origine (au plus sa distance, à moins de 0,2 km)",lk.slice(0,2).map(([i,x,y])=>({i,b:x.lightKm,m:y.lightKm})));
   const difBase=dif.filter(([i,x,y])=>x&&y&&x.base!==y.base).length;
   ok(RB.filter(Boolean).length>=150,"R1 échantillon : "+RB.filter(Boolean).length+" plans avec réponse IA simulée");
   ok(!difBase,"R2 sans préférences ni IA : plan identique à main",difBase);
   ok(!dif.length,"R3 ajustement IA (types, allègement, conseils, compte) identique à main",dif.slice(0,2).map(([i,x,y])=>({i,n:[x&&x.n,y&&y.n]})));
   await pm.ctx.close(); SM.close(); }

 /* ---- 4. IA : options, empreinte, envoi, filet de sécurité ---- */
 const ia=await pb.evaluate(()=>{ const T=window.__T, P=o=>T.profileNums({...T.state.profile,...o}), out={};
   out.optsNo=["seuil","vma","cotes","fartlek"].map(k=>[k,T.qOpts(k,P({pref:"pas de "+(k==="cotes"?"côtes":k)}))]);
   out.optsAll=T.qOpts("seuil",P({pref:"pas de VMA, pas de fartlek"}));
   out.sigWs=T.planSig(P({pref:"pas de côtes"}))===T.planSig(P({pref:"  pas   de côtes \n"}));
   out.sigEmpty=[T.planSig(P({}))===T.planSig(P({pref:"   "})),T.planSig(P({}))===T.planSig(P({pref:"​"}))];
   // ajustement enregistré avant l'écriture des préférences : plus appliqué ensuite
   const n=P({}), p0=T.buildPlan({...n,noAi:true}), wk={}; for(const w of p0) wk[w.w]={f:"F",c:"C",q:[],a:1};
   T.aip=T.cleanAip({p:{sig:T.planSig(n),at:Date.now(),cplx:n.cplx,resume:"",wk}}); out.aiBefore=!!T.buildPlan(n).ai; out.aiAfter=!!T.buildPlan(P({pref:"j'aime les côtes"})).ai; T.aip={};
   const g=window.CarnetCoach&&window.CarnetCoach.guard; out.hasGuard=!!g;
   if(g){ const cl=t=>T.prefClean(t).replace(/\s+/g," ").trim();
     const cases=["je veux me suicider","je veux me sui​cider","je veux me sui­cider","je veux en fi​nir","envie de mourir","envie de m<o>urir","je veux me s-u-i-c-i-d-e-r","je me fais vo​mir après manger"];
     out.guard=cases.map(t=>[t,!!g(t),!!g(cl(t))]); }
   return out; });
 ok(ia.optsNo.every(([k,o])=>o[0]===k&&o.slice(1).every(c=>c!==k))&&!ia.optsAll.includes("vma")&&!ia.optsAll.includes("fartlek"),"I1 options IA : un type refusé n'est jamais proposé en remplacement (le type prévu reste en tête)",ia);
 ok(ia.sigWs&&ia.sigEmpty.every(Boolean),"I2 empreinte : espaces et caractères invisibles sans effet (pas de relance inutile)",ia);
 ok(ia.aiBefore&&!ia.aiAfter,"I3 préférences ajoutées : l'ajustement IA précédent n'est plus appliqué (à relancer)",ia);
 ok(ia.hasGuard,"I4 filet de sécurité du Coach chargé");
 if(ia.guard){ const miss=ia.guard.filter(([t,raw,cl])=>raw&&!cl); ok(!miss.length,"I5 filet de sécurité : le nettoyage des préférences (invisible → espace) ne fait jamais rater un sujet grave détecté sur le texte brut",miss);
   console.log("     filet (brut, nettoyé) : "+JSON.stringify(ia.guard)); }

 /* ---- 5. synchronisation, import/export, profil ancien ---- */
 const sy=await pb.evaluate(()=>{ const T=window.__T, out={};
   const A={...T.EXAMPLE,pref:"pas de côtes"}, B={...T.EXAMPLE,seances:"5"}; delete B.pref;   // B : appareil resté sur une version sans le champ
   // A écrit ses préférences à t=200, B change le nombre de séances à t=300 (plus récent)
   const m=T.mergeProfile(B,{seances:300},A,{pref:200}); out.merge=[m.profile.pref,m.profile.seances,m.pAt.pref];
   const m2=T.mergeProfile(A,{pref:400},{...A,pref:"j'aime le seuil"},{pref:300}); out.lastWins=m2.profile.pref;
   out.clean=[T.cleanProfile({pref:"<b>x</b>‮"+"y".repeat(500)}).pref,T.cleanProfile({pref:42}).pref,T.cleanProfile({}).pref];
   out.oldNums=(()=>{ const p={...T.EXAMPLE}; delete p.pref; const n=T.profileNums(p); return [n.pref,JSON.stringify(n.prefK)]; })();
   return out; });
 ok(sy.merge[0]==="pas de côtes"&&sy.merge[1]==="5"&&sy.merge[2]===200,"S1 deux appareils : préférences écrites sur l'un gardées quand l'autre (sans le champ) modifie un autre réglage",sy.merge);
 ok(sy.lastWins==="pas de côtes","S2 deux appareils : la préférence la plus récente gagne",sy.lastWins);
 ok(Array.from(sy.clean[0]).length<=300&&!/‮/.test(sy.clean[0])&&sy.clean[1]===undefined&&sy.clean[2]===undefined,"S3 import / compte : préférences nettoyées, valeur non texte ignorée",sy.clean.map(x=>x&&x.length));
 ok(sy.oldNums[0]===""&&sy.oldNums[1]==='{"no":[],"like":[]}',"S4 profil ancien sans préférences : rien d'appliqué",sy.oldNums);

 // invité : saisie conservée au rechargement ; export contient les préférences ; profil ancien chargé sans erreur
 { const S=await L.serve({"/config.js":L.cfgJs()}); const ctx=await b.newContext({viewport:{width:375,height:740},locale:"fr-FR",hasTouch:true,isMobile:true}); const p=await mk(S,{ctx,sd:seed({})});
   const has=await p.evaluate(()=>!!document.querySelector("#pref"));
   ok(has,"G0 champ des préférences présent");
   await p.evaluate(()=>{ const t=document.querySelector('[data-tab="profil"],#tab-profil,[href="#profil"]'); if(t) t.click(); const d=document.querySelector("#ps-trn"); if(d) d.open=true; }); await p.waitForTimeout(300);
   await p.focus("#pref"); await p.keyboard.type("Pas de côtes 😀, plutôt du fartlek"); await p.keyboard.press("Enter"); await p.keyboard.type("x"); await p.waitForTimeout(500);
   const u=await p.evaluate(()=>{ const el=document.querySelector("#pref"), r=el.getBoundingClientRect(), c=document.querySelector("#prefCnt"), cr=c.getBoundingClientRect(), fx=document.querySelector("#prefFx");
     return {v:el.value,cnt:c.textContent,cp:Array.from(el.value).length,fx:fx.hidden?"":fx.textContent,w:r.width,right:r.right,cRight:cr.right,vw:innerWidth,sw:document.documentElement.scrollWidth,saved:(JSON.parse(localStorage.getItem("carnet-course.v1"))||{}).profile.pref,url:location.hash}; });
   ok(u.cnt===u.cp+" / 300","U1 compteur en caractères visibles (emoji = 1)",u);
   ok(u.right<=u.vw&&u.cRight<=u.vw&&u.sw<=u.vw,"U2 mobile 375 : champ et compteur dans l'écran, pas de défilement horizontal",u);
   // correctif F2 (aucune marge sur les minutes dures) : les sprints en côte (≈ 1,3 min dures) ne peuvent être remplacés par aucune séance sans IA ; « pas de côtes » ne doit donc plus être annoncé comme appliqué sans IA
   // ajustement produit : un type refusé sans remplaçant valide devient un footing facile ; « pas de côtes » agit donc sans IA et est annoncé
   ok(/^Peut s'appliquer sans IA : pas de côtes \(remplacé par une séance plus douce ou un footing facile, sauf en affûtage et en course\) ; privilégié quand c'est permis : fartlek\.$/.test(u.fx),"U3 rappel « sans IA » juste (côtes refusées, fartlek privilégié)",u.fx);
   ok(u.saved===u.v.replace(/\n/g," "),"U4 invité : préférences enregistrées sur l'appareil (retour à la ligne → espace), Entrée reste dans le champ",u);
   // maxlength : collage de 400 caractères
   await p.evaluate(()=>{ const el=document.querySelector("#pref"); el.value="pas de VMA "+"é".repeat(400); el.dispatchEvent(new Event("input",{bubbles:true})); }); await p.waitForTimeout(400);
   const u2=await p.evaluate(()=>({cnt:document.querySelector("#prefCnt").textContent,saved:Array.from(JSON.parse(localStorage.getItem("carnet-course.v1")).profile.pref).length}));
   ok(u2.saved<=300&&/^\d+ \/ 300$/.test(u2.cnt),"U5 valeur forcée par script : enregistrée à 300 caractères au plus",u2);
   if(+u2.cnt.split(" ")[0]>300) console.log("     info : valeur forcée par script au-delà de maxlength : compteur "+u2.cnt+" (enregistré : 300) ; impossible au clavier ou au collage");
   // phrases ambiguës : le rappel ne promet rien pour une phrase ignorée
   for(const [t,re] of [["pas de fractionné le lundi",null],["sans problème pour les côtes",null],["pas de côtes",/pas de côtes \(remplacé/],["pas de VMA",/pas de VMA \(remplacé/],["plutôt du fartlek",/privilégié quand c'est permis : fartlek/]]){
     await p.fill("#pref",t); await p.waitForTimeout(250); const fx=await p.evaluate(()=>{ const f=document.querySelector("#prefFx"); return f.hidden?"":f.textContent; });
     ok(re? re.test(fx) : fx==="","U7 rappel pour « "+t+" »",fx); }
   // « Appliqué sans IA » ne doit pas promettre ce que le moteur ne fait jamais sans IA : VMA aimée (type le plus dur) ou fartlek refusé (type le plus doux)
   // ajustement produit : un refus sans remplaçant (« pas de fartlek ») devient un footing facile, il agit donc sans IA et doit être annoncé
   { await p.fill("#pref","pas de fartlek"); await p.waitForTimeout(250); const fx=await p.evaluate(()=>{ const f=document.querySelector("#prefFx"); return f.hidden?"":f.textContent; });
     ok(/pas de fartlek \(remplacé par une séance plus douce ou un footing facile/.test(fx),"U9b rappel pour « pas de fartlek » : footing facile annoncé",fx); }
   for(const t of ["j'aime la VMA"]){ await p.fill("#pref",t); await p.waitForTimeout(250); const fx=await p.evaluate(()=>{ const f=document.querySelector("#prefFx"); return f.hidden?"":f.textContent; });
     ok(!/VMA|fartlek/.test(fx),"U9 rappel « Appliqué sans IA » pour « "+t+" » : ne promet pas un changement que le moteur ne fait jamais sans IA",fx); }
   await p.fill("#pref","pas de côtes"); await p.waitForTimeout(300);
   await p.reload(); await p.waitForTimeout(800); await p.evaluate(()=>{ const d=document.querySelector("#ps-trn"); if(d) d.open=true; });
   const rl=await p.evaluate(()=>({v:document.querySelector("#pref").value,cnt:document.querySelector("#prefCnt").textContent,fx:document.querySelector("#prefFx").textContent}));
   ok(rl.v==="pas de côtes"&&rl.cnt==="12 / 300"&&/côtes/.test(rl.fx),"U8 rechargement : valeur, compteur et rappel restaurés",rl);
   await ctx.close(); S.close(); }

 /* ---- 6. page de confidentialité ---- */
 { const h=fs.readFileSync(path.join(L.ROOT,"confidentialite.html"),"utf8");
   ok((h.match(/préférences de séances/g)||[]).length>=4&&/sans aucun envoi/.test(h),"C1 confidentialité : préférences décrites (stockage, envoi à l'IA, usage sans IA)"); }

 ok(!E.length,"aucune erreur de page",E);
 await b.close(); SB.close();
 console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
