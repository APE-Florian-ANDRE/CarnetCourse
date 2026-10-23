// Tests adversariaux de la progression des plans (mission A : progression linéaire + variété croissante des séances d'intensité).
// Fuzz sur des profils aléatoires (graine fixe) : garde-fous de sécurité, linéarité, variété, robustesse, IA (qOpts / applyAi), temps de calcul.
// Usage : node tests/progression.js [--n=1200] [--seed=7] [--detail] ; APP=<chemin d'un autre app.js> pour exécuter une autre version (ex. main) ;
// MAIN=<chemin de l'app.js de main> (ou MAIN=git : public/app.js de la branche main) : seuls les cas absents de main font échouer
// (les autres sont préexistants, comptés à part) ; ajoute la comparaison profil par profil (pic, sortie longue, séances, intensité).
// Options : --case=i,j (détail semaine par semaine, branche et main), --dump=i (profil n° i), --all=<catégorie> (tous les cas).
// Les dates des profils sont relatives au jour du test (la date de course doit être à venir) : les numéros de profils changent d'un jour à l'autre.
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const arg=(k,d)=>{ const a=process.argv.find(x=>x.startsWith("--"+k+"=")); return a? a.slice(k.length+3) : d; };
const NP=+arg("n",1200), SEED=+arg("seed",7), DETAIL=process.argv.includes("--detail");
const SRC=process.env.APP||path.join(L.ROOT,"app.js");
// référence : MAIN=<chemin d'un app.js>, MAIN=git (public/app.js de la branche main), MAIN=ref:<commit> ; par défaut ref:a45501c (avant la mission A) ; MAIN=none : sans comparaison
let MAIN=process.env.MAIN||"ref:a45501c", MAIN_HTML=null; if(MAIN==="none") MAIN="";
if(MAIN==="git"||MAIN.startsWith("ref:")){ const os=require("os"), rev=MAIN==="git"?"main":MAIN.slice(4); if(!/^[\w.\/-]{1,80}$/.test(rev)) throw new Error("référence invalide : "+rev);
  const show=f=>require("child_process").execFileSync("git",["show",rev+":public/"+f],{cwd:__dirname,maxBuffer:64<<20});
  MAIN=path.join(os.tmpdir(),"pacebook-ref-"+rev.replace(/\W/g,"_")+"-app.js"); fs.writeFileSync(MAIN,show("app.js"));
  // page de la même version (un app.js ancien sur la page actuelle peut ne pas démarrer)
  MAIN_HTML=show("index.html").toString(); }
