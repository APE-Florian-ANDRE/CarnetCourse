// Onglet Notifications passif : tests adversariaux (passivité, contenu, actions, interactions, mise en page).
const {chromium}=require("playwright"); const L=require("./lib");
// horloge figée (audit CODE-03 : le résultat ne dépend plus du jour où le test est lancé) : mercredi 7 octobre 2026
const FIX="2026-10-07T10:00:00", D=n=>new Date(Date.parse(FIX+"Z")+n*864e5).toISOString().slice(0,10);
const base={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:D(0),deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:""};
// scénarios : beaucoup de contenu (objectif irréaliste + début passé + énergie basse + nouveautés) / rien du tout
const SC={
  busy:{profile:{...base,start:D(-40),volume:10,longest:5,deficit:250,bonus:50},seen:13},   // énergie disponible entre 30 et 35 : repère « apports un peu justes » (panneau)
  empty:{profile:{...base,deficit:0,bonus:0},seen:15},
  future:{profile:{...base,start:D(20)},seen:15},
  ended:{profile:{...base,start:D(-200)},seen:15},
  lowEA:{profile:{...base,poids:60,taille:170,cible:"55",deficit:700,bonus:300,seances:"5"},seen:15},
};
const seedOf=k=>JSON.stringify({...SC[k],isExample:false,log:[],week:1});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const b0=await chromium.launch(); const E=[];
 const b={newContext:async o=>{ const c=await b0.newContext(o); await c.clock.install({time:new Date(FIX)}); return c; },close:()=>b0.close()};
 const mk=async(S,{seed,width=390,height=844,session,db,ctx:ctx0}={})=>{ const ctx=ctx0||await b.newContext({viewport:{width,height},locale:"fr-FR"}); const p=await ctx.newPage();
   p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(m.type()==="error") E.push("console "+m.text().slice(0,160)); });
   if(db) await L.fake(p,db,{session});
   await p.addInitScript(({seed})=>{ if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(seed){ localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); } } },{seed});
   await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 const panel=p=>p.evaluate(()=>{ const sh=document.querySelector('.sheet[data-kind="notif"]'); if(!sh) return null;
   return {n:document.querySelectorAll(".sheet-bg").length,txt:sh.textContent,secs:[...sh.querySelectorAll(".nt-s>h4")].map(h=>h.textContent),btns:[...sh.querySelectorAll(".sh-b button")].map(x=>x.id||x.textContent.trim())}; });
 const openP=async p=>{ await p.click("#notifBtn"); await p.waitForTimeout(200); return panel(p); };
 // empreinte visuelle complète du bouton et du bouton Compte (passivité : rien ne doit changer avec le contenu)
 const look=p=>p.evaluate(()=>{ const b=document.querySelector("#notifBtn"), props=["color","backgroundColor","borderColor","boxShadow","outlineStyle","opacity","fontWeight","animationName","transform","filter","width","height"];
   const st=el=>props.map(k=>getComputedStyle(el)[k]).join("|"), ps=el=>["::before","::after"].map(x=>getComputedStyle(el,x).content).join("|");
   const all=[b,...b.querySelectorAll("*")];
   const av=[...document.querySelectorAll(".js-av")].find(x=>x.getClientRects().length);
   return {html:b.outerHTML,st:all.map(st).join("#"),ps:all.map(ps).join("#"),attrs:[...b.attributes].map(a=>a.name+"="+a.value).sort().join(" "),
     av:av?st(av.querySelector(".av-d"))+ps(av):"",title:document.title,live:(document.querySelector("#srLive")||{}).textContent||"",
     toasts:document.querySelectorAll("#toasts .toast").length,banner:!!document.querySelector(".banner"),
     apptop:document.querySelector(".apptop").innerHTML}; });
 const S=await L.serve();

 // N1 passivité : bouton identique avec beaucoup de contenu ou sans rien, aucun signal ailleurs
 for(const width of [375,1280]){ const W=" ("+width+" px)";
   const pb=await mk(S,{seed:seedOf("busy"),width}); await pb.waitForTimeout(1500); const lb=await look(pb);
   const pe=await mk(S,{seed:seedOf("empty"),width}); await pe.waitForTimeout(1500); const le=await look(pe);
   const diff=Object.keys(lb).filter(k=>lb[k]!==le[k]);
   ok(diff.length===0,"N1 bouton et en-tête identiques avec ou sans notifications (nouveautés, objectif irréaliste, début passé)"+W,{diff,b:diff.map(k=>lb[k]),e:diff.map(k=>le[k])});
   ok(!lb.banner&&lb.toasts===0&&!/nouveaut|notification/i.test(lb.live)&&!/\(\d+\)/.test(lb.title),"N1 aucune bannière, toast, annonce lecteur d'écran ni compteur dans le titre"+W,lb);
   ok(await pb.evaluate(()=>![...document.querySelectorAll("[class*=badge],[class*=dot],[class*=count],[class*=pastille]")].some(x=>x.getClientRects().length&&x.closest(".apptop,nav.tabs"))),"N1 aucune pastille dans l'en-tête ni les onglets"+W);
   const pt=await openP(pb); ok(pt&&pt.secs.join()==="Semaine 7,Ton plan,Nouveautés","N2 panneau : sections Semaine 7, Ton plan, Nouveautés"+W,pt&&pt.secs);
   await pb.keyboard.press("Escape"); await pb.waitForTimeout(150);
   ok((await look(pb)).html===lb.html,"N1 bouton inchangé après lecture"+W);
   // débordement horizontal, panneau ouvert et fermé
   const ov=async p=>p.evaluate(()=>({sw:document.documentElement.scrollWidth,vw:innerWidth,sh:(()=>{ const s=document.querySelector(".sheet"); if(!s) return 0; const r=s.getBoundingClientRect(); return Math.max(r.right-innerWidth,-r.left,s.querySelector(".sh-b").scrollWidth-s.querySelector(".sh-b").clientWidth); })()}));
   let o=await ov(pb); ok(o.sw<=o.vw,"N3 aucun défilement horizontal, panneau fermé"+W,o);
   await openP(pb); o=await ov(pb); ok(o.sw<=o.vw&&o.sh<=0,"N3 panneau ouvert : rien ne déborde"+W,o);
   await pb.screenshot({path:process.env.SHOT_DIR?process.env.SHOT_DIR+"/notif-"+width+"-testB.png":"/dev/null"}).catch(()=>{});
   await pb.ctx.close(); await pe.ctx.close(); }
 { const p=await mk(S,{seed:seedOf("busy"),width:320}); const r=await p.evaluate(()=>{ const a=document.querySelector(".apptop"), n=document.querySelector("#notifBtn").getBoundingClientRect(), v=[...document.querySelectorAll(".js-av")].find(x=>x.getClientRects().length).getBoundingClientRect();
     return {sw:document.documentElement.scrollWidth,vw:innerWidth,overlap:n.right>v.left+0.5,inV:n.left>=0&&v.right<=innerWidth,h:a.getBoundingClientRect().height}; });
   ok(r.sw<=r.vw&&!r.overlap&&r.inV,"N3 320 px : bouton et Compte visibles, sans chevauchement ni débordement",r); await p.ctx.close(); }

 // N4 contenu : chaque alerte déplacée est dans le panneau et nulle part ailleurs
 for(const [k,re,sec] of [["future",/Ton plan commence le/,"Semaine 1"],["busy",/Objectif trop loin/,"Ton plan"],["busy",/apports sont un peu justes/,"Semaine 7"],["ended",/Ce plan est terminé/,"Semaine 1"]]){
   const p=await mk(S,{seed:seedOf(k)});
   const out=await p.evaluate(re=>{ const r=new RegExp(re); return {week:r.test(document.querySelector("#weekAlerts").textContent),wrap:[...document.querySelectorAll(".wrap .alert")].filter(a=>a.getClientRects().length&&r.test(a.textContent)).length}; },re.source);
   const pt=await openP(p); const inSec=await p.evaluate(([re,sec])=>{ const s=[...document.querySelectorAll('.sheet .nt-s')].find(x=>x.querySelector("h4").textContent===sec); return !!s&&new RegExp(re).test(s.textContent); },[re.source,sec]);
   ok(!out.week&&out.wrap===0&&inSec,"N4 "+re.source+" : dans la section « "+sec+" » du panneau, plus dans la page",{out,secs:pt&&pt.secs}); await p.ctx.close(); }
 // alertes de sécurité gardées dans la semaine (moins de 18 ans, avis médical, début passé avec volume au-delà du profil)
 { const p=await mk(S,{seed:seedOf("busy")});
   ok(await p.evaluate(()=>/Ton plan a commencé le/.test(document.querySelector("#weekAlerts").textContent)),"N4 « Ton plan a commencé le » (risque de blessure) gardé en haut de la semaine");
   const pt=await openP(p); ok(pt&&!/Ton plan a commencé le/.test(pt.txt),"N4 « Ton plan a commencé le » absent du panneau (pas en double)"); await p.ctx.close(); }
 { const p=await mk(S,{seed:JSON.stringify({profile:{...base,age:16,cible:"80"},isExample:false,log:[],week:1,seen:15})});
   ok(await p.evaluate(()=>/moins de 18 ans/.test(document.querySelector("#weekAlerts").textContent)),"N4 alerte moins de 18 ans gardée en haut de la semaine");
   const pt=await openP(p); ok(pt&&!/moins de 18 ans/.test(pt.txt),"N4 alerte moins de 18 ans absente du panneau (pas en double)"); await p.ctx.close(); }
 { const p=await mk(S,{seed:JSON.stringify({profile:{...base,age:70},isExample:false,log:[],week:1,seen:15})});
   ok(await p.evaluate(()=>/avis d'un médecin/.test(document.querySelector("#weekAlerts").textContent)),"N4 avis médical (65 ans et plus) gardé en haut de la semaine"); await p.ctx.close(); }

 // N5 actions depuis le panneau
 { const p=await mk(S,{seed:seedOf("busy")}); await openP(p); await p.click('.sheet [data-safedate]'); await p.waitForTimeout(400);
   const r=await p.evaluate(()=>({sheet:!!document.querySelector(".sheet"),toast:document.querySelector("#toasts").textContent,rd:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.raceDate,f:document.activeElement.id}));
   ok(!r.sheet&&/Course fixée/.test(r.toast)&&!!r.rd&&r.f==="weekTitle","N5 « Viser cette date » : date fixée, panneau fermé, focus sur la semaine",r);
   const pt=await openP(p); ok(pt&&!/Objectif trop loin/.test(pt.txt),"N5 après « Viser cette date » : alerte retirée du panneau",pt&&pt.secs); await p.ctx.close(); }
 { const p=await mk(S,{seed:seedOf("busy")}); await p.click('#weekAlerts #followedPlan'); await p.waitForTimeout(400);
   const r=await p.evaluate(()=>({sheet:!!document.querySelector(".sheet"),suivi:localStorage.getItem("carnet.suivi"),st:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.start,f:document.activeElement.id}));
   ok(!r.sheet&&r.suivi===r.st&&r.f==="weekTitle","N5 « J'ai suivi le plan » (en haut de la semaine) : noté, focus sur la semaine",r);
   ok(await p.evaluate(()=>!/Ton plan a commencé le/.test(document.querySelector(".wrap").textContent)),"N5 après « J'ai suivi le plan » : alerte retirée"); await p.ctx.close(); }
 for(const k of ["busy","ended"]){ const p=await mk(S,{seed:seedOf(k)}); if(k==="ended"){ await openP(p); await p.click('.sheet #restartPlan'); } else await p.click('#weekAlerts #restartPlan'); await p.waitForTimeout(500);
   const r=await p.evaluate(()=>({sheet:!!document.querySelector(".sheet"),st:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.start,f:document.activeElement.id}));
   ok(!r.sheet&&r.st===D0&&r.f==="weekTitle","N5 « Recommencer aujourd'hui » ("+k+") : plan relancé aujourd'hui, focus sur la semaine",r);
   const wa=await p.evaluate(()=>document.querySelector("#weekAlerts").textContent); const pt=await openP(p); ok(pt&&!/Ce plan est terminé|Ton plan a commencé le/.test(pt.txt+wa),"N5 après « Recommencer » ("+k+") : alerte retirée"); await p.ctx.close(); }

 // N6 interactions : double clic, lien vers les versions, rechargement, clavier
 { const p=await mk(S,{seed:seedOf("busy")}); await p.dblclick("#notifBtn"); await p.waitForTimeout(250);
   const dbl=await p.evaluate(()=>({n:document.querySelectorAll(".sheet-bg").length,open:!!document.querySelector('.sheet[data-kind="notif"]')}));
   await p.click(".js-av >> visible=true",{clickCount:2}); await p.waitForTimeout(250); const dblAv=await p.evaluate(()=>!!document.querySelector(".sheet")); if(dblAv){ await p.keyboard.press("Escape"); await p.waitForTimeout(150); }
   ok(dbl.n<=1&&dbl.open===dblAv,"N6 double clic : jamais deux panneaux, même comportement que le bouton Compte",{dbl,compteOuvert:dblAv});
   if(!dbl.open) await openP(p);
   await p.click(".sheet [data-nt-news]"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>document.querySelectorAll(".sheet-bg").length===1&&/Nouveautés|Quoi de neuf/.test(document.querySelector("#shT").textContent)),"N6 « Toutes les versions » remplace le panneau par la feuille des versions");
   await p.keyboard.press("Escape"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!document.querySelector(".sheet")&&document.activeElement.id==="notifBtn"),"N6 fermer la feuille des versions rend le focus au bouton Notifications");
   await openP(p); await p.reload(); await p.waitForTimeout(900);
   ok(await p.evaluate(()=>!document.querySelector(".sheet")&&getComputedStyle(document.documentElement).overflow!=="hidden"),"N6 rechargement : aucun panneau resté ouvert, page défilable");
   // clavier : Accueil -> Notifications -> Compte ; Entrée ouvre ; Maj+Tab reste dans le panneau
   await p.evaluate(()=>document.querySelector('.apptop [data-act="home"]').focus()); await p.keyboard.press("Tab");
   const f1=await p.evaluate(()=>document.activeElement.id); await p.keyboard.press("Tab"); const f2=await p.evaluate(()=>document.activeElement.getAttribute("aria-label"));
   ok(f1==="notifBtn"&&/^Compte/.test(f2||""),"N6 ordre au clavier : Accueil, Notifications, Compte",[f1,f2]);
   await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
   ok(!!(await panel(p)),"N6 Entrée ouvre le panneau");
   for(let i=0;i<12;i++) await p.keyboard.press("Shift+Tab");
   ok(await p.evaluate(()=>document.querySelector(".sheet").contains(document.activeElement)),"N6 Maj+Tab reste dans le panneau");
   const a=await p.evaluate(()=>{ const b=document.querySelector("#notifBtn"); return {hp:b.getAttribute("aria-haspopup"),name:b.textContent.trim(),lab:document.querySelector(".sheet").getAttribute("aria-labelledby"),h:[...document.querySelectorAll(".sheet .nt-s>h4")].length}; });
   ok(a.hp==="dialog"&&a.name==="Notifications"&&a.lab==="shT"&&a.h>0,"N6 ARIA : nom accessible, haspopup, dialog nommé, sections titrées",a);
   // clic sur le fond : fermé
   await p.mouse.click(5,5); await p.waitForTimeout(150); ok(await p.evaluate(()=>!document.querySelector(".sheet")),"N6 clic hors du panneau : fermé");
   await p.ctx.close(); }

 // N7 un autre onglet change le plan pendant que le panneau est ouvert : le panneau suit
 { const ctx=await b.newContext({viewport:{width:390,height:844},locale:"fr-FR"});
   const a=await mk(S,{seed:seedOf("busy"),ctx}); const pa=await openP(a); const bb=await mk(S,{ctx});
   await bb.click('#weekAlerts #restartPlan'); await bb.waitForTimeout(1200);
   const pa2=await panel(a);
   ok(pa&&pa.secs.includes("Semaine 7")&&pa2&&!pa2.secs.includes("Semaine 7"),"N7 changement venu d'un autre onglet : le panneau ouvert se met à jour",{avant:pa&&pa.secs,apres:pa2&&pa2.secs});
   await ctx.close(); }

 // N8 coach (bulle) ouvert + panneau
 { const SC2=await L.serve({"/config.js":L.cfgJs({CHAT_WEBHOOK_URL:"https://n8n.example.org/webhook/x",CHAT_PROVIDER_NAME:"Test"})});
   const p=await mk(SC2,{seed:seedOf("busy"),width:1280,height:800}); await p.waitForTimeout(400);
   if(await p.evaluate(()=>!!document.querySelector("#coachFab")&&!document.querySelector("#coachFab").hidden)){
     await p.click("#coachFab"); await p.waitForTimeout(250); await p.click("#notifBtn"); await p.waitForTimeout(250);
     const r=await p.evaluate(()=>{ const s=document.querySelector(".sheet").getBoundingClientRect(), pop=document.querySelector("#coachPop").getBoundingClientRect();
       const x=Math.min(s.right-10,pop.left+pop.width/2), y=Math.max(s.top+10,pop.top+20); const el=document.elementFromPoint(x,y); return {top:!!(el&&el.closest(".sheet-bg")),pop:!document.querySelector("#coachPop").hidden}; });
     ok(r.top,"N8 panneau ouvert au-dessus de la bulle du coach",r);
     await p.keyboard.press("Escape"); await p.waitForTimeout(150);
     ok(await p.evaluate(()=>!document.querySelector(".sheet")&&!document.querySelector("#coachPop").hidden),"N8 Échap ferme le panneau seulement, la bulle reste ouverte");
   } else ok(false,"N8 bulle du coach introuvable");
   await p.ctx.close(); SC2.close(); }

 // N9 mode exemple (première visite) : ouvrir le panneau n'enregistre pas les données d'exemple
 { const ctx=await b.newContext({viewport:{width:390,height:844},locale:"fr-FR"}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push("PE "+e.message));
   await p.addInitScript(()=>{ if(!sessionStorage.__s){ sessionStorage.__s=1; localStorage.setItem("carnet.hv","1"); } });
   await p.goto(S.url+"/"); await p.waitForTimeout(900);
   const vis=await p.evaluate(()=>{ const b=document.querySelector("#notifBtn"); return !!(b&&b.getClientRects().length); });
   const ls0=await p.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()));
   if(vis){ const pt=await openP(p); ok(pt&&!pt.secs.includes("Nouveautés"),"N9 première visite : pas de liste de nouveautés",pt&&pt.secs);
     await p.keyboard.press("Escape"); await p.waitForTimeout(200);
     // comme « Quoi de neuf » (comportement antérieur) : la version vue est notée ; les données restent marquées « exemple »
     ok(await p.evaluate(()=>{ const s=localStorage.getItem("carnet-course.v1"); return s===null||JSON.parse(s).isExample===true; }),"N9 première visite : ouvrir le panneau ne transforme pas l'exemple en données à toi");
     ok(await p.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()))===ls0,"N9 première visite : ouvrir le panneau n'écrit rien dans le stockage local (carnet.vu compris)"); }
   else console.log("     (N9 : bouton non visible à la première visite)");
   await ctx.close(); }

 // N10 synchronisation : nouveautés déjà vues sur un autre appareil (compte) => plus listées
 { const db=L.makeDb(); db.rows.set("u-1",{user_id:"u-1",doc:{profile:base,isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:15},consent:{cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:"2026-10-10T00:00:00.000Z"}});
   const S3=await L.serve({"/config.js":L.cfgJs()});
   const p=await mk(S3,{seed:JSON.stringify({profile:base,isExample:false,log:[],week:1,seen:13}),db,session:L.SESSION("u-1")}); await p.waitForTimeout(1200);
   const pt=await openP(p); const sv=await p.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem("carnet-course.v1")).seen; }catch(e){ return null; } });
   ok(pt&&!pt.secs.includes("Nouveautés"),"N10 nouveautés déjà vues sur un autre appareil (seen "+sv+" après synchro) : plus listées comme nouvelles",pt&&pt.secs);
   await p.ctx.close(); S3.close(); }

 // N11 renvoi « (voir l'alerte) » : l'alerte de sécurité citée doit rester visible sur la page, pas seulement dans le panneau passif
 { const p=await mk(S,{seed:JSON.stringify({profile:{...base,poids:70,taille:175,cible:"65",mg:6,deficit:500,bonus:200,seances:"6",volume:150,longest:35,niveau:"av",objectif:"42",start:D(-30)},isExample:false,log:[],week:1,seen:15})});
   const r=await p.evaluate(()=>({ref:/voir l'alerte\)/.test(document.querySelector(".wrap").textContent),week:[...document.querySelectorAll("#weekAlerts .alert")].map(a=>a.textContent.slice(0,60))}));
   const pt=await openP(p);
   if(!r.ref) console.log("     (N11 : renvoi non affiché pour ce profil)");
   ok(r.ref&&r.week.some(t=>/Déficit limité|Aucun déficit possible/.test(t)),"N11 « réduit par sécurité (voir l'alerte) » : l'alerte citée est visible dans la semaine",{week:r.week,panneau:pt&&pt.txt.slice(0,200)});
   await p.ctx.close(); }
 ok(E.length===0,"aucune erreur JS",E.slice(0,5));
 console.log(fails?"\n"+fails+" ÉCHEC(S)":"\nTOUT OK"); await b.close(); S.close(); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
const D0=D(0);
