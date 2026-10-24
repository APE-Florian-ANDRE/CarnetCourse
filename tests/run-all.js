// Lance la suite de tests en parallèle et affiche un tableau (audit CODE-01 / CODE-05).
// Usage : node tests/run-all.js [nom …] [--jobs=3]   (sans nom : toute la suite ci-dessous)
// Les scripts qui dépendent de fichiers hors dépôt (cmp, wiz-regression) ou qui ne sont pas des tests (lib, fx14) ne sont pas lancés.
const {spawn}=require("child_process"), path=require("path");
const SUITE=["static-checks","smoke","flows","profil15","validation","consent","vercel-coach","vercel-plan","n8n","email","coach","planai","import-pure","vendor",
  "notif","pref","aiba","progression","plan-progression","evaltest","evaltest2","pages","audit-plan","sheets","v14","profile-page"];
const args=process.argv.slice(2), jobs=+((args.find(a=>a.startsWith("--jobs="))||"--jobs=3").slice(7))||3;
const names=args.filter(a=>!a.startsWith("--")); const list=names.length? names : SUITE;
const res=[]; let next=0;
function run(name){ return new Promise(done=>{ const t0=Date.now(); let out="";
  const p=spawn(process.execPath,[path.join(__dirname,name+".js")],{cwd:path.resolve(__dirname,".."),env:process.env});
  p.stdout.on("data",d=>out+=d); p.stderr.on("data",d=>out+=d);
  const kill=setTimeout(()=>{ out+="\nFAIL délai dépassé (15 min)"; p.kill("SIGKILL"); },15*60e3);
  p.on("close",code=>{ clearTimeout(kill); const okN=(out.match(/^OK/gm)||[]).length, failN=(out.match(/^FAIL/gm)||[]).length;
    res.push({name,code,okN,failN,fails:out.split("\n").filter(l=>/^FAIL/.test(l)).slice(0,8),tail:out.trim().split("\n").slice(-3)});
    console.log((code===0&&failN===0?"OK   ":"FAIL ")+name+" ("+okN+" OK, "+failN+" FAIL, "+Math.round((Date.now()-t0)/1000)+" s)"); done(); }); }); }
(async()=>{
  await Promise.all(Array.from({length:Math.min(jobs,list.length)},async()=>{ while(next<list.length) await run(list[next++]); }));
  const bad=res.filter(r=>r.code!==0||r.failN>0);
  for(const r of bad){ console.log("\n== "+r.name+" (code "+r.code+")"); for(const l of (r.fails.length?r.fails:r.tail)) console.log("  "+l.slice(0,300)); }
  console.log("\n"+(bad.length? "ECHECS : "+bad.map(r=>r.name).join(", ") : "TOUT OK ("+res.length+" scripts)")); process.exit(bad.length?1:0);
})();