const inject=src=>fs.readFileSync(src,"utf8").replace(/initAccount\(\);\n\}\)\(\);\s*$/,"initAccount();\nwindow.__T={buildPlan,profileNums,sessionKm,vmaOf,planSig,zoneMins,qOpts,qPool:typeof qPool===\"function\"?qPool:null,setAip(v){state.aip=v;}};\n})();\n");
function rnd(seed){ let x=seed>>>0; return ()=>{ x=(x*1664525+1013904223)>>>0; return x/4294967296; }; }
const iso=d=>d.toISOString().slice(0,10), addD=(s,n)=>{ const d=new Date(s+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const TODAY=iso(new Date(Date.now()+864e5*0)), monday=s=>{ const d=new Date(s+"T12:00:00Z"); return addD(s,-((d.getUTCDay()+6)%7)); };
function profiles(n,seed){ const r=rnd(seed), pick=a=>a[Math.floor(r()*a.length)], out=[];
  const ALLT=["seuil","vma","cotes","fartlek","ld"];
  for(let i=0;i<n;i++){
    const sport= r()<.62?"course": r()<.5?"trail": pick(["vtt","force","forme"]);
    const objectif=pick(["forme","5","10","21","42","5","10","21","42"]), niveau=pick(["deb","int","conf"]), cplx=pick(["simple","standard","avance"]);
    const N=4+Math.floor(r()*27), start=addD(TODAY,Math.floor(r()*21));   // début en milieu de semaine possible
    const raceDate=addD(monday(start),7*(N-1)+Math.floor(r()*7));
    let types; const t=r(); if(t<.08) types=[]; else if(t<.14) types=["ld"]; else if(t<.30) types=[pick(["seuil","vma","cotes","fartlek"])]; else if(t<.4) types=[...ALLT]; else types=ALLT.filter(()=>r()<.55);
    const ref=pick(["none","none","vma","5","10"]), refVal= ref==="vma"? pick(["14","9","22","abc","30"]) : ref==="5"? pick(["25:00","19'30","40:00",""]) : ref==="10"? pick(["50:00","38:00","1h05",""]) : "";
    out.push({sexe:pick(["H","F"]),age:pick([15,16,17,25,32,45,60,72]),taille:pick([160,170,178,190]),poids:pick([50,65,82,110]),cible:"",mg:"",activite:"1.25",
      niveau,objectif,volume:pick([0,0,5,10,15,25,40,60,90,150,200,""]),longest:pick([0,0,3,6,10,18,25,40,60]),ref,refVal,fcmax:"",
      seances:String(pick([2,3,4,5,6,7])),renfo:pick(["0","1","2"]),longDay:pick(["5","6"]),start,raceDate,deficit:300,bonus:100,adj:0,
      lieu:pick(["dehors","tapis","mixte"]),equip:pick(["salle","maison","aucun"]),types,cross:r()<.1?pick(["velo","natation"]):"non",sport,
      sObj:sport==="vtt"?pick(["court","moyen","long"]):sport==="force"?pick(["ppl","oly"]):"",hSem:sport==="vtt"||sport==="forme"?pick(["3","6",""]):"",cplx});
  }
  // profils types fixes (non-régression) : ajoutés en tête
  const T=(o)=>({...out[0],sport:"course",types:[...ALLT],volume:25,longest:10,seances:"4",cross:"non",ref:"none",refVal:"",start:monday(addD(TODAY,7)),...o});
  const fixed=[]; for(const niveau of ["deb","int","conf"]) for(const objectif of ["5","10","21","42","forme"]) for(const N of [6,12,16,20]) for(const cplx of ["simple","standard","avance"])
    fixed.push(T({niveau,objectif,cplx,raceDate:addD(monday(addD(TODAY,7)),7*(N-1)+6),volume:{deb:10,int:25,conf:45}[niveau],longest:{deb:4,int:10,conf:18}[niveau],seances:{deb:"3",int:"4",conf:"5"}[niveau]}));
  return [...fixed,...out];
}
// exécuté dans la page : construit chaque plan et en extrait un résumé
function collect(arr){ const T=window.__T; const res=[];
  const sum=(pl,n,v)=>pl.map(wk=>{ const runs=wk.days.filter(d=>d.run&&d.kind!=="before"); let nan=false;
    for(const d of wk.days) if(d.run){ if(!Array.isArray(d.run.blocks)) nan=true; else for(const b of d.run.blocks) if(b.min!=null&&!Number.isFinite(b.min)) nan=true; if(d.run.blocks&&!Number.isFinite(T.sessionKm(d.run,v||10))) nan=true; if(/undefined|NaN/.test(d.run.title||"")) nan=true; }
    const lr=wk.days.find(d=>d.run&&d.run.type==="long"), q=wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind&&d.kind!=="before");
    return {w:wk.w,V:wk.V,ph:wk.phase,dl:!!wk.deload,km: v? wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"&&d.run.blocks?T.sessionKm(d.run,v):0),0) : 0,
      runs:runs.length,L: lr&&v? T.sessionKm(lr.run,v) : 0, mx: v? Math.max(0,...wk.days.filter(d=>d.run&&d.run.type!=="race"&&d.run.blocks).map(d=>T.sessionKm(d.run,v))) : 0,
      q:q.map(d=>d.run.kind), ai:q.filter(d=>d.run.ai).map(d=>d.run.kind), hard:wk.days.reduce((a,d)=>a+(d.run&&d.run.type==="q"?d.run.hardMin||0:0),0),
      pool:wk.qPool||null, race:wk.days.some(d=>d.kind==="race"), first:(()=>{ const d=runs[0]; return d? d.run.type : null; })(), firstEasy:!!wk.firstEasy, nan,
      cross:wk.cross!=null, lim:!!wk.limited, opts:q.map(d=>T.qOpts(d.run.kind,n,wk.qPool)), easy:T.zoneMins(wk.days).easy}; });
  for(const pr of arr){ const o={};
    try{ const n=T.profileNums(pr), run=n.sport==="course"||n.sport==="trail", v=run? T.vmaOf(n).vma : 0;
      const t0=performance.now(); const pl=T.buildPlan({...n,noAi:true}); o.ms=performance.now()-t0;
      o.n={sport:n.sport,niveau:n.niveau,objectif:n.objectif,cplx:n.cplx,seances:n.seances,types:n.types,minor:n.minor,cross:n.cross,startIdx:n.startIdx,longest:n.longest,volume:n.volume,nWeeks:n.nWeeks,raceIdx:n.raceIdx};
      o.unreal=pl.unreal?pl.unreal.used:null; o.sig=T.planSig(n); o.wk=sum(pl,n,v);
      if(run&&n.cplx==="simple"){ const st=T.buildPlan({...n,cplx:"standard",noAi:true}); o.std={unreal:st.unreal?st.unreal.used:null,wk:sum(st,{...n,cplx:"standard"},v)}; }
      // IA hostile : demande la VMA (puis le seuil) partout, et d'alléger une semaine sur trois
      if(run&&n.niveau!=="deb"){ const wk={}; pl.forEach(w=>{ wk[w.w]={q:w.w%2?["vma","vma"]:["seuil","vma"],a:w.w%3===0,f:"Focus",c:"Conseil"}; });
        T.setAip({p:{sig:T.planSig(n),at:1,cplx:n.cplx,wk}}); const pa=T.buildPlan(n); T.setAip({}); o.ai={n:pa.ai?pa.ai.n:0,wk:sum(pa,n,v)}; }
    }catch(e){ o.err=String(e&&e.stack||e).slice(0,400); }
    res.push(o); }
  return res; }
async function runApp(src,profs,html){
  const S=await L.serve({"/config.js":L.cfgJs(),"/app.js":()=>inject(src),...(html?{"/index.html":()=>html}:{})}); const b=await chromium.launch(); const ctx=await b.newContext({locale:"fr-FR"}); const p=await ctx.newPage(); const errs=[];
  p.on("pageerror",e=>errs.push(e.message));
  await p.addInitScript(sd=>{ localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); },JSON.stringify({profile:{...profs[0]},isExample:false,log:[],week:1,seen:15}));
  await p.goto(S.url+"/"); await p.waitForFunction(()=>window.__T,null,{timeout:15000});
  const out=[]; for(let i=0;i<profs.length;i+=100) out.push(...await p.evaluate(collect,profs.slice(i,i+100)));
  await b.close(); S.close(); return {out,errs}; }

