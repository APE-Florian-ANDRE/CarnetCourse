// toutes les feuilles (modales) ont la même taille : mesure à 4 largeurs, connecté (faux Supabase)
const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs"), path=require("path");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes"],cross:"non",raceDate:""};
const seed=JSON.stringify({profile:prof,isExample:false,log:[{date:"2026-09-27",poids:81,at:1,sommeil:7,fatigue:2,faites:3,prevues:4,douleur:"non"}],week:2,seen:12});
const PEND=JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()});
(async()=>{ const S=await L.serve({"/config.js":L.cfgJs()}); const b=await chromium.launch(); const E=[], res={};
 for(const [w,h] of [[375,740],[320,568],[768,900],[1280,800]]){ const ctx=await b.newContext({viewport:{width:w,height:h},locale:"fr-FR"}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push(e.message)); p.on("console",m=>{ if(m.type()==="error") E.push(m.text().slice(0,120)); });
  await L.fake(p,L.makeDb(),{session:L.SESSION()}); await p.addInitScript(({seed,PEND})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.consent",PEND); } },{seed,PEND});
  await p.goto(S.url+"/"); await p.waitForTimeout(1300);
  const sz=async name=>{ await p.waitForTimeout(420); const r=await p.evaluate(()=>{ const s=document.querySelector(".sheet"); if(!s) return null; const q=x=>{ const e=s.querySelector(x); return e? Math.round(e.getBoundingClientRect().height):null; }; const bb=s.getBoundingClientRect(); return {w:Math.round(bb.width),h:Math.round(bb.height),x:Math.round(bb.x),y:Math.round(bb.y),hh:q(".sh-h"),ff:q(".sh-f"),radius:getComputedStyle(s).borderTopLeftRadius,modal:s.getAttribute("aria-modal")}; }); (res[w+"x"+h]=res[w+"x"+h]||{})[name]=r; };
  const close=async()=>{ await p.keyboard.press("Escape"); await p.waitForTimeout(150); };
  await p.click("#days [data-move]"); await sz("deplacer"); await close();
  await p.click("#icsW"); await sz("export-ics"); await close();
  await p.click("#days [data-ics]"); await sz("export-seance"); await close();
  await p.evaluate(()=>document.querySelector("footer [data-news]").click()); await sz("nouveautes"); await close();
  // v14 : ressenti, import de stats (accueil, aperçu, erreur), retrait des données importées
  await p.locator("#days [data-feel]").first().click(); await sz("ressenti"); await p.selectOption("#fRpe","9"); await p.check("input[name=fPain][value='2']",{force:true}); await sz("ressenti-douleur"); await p.selectOption("#fZone",{index:1}); await p.click("#fSave"); await sz("ressenti-message"); await close();
  await p.click("#tab-suivi"); await p.waitForTimeout(150); await p.click("#impOpen"); await sz("import-stats");
  { const pk=async f=>{ const [fc]=await Promise.all([p.waitForEvent("filechooser"),p.click("#stPick")]); await fc.setFiles(f); }; const FX=require("./fx14"), tf=path.join(require("os").tmpdir(),"sheets-v14-"+process.pid); fs.mkdirSync(tf,{recursive:true}); fs.writeFileSync(tf+"/junk.xml","<html></html>"); fs.writeFileSync(tf+"/export.zip",FX.appleZip());
    await pk(tf+"/junk.xml"); await p.waitForSelector("#stMsg .alert"); await sz("import-stats-erreur"); await pk(tf+"/export.zip"); await p.waitForSelector("#stA"); await sz("import-stats-apercu"); await p.click("#stPick"); await p.waitForTimeout(400); await p.click("#impClear"); await sz("retirer-importees"); await close(); fs.rmSync(tf,{recursive:true,force:true}); }
  await p.click("#tab-semaine"); await p.waitForTimeout(250);
  await p.click(".apptop .av"); await sz("compte");
  for(const [k,go] of [["erase",["#erNext"]],["signout",[]],["withdraw",[]],["delacct",["#daNext"]]]){ await p.click("[data-acc="+k+"]"); await sz(k+"-1"); if(go.length){ await p.click(go[0]); await sz(k+"-2"); } await close(); await p.click(".apptop .av"); await p.waitForTimeout(250); }
  await p.setInputFiles(".sheet input[type=file]",{name:"x.json",mimeType:"application/json",buffer:fs.readFileSync(path.join(__dirname,"export-sample.json"))}); await p.waitForTimeout(500); await sz("import"); await close();
  await p.evaluate(()=>document.querySelector("[data-act=wizard]")&&document.querySelector("[data-act=wizard]").click()); await p.waitForTimeout(300); await p.fill("#wzAge","41"); await p.click("#wzQuit"); await sz("quitter-assistant");
  await ctx.close(); }
 let bad=0; for(const [vp,o] of Object.entries(res)){ const ks=Object.keys(o), ref=o[ks[0]]; const diffs=ks.filter(k=>!o[k]||["w","h","x","y","hh","ff","radius","modal"].some(f=>o[k][f]!==ref[f])); bad+=diffs.length; console.log(vp,ks.length+" feuilles",ref&&`${ref.w}x${ref.h}@${ref.x},${ref.y} en-tête ${ref.hh} pied ${ref.ff} rayon ${ref.radius}`,diffs.length?"DIFFÉRENCES "+diffs.join():"toutes identiques"); }
 // feuille d'accord (sans consentement en attente) : mesurée à part
 { const ctx=await b.newContext({viewport:{width:375,height:740}}); const p=await ctx.newPage(); await L.fake(p,L.makeDb(),{session:L.SESSION()}); await p.addInitScript(({seed})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); } },{seed}); await p.goto(S.url+"/"); await p.waitForTimeout(1300);
   const r=await p.evaluate(()=>{ const s=document.getElementById("auth"); if(!s||s.hidden||!s.querySelector('[data-acc="consent-ok"]')) return [0,0]; const bb=s.getBoundingClientRect(); return [Math.round(bb.width),Math.round(bb.height)]; }); console.log("écran d'accord auto (375x740) :",r.join("x"),"attendu 375x740 (plein écran)"); if(r[0]!==375||r[1]!==740) bad++; await ctx.close(); }
 console.log("erreurs",E,"écarts",bad); await b.close(); S.close(); process.exit(bad||E.length?1:0); })();
