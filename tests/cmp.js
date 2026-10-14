// plans et calories identiques à la v13 publiée (400 profils) : BASE = chemin du fichier v13 (index.html du dossier plan-course)
const {chromium}=require("playwright"); const fs=require("fs"), path=require("path"); const L=require("./lib");
const BASE=process.env.V13||path.resolve(__dirname,"../../plan-course/index.html");
const INJ='"use strict"; window.__T={buildPlan,profileNums,sessionKm,vmaOf,energy,dayFuel};';
function rnd(seed){ let x=seed; return ()=>{ x=(x*1103515245+12345)%2147483648; return x/2147483648; }; }
const pick=(r,a)=>a[Math.floor(r()*a.length)];
(async()=>{ const b=await chromium.launch(); const r=rnd(11); const ps=[];
 for(let i=0;i<400;i++) ps.push({sexe:pick(r,["H","F"]),age:pick(r,[16,25,32,45,60,70]),taille:pick(r,[160,170,178,190]),poids:pick(r,[48,55,65,82,95,120]),cible:pick(r,["","60","75"]),mg:"",activite:pick(r,["1.25","1.4","1.55"]),niveau:pick(r,["deb","int","conf"]),objectif:pick(r,["forme","5","10","21","42"]),volume:pick(r,[0,10,25,40,70]),longest:pick(r,[0,5,12,25]),ref:"none",refVal:"",fcmax:"",seances:pick(r,["3","4","5","6"]),renfo:pick(r,["0","1","2"]),longDay:pick(r,["5","6"]),start:"2026-10-05",deficit:pick(r,[0,200,300,400]),bonus:pick(r,[0,100]),adj:0,lieu:pick(r,["dehors","tapis","mixte"]),equip:"salle",types:["seuil","vma"],cross:"non",raceDate:""});
 const run=async(load)=>{ const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message)); await load(pg); await pg.waitForTimeout(400);
   const out=await pg.evaluate(ps=>ps.map(p=>{ const T=window.__T, P=T.profileNums(p), w=T.buildPlan(P), E=T.energy(P,w); return JSON.stringify({w:w.map(wk=>({...wk,fuel:T.dayFuel(P,E,wk)})),u:w.unreal}); }),ps); await pg.close(); return {out,errs}; };
 const frag=fs.readFileSync(BASE,"utf8").replace('"use strict";',INJ);
 const a=await run(async pg=>{ await pg.setContent('<!doctype html><html><head><meta charset=utf8></head><body>'+frag+'</body></html>'); });
 const S=await L.serve({"/app.js":()=>fs.readFileSync(path.join(L.ROOT,"app.js"),"utf8").replace('"use strict";',INJ)});
 const c=await run(async pg=>{ await pg.goto(S.url+"/"); });
 let same=0; a.out.forEach((x,i)=>{ if(x===c.out[i]) same++; });
 console.log("plans + calories identiques à la v13 :",same,"/",ps.length,"erreurs",a.errs,c.errs); await b.close(); S.close(); process.exit(same===ps.length&&!a.errs.length&&!c.errs.length?0:1); })();