const isNorm=w=>!w.dl&&w.ph!=="taper"&&w.ph!=="race"&&w.ph!=="prep";
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0, pct=x=>(x*100).toFixed(0)+" %";
const lin=Rs=>Rs.map((r,i)=>({r,i,s:!r.err&&(r.n.sport==="course"||r.n.sport==="trail")&&r.n.niveau!=="deb"&&r.n.cross==="non"&&r.wk.length<=20? linStats(r) : null})).filter(x=>x.s);
function linStats(r){ const nw=r.wk.filter(w=>isNorm(w)&&w.w>1&&!w.cross); if(nw.length<4) return null;
  const pk=Math.max(...nw.map(w=>w.km)), ip=nw.findIndex(w=>w.km>=pk-1e-9), x0=nw[0].w, y0=nw[0].km, xp=nw[ip].w;
  let dev=0; for(const w of nw.slice(0,ip+1)){ const y= xp===x0? y0 : y0+(pk-y0)*(w.w-x0)/(xp-x0); dev=Math.max(dev,Math.abs(w.km-y)/Math.max(1,pk)); }
  // plateau précoce : semaines normales consécutives à moins de 1 % d'écart avant les 2 dernières, alors que le pic n'est pas atteint
  let plateau=0; for(let i=1;i<nw.length-2;i++) if(Math.abs(nw[i].km-nw[i-1].km)<.01*nw[i-1].km&&nw[i].km<pk*.97) plateau++;
  let drops=0; for(let i=1;i<=ip;i++) if(nw[i].km<nw[i-1].km-.5) drops++;
  return {dev,plateau,drops,peakLate: nw[nw.length-1].km>=pk*.97, peakPos:(ip+1)/nw.length, ratio:pk/Math.max(1,y0)}; }

(async()=>{
  const profs=profiles(NP,SEED); const t0=Date.now();
  if(arg("dump","")){ console.log(JSON.stringify(profs[+arg("dump")])); process.exit(0); }   // profil n° i (dates relatives au jour du test)
  const A=await runApp(SRC,profs); const R=A.out; console.log("plans construits : "+R.length+" en "+((Date.now()-t0)/1000).toFixed(1)+" s");
  const CASES=arg("case","").split(",").filter(Boolean).map(Number);
  if(CASES.length){ const MM=MAIN? (await runApp(MAIN,profs,MAIN_HTML)).out : null;
    for(const i of CASES) for(const [nm,X] of [["branche",R],["main",MM]]){ if(!X) continue; const r=X[i]; console.log("#"+i+" "+nm+" "+JSON.stringify(r.n)+(r.unreal?" → "+r.unreal:"")+" "+JSON.stringify({start:profs[i].start,raceDate:profs[i].raceDate}));
      (r.wk||[]).forEach((w,j)=>console.log("  S"+w.w+" "+w.ph+(w.dl?" allégée":"")+" V "+(+w.V||0).toFixed(1)+" km "+w.km.toFixed(1)+(r.std?" (std "+(r.std.wk[j]?r.std.wk[j].km.toFixed(1):"-")+")":"")+" runs "+w.runs+" L "+w.L.toFixed(1)+" q "+w.q.join(",")+" hard "+w.hard+(w.pool?" pool "+w.pool.join(","):""))); }
    process.exit(0); }
  let fails=0; const ok=(c,m)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m); };
  const F=checkAll(R,profs);
  let M=null, FM=null; if(MAIN){ M=await runApp(MAIN,profs,MAIN_HTML); FM=checkAll(M.out,profs); }
  // un cas est « nouveau » s'il n'existe pas sur main pour le même profil et la même semaine (préexistant sinon)
  const key=x=>x.i+":"+x.msg.split(" ")[0], isNew=(c,x)=>!FM||!(FM[c]||[]).some(y=>key(y)===key(x));
  // exemptions ciblées (arbitrage de la mission A) : un cas nouveau n'échoue pas si sa situation est l'une de celles-ci, chacune avec sa raison.
  // Jamais de liste de profils ni de seuil global relâché : la condition est vérifiée sur le plan lui-même (et sur la référence).
  const wkOf=(r,msg)=>{ const m=/^S(\d+)/.exec(msg); return m? r.wk.findIndex(w=>w.w===+m[1]) : -1; };
  const normW=r=>r.wk.filter(w=>isNorm(w)&&w.w>1&&!w.cross);
  const EXEMPT={
    // le simple a une seule séance d'intensité : à 3 sorties ou moins, le standard en a une de moins (sa 2e séance d'intensité prend la place
    // d'un footing) ; le simple ne peut descendre à son volume qu'en supprimant une sortie
    simpleKm:(x,r)=>{ const j=wkOf(r,x.msg), w=r.wk[j], s=r.std&&r.std.wk[j]; return w&&s&&w.runs<=3&&s.runs<w.runs? "3 sorties ou moins, le standard a une sortie de moins" : null; },
    // le pic de la référence passe par une hausse de plus de 8 % : la règle des +8 %, contrôlée sur le volume placé, l'interdit
    picBaisse:(x,r,m)=>{ const n=normW(m); for(let i=1;i<n.length;i++){ const y=n[i-1].km, lim=Math.max(y*1.08,y+(n[i-1].runs<Math.min(r.n.seances,3)?3.2:1)); if(n[i].km>lim+.3) return "pic de la référence obtenu par une hausse de plus de 8 %"; } return null; },
    // la référence n'avait aucune séance d'intensité en développement (types cochés remplacés par rien) : ici les types cochés y sont, une séance d'intensité prend une sortie
    seancesBaisse:(x,r,m)=>{ const d=m.wk.filter(w=>w.ph==="dev"); return d.length&&d.every(w=>!w.q.length)? "référence sans intensité en développement" : null; },
    // sortie longue de 4 km au plus : aucune séance des types qui arrivent en premier (fartlek, côtes, seuil) n'y tient (remplacée par un footing) ;
    // la référence ne plaçait que de la VMA (la séance la plus courte), qui arrive en dernier dans la progression
    plusIntensite:(x,r,m)=>Math.max(0,...r.wk.map(w=>w.L))<=4.05&&m.wk.every(w=>w.q.every(k=>k==="vma"||k==="allure"))? "sortie longue de 4 km au plus : seule la VMA y tenait dans la référence" : null,
    // plan plafonné (footings au maximum, ou volume placé sous le volume prévu) : le volume oscille de 1 km au plus selon la séance d'intensité de la semaine
    baisse:(x,r)=>{ const n=normW(r), capd=w=>w.lim||(+w.V||0)>w.km+.5; let okAll=true, any=false; for(let i=1;i<n.length;i++) if(n[i].km<n[i-1].km-.5){ any=true; if(!(n[i-1].km-n[i].km<=1.05&&(capd(n[i])||capd(n[i-1])))) okAll=false; }
      return any&&okAll? "plan plafonné, oscillation de 1 km au plus" : null; }
  };
  const exempt=(c,x)=>EXEMPT[c]&&M? EXEMPT[c](x,R[x.i],M.out[x.i]) : null, nEx={};
  // temps de calcul (deux passes) : desktop ; un mobile milieu de gamme est 4 à 6 fois plus lent
  const msq=X=>{ const ms=X.filter(r=>r.ms!=null).map(r=>r.ms).sort((a,b)=>a-b); return f=>ms[Math.min(ms.length-1,Math.floor(ms.length*f))]; }, q=msq(R);
  console.log("buildPlan : médiane "+q(.5).toFixed(1)+" ms, p95 "+q(.95).toFixed(1)+" ms, max "+q(1).toFixed(1)+" ms"+(M?" (main : médiane "+msq(M.out)(.5).toFixed(1)+", max "+msq(M.out)(1).toFixed(1)+")":""));
  const show=(name,X)=>console.log("   "+name+" : "+X.length+" plans ; écart à la droite moy. "+pct(avg(X.map(x=>x.s.dev)))+", > 15 % : "+X.filter(x=>x.s.dev>.15).length+" ; plateaux précoces "+X.filter(x=>x.s.plateau).length+" ; baisses non allégées avant le pic "+X.filter(x=>x.s.drops).length+" ; pic en fin de plan "+X.filter(x=>x.s.peakLate).length+" ; position du pic moy. "+pct(avg(X.map(x=>x.s.peakPos))));
  console.log("linéarité (hors débutant, ≤ 20 semaines) :"); show("cette version",lin(R)); if(M) show("main",lin(M.out));
  // comparaison avec main, profil par profil (course et trail, hors cardio sans impact) : pic de volume, sortie longue la plus longue, séances placées, intensité
  if(M){ const pk=r=>Math.max(0,...r.wk.filter(w=>isNorm(w)&&w.w>1).map(w=>w.km)), tl=r=>Math.max(0,...r.wk.filter(w=>w.ph!=="race").map(w=>w.L)), nr=r=>avg(r.wk.filter(w=>isNorm(w)&&w.w>1).map(w=>w.runs)), nq=r=>avg(r.wk.filter(w=>isNorm(w)&&w.w>1).map(w=>w.q.length));
    const hardW=r=>r.wk.filter(w=>isNorm(w)&&w.w>1&&w.q.length>=2&&w.runs<=3).length, ez=r=>Math.min(1,...r.wk.filter(w=>isNorm(w)&&w.w>1).map(w=>w.easy));
    const C=R.map((r,i)=>({r,m:M.out[i],i})).filter(x=>!x.r.err&&!x.m.err&&(x.r.n.sport==="course"||x.r.n.sport==="trail")&&x.r.n.cross==="non"&&x.r.unreal===x.m.unreal&&x.r.n.niveau!=="deb");
    console.log("comparaison avec main ("+C.length+" plans hors débutant) : séances par semaine normale "+avg(C.map(x=>nr(x.r))).toFixed(2)+" (main "+avg(C.map(x=>nr(x.m))).toFixed(2)+"), séances d'intensité "+avg(C.map(x=>nq(x.r))).toFixed(2)+" (main "+avg(C.map(x=>nq(x.m))).toFixed(2)+"), semaines à 2 séances d'intensité sur 3 sorties ou moins "+C.reduce((a,x)=>a+hardW(x.r),0)+" (main "+C.reduce((a,x)=>a+hardW(x.m),0)+"), part de facile mini moy. "+pct(avg(C.map(x=>ez(x.r))))+" (main "+pct(avg(C.map(x=>ez(x.m))))+")");
    C.forEach(x=>{ const a=pk(x.r), b=pk(x.m); if(b>0&&a<b*.85) (F.picBaisse=F.picBaisse||[]).push({i:x.i,msg:"pic "+a.toFixed(1)+" < 85 % de main "+b.toFixed(1)});
      const la=tl(x.r), lb=tl(x.m); if(lb>0&&la<lb*.9-.05) (F.longBaisse=F.longBaisse||[]).push({i:x.i,msg:"sortie longue max "+la.toFixed(1)+" < 90 % de main "+lb.toFixed(1)});
      const tq=r=>r.wk.reduce((a,w)=>a+w.q.filter(k=>k!=="allure").length,0); if(tq(x.r)===0&&tq(x.m)>0) (F.plusIntensite=F.plusIntensite||[]).push({i:x.i,msg:"aucune séance d'intensité (main : "+tq(x.m)+") ; cochés "+x.r.n.types.join(",")});
      if(nr(x.r)<nr(x.m)-.5) (F.seancesBaisse=F.seancesBaisse||[]).push({i:x.i,msg:"séances/semaine "+nr(x.r).toFixed(2)+" < main "+nr(x.m).toFixed(2)+" (demandées "+x.r.n.seances+")"}); });
  }
  // ajustement IA enregistré avant la mise à jour : planSig ne dépend que du profil ; même signature = ajustement toujours appliqué au nouveau plan
  if(M){ const same=R.filter((r,i)=>r.sig&&r.sig===M.out[i].sig).length; console.log("INFO planSig identique à main pour "+same+"/"+R.filter(r=>r.sig).length+" profils : un ajustement IA enregistré avant la mise à jour reste appliqué (choix revalidés par qOpts, textes focus/conseil écrits pour l'ancien plan)"); }
  // rapport : avec MAIN, seuls les cas absents de main font échouer (les autres sont préexistants, comptés à part)
  const CRIT=["exception","nan","course","firstWeek","debQ","nonCoche","simpleVma","simpleKm","simpleHard","plus8","long10","deload","taper","poolShrink","ordre","horsPool","formeVma","qOpts","aiTropTot","aiSimpleVma","aiNonCoche","aiKm","aiHard","baisse","picBaisse","longBaisse","seancesBaisse","plusIntensite","aiPrepVma"];
  for(const c of [...CRIT,...Object.keys(F).filter(k=>!CRIT.includes(k))]){ const all=F[c]||[], L_=all.filter(x=>isNew(c,x)&&!(exempt(c,x)&&(nEx[c]=(nEx[c]||0)+1))); const info=["info","nonCocheDeb","ecartDroite","picTot"].includes(c);
    const pre=all.length-L_.length-(nEx[c]||0), tail=(FM?" ; préexistants (aussi sur la référence) : "+pre+(nEx[c]?" ; exemptés (situation documentée) : "+nEx[c]:"")+" ; référence : "+(FM[c]||[]).length:"");
    if(info){ if(all.length) console.log("INFO "+c+" : "+L_.length+" nouveaux"+tail); }
    else ok(!L_.length,c+(L_.length?" : "+L_.length+" cas nouveaux":"")+tail);
    if(L_.length&&(DETAIL||!info)) L_.slice(0,arg("all","")===c?1e9:DETAIL?12:3).forEach(x=>console.log("      #"+x.i+" "+x.msg+" | "+JSON.stringify(R[x.i].n||{})+(DETAIL?" "+JSON.stringify({start:profs[x.i].start,raceDate:profs[x.i].raceDate}):""))); }
  ok(!A.errs.length,"aucune erreur de page"+(A.errs.length?" : "+A.errs.slice(0,2).join(" | "):""));
  ok(q(.95)<60,"buildPlan p95 < 60 ms sur ordinateur (≈ 300 ms sur mobile)");
  console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
function checkAll(R,profs){ const F={}; const bad=(cat,i,msg)=>{ (F[cat]=F[cat]||[]).push({i,msg}); };
  R.forEach((r,i)=>{ const P=profs[i];
    if(r.err){ bad("exception",i,r.err); return; }
    if(r.wk.some(w=>w.nan)) bad("nan",i,"NaN / undefined dans une séance");
    const run=r.n.sport==="course"||r.n.sport==="trail"; if(!run) return;
    const o=r.unreal||r.n.objectif, isRace=o!=="forme", deb=r.n.niveau==="deb", W=r.wk;
    if(!r.n.nWeeks&&isRace) bad("info",i,"pas de date de course");
    // course : dernière semaine avec la course
    if(isRace&&W.length&&!W[W.length-1].race) bad("course",i,"pas de course la dernière semaine");
    // première séance facile
    const w1=W[0]; if(w1&&w1.ph!=="race"&&(w1.first==="q"||w1.first==="long")) bad("firstWeek",i,"première séance "+w1.first);
    // débutant : pas d'intensité les 8 premières semaines
    if(deb) W.filter(w=>w.w<=8&&w.q.length).forEach(w=>bad("debQ",i,"S"+w.w+" "+w.q.join(",")));
    // types non cochés
    W.forEach(w=>w.q.forEach(k=>{ if(k!=="allure"&&!r.n.types.includes(k)) bad(deb?"nonCocheDeb":"nonCoche",i,"S"+w.w+" "+w.ph+" "+k+" (cochés : "+r.n.types.join(",")+")"); }));
    // simple : jamais de VMA ; simple ≤ standard en km et en minutes d'intensité
    if(r.n.cplx==="simple"){ W.forEach(w=>{ if(w.q.includes("vma")) bad("simpleVma",i,"S"+w.w); });
      if(r.std&&r.std.unreal===r.unreal) W.forEach((w,j)=>{ const s=r.std.wk[j]; if(!s) return; if(!w.cross&&w.km>s.km+.06) bad("simpleKm",i,"S"+w.w+" "+w.km.toFixed(1)+" > "+s.km.toFixed(1)); if(w.hard>s.hard+.01) bad("simpleHard",i,"S"+w.w+" "+w.hard+" > "+s.hard); }); }
    if(r.n.cross!=="non") return;   // cardio sans impact : km de course non comparables
    // +8 % : semaine normale vs dernière semaine normale (hors semaine 1 retouchée), tolérance 0,3 km (arrondi des minutes)
    let prev=null; for(const w of W){ if(!isNorm(w)) continue;
      if(prev&&prev.w>1){ const lim=Math.max(prev.km*1.08,prev.km+(prev.runs<Math.min(r.n.seances,3)?3.2:1)); if(w.km>lim+.3) bad("plus8",i,"S"+w.w+" "+w.km.toFixed(1)+" > "+lim.toFixed(1)+" (S"+prev.w+" "+prev.km.toFixed(1)+")"); }
      prev=w; }
    // sortie longue ≤ +10 % de la plus longue séance faite avant (déclarée ou planifiée en semaine normale)
    let mx=r.n.longest>0?r.n.longest:0; for(const w of W){ if(w.L&&mx>0&&w.L>mx*1.1+.15&&w.w>1) bad("long10",i,"S"+w.w+" "+w.L.toFixed(1)+" > 1,1 × "+mx.toFixed(1)); if(isNorm(w)||w.ph==="prep") mx=Math.max(mx,w.mx); }
    // semaine allégée < semaine normale précédente ; affûtage < pic ; course < affûtage
    let lastN=null, peak=0; for(const w of W){ if(w.dl&&lastN&&lastN.w>1&&w.km>=lastN.km-.05) bad("deload",i,"S"+w.w+" "+w.km.toFixed(1)+" ≥ S"+lastN.w+" "+lastN.km.toFixed(1)); if(isNorm(w)||w.ph==="prep"){ lastN=w; if(w.w>1) peak=Math.max(peak,w.km); } }
    const tp=W.find(w=>w.ph==="taper"), rc=W.find(w=>w.ph==="race"); if(tp&&peak&&tp.km>=peak) bad("taper",i,"affûtage "+tp.km.toFixed(1)+" ≥ pic "+peak.toFixed(1)); if(tp&&rc&&rc.km>tp.km+.05) bad("taper",i,"course "+rc.km.toFixed(1)+" > affûtage "+tp.km.toFixed(1));
    // variété : taille du choix non décroissante, ordre d'arrivée (fartlek/côtes, puis seuil, puis VMA), hors affûtage et semaine de course
    if(!deb){ let ps=0; for(const w of W){ if(!w.pool||w.ph==="prep"||w.dl) continue; if(w.pool.length<ps) bad("poolShrink",i,"S"+w.w+" "+w.pool.join(",")); ps=Math.max(ps,w.pool.length); }
      const first={}; W.filter(w=>w.ph!=="taper"&&w.ph!=="race").forEach(w=>w.q.forEach(k=>{ if(first[k]==null) first[k]=w.w; }));
      const intro=Math.min(first.fartlek??99,first.cotes??99); if(r.n.types.includes("fartlek")||r.n.types.includes("cotes")){ if(first.seuil!=null&&first.seuil<intro) bad("ordre",i,"seuil S"+first.seuil+" avant fartlek/côtes S"+intro); if(first.vma!=null&&first.vma<intro) bad("ordre",i,"VMA S"+first.vma+" avant fartlek/côtes S"+intro); }
      if(r.n.types.includes("seuil")&&first.vma!=null&&first.seuil!=null&&first.vma<first.seuil) bad("ordre",i,"VMA S"+first.vma+" avant seuil S"+first.seuil);
      // séances placées hors du choix de la semaine
      W.forEach(w=>{ if(w.pool) w.q.forEach(k=>{ if(k!=="allure"&&!w.pool.includes(k)) bad("horsPool",i,"S"+w.w+" "+w.ph+" "+k+" ∉ "+w.pool.join(",")); }); });
      if(o==="forme"&&r.n.niveau!=="conf"&&!(r.n.niveau==="int"&&r.n.cplx==="avance")) W.forEach(w=>{ if(w.q.includes("vma")) bad("formeVma",i,"S"+w.w); });
    }
    // IA : options limitées au choix de la semaine ; séance changée par l'IA dans le choix ; pas de VMA en simple ; garde-fous de volume tenus
    if(r.ai){ W.forEach(w=>w.opts.forEach((op,j)=>{ if(w.pool) op.slice(1).forEach(k=>{ if(!w.pool.includes(k)) bad("qOpts",i,"S"+w.w+" "+w.q[j]+" → "+k); }); }));
      r.ai.wk.forEach((w,j)=>{ const b=W[j]; w.ai.forEach(k=>{ if(b&&b.pool&&!b.pool.includes(k)) bad("aiTropTot",i,"S"+w.w+" "+k+" ∉ "+b.pool.join(",")); if(r.n.cplx==="simple"&&k==="vma") bad("aiSimpleVma",i,"S"+w.w); if(!r.n.types.includes(k)) bad("aiNonCoche",i,"S"+w.w+" "+k);
          // préparation générale (plan de plus de 20 semaines) : pas de choix de la semaine (qPool nul), la VMA n'y est pas prévue
          if(b&&!b.pool&&b.ph==="prep"&&k==="vma") bad("aiPrepVma",i,"S"+w.w+" prep : VMA choisie par l'IA"); });
        if(b&&w.km>b.km+.6) bad("aiKm",i,"S"+w.w+" "+w.km.toFixed(1)+" > "+b.km.toFixed(1)); if(b&&w.hard>b.hard*1.1+1.01) bad("aiHard",i,"S"+w.w+" "+w.hard+" > "+b.hard); }); }
  });
  lin(R).filter(x=>x.s.drops||x.s.dev>.15||!x.s.peakLate).forEach(x=>bad(x.s.drops?"baisse":x.s.dev>.15?"ecartDroite":"picTot",x.i,"plan écart "+pct(x.s.dev)+" ; baisses "+x.s.drops+" ; km "+x.r.wk.map(w=>(w.dl?"(":"")+w.km.toFixed(0)+(w.dl?")":"")).join(" ")));
  return F; }
