// page « Mon profil » (ouverte par l'avatar) : ouverture et retour, stats, infos modifiables avec contrôles, mode discret, échappement, CSP, petit écran
const {chromium}=require("playwright"); const L=require("./lib");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:"",fcmax:"",mg:""};
// toutes les séances de la première semaine cochées « Faite » (signature vide : acceptée quel que soit le contenu du jour)
const done={}; for(let d=28;d<=30;d++) done["2026-09-"+d]={v:"done",sig:"",at:1}; for(let d=1;d<=4;d++) done["2026-10-0"+d]={v:"done",sig:"",at:1};
const data=(extra={})=>JSON.stringify({profile:prof,isExample:false,log:[{date:"2026-09-27",poids:81,at:1},{date:"2026-10-18",poids:79.4,at:2}],week:2,seen:13,done,...extra});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const b=await chromium.launch(); const E=[];
 const mk=async(S,{seed,session,width=390,db}={})=>{ const ctx=await b.newContext({viewport:{width,height:844},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,db||L.makeDb(),{session});
  await p.addInitScript(({seed})=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective));
    if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(seed){ localStorage.setItem("carnet-course.v1",seed); } localStorage.setItem("carnet.hv","1"); } },{seed});
  await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 const open=async p=>{ await p.click(".js-av >> visible=true"); await p.waitForTimeout(300); };
 const S=await L.serve();

 // P1 ouverture : page plein écran (pas une feuille), titre focalisé, application masquée, une entrée d'historique
 { const p=await mk(S,{seed:data()}); await open(p);
   const r=await p.evaluate(()=>({me:!document.getElementById("me").hidden,wrap:document.querySelector(".wrap").hidden,sheet:!!document.querySelector(".sheet"),f:document.activeElement.id,h:history.state&&history.state.pbMe,lab:document.querySelector(".apptop .av").getAttribute("aria-label"),hp:document.querySelector(".apptop .av").hasAttribute("aria-haspopup")}));
   ok(r.me&&r.wrap&&!r.sheet&&r.f==="meT"&&r.h===1,"P1 l'avatar ouvre la page Mon profil (focus sur le titre, pas de feuille)",r);
   ok(/^Mon profil/.test(r.lab)&&!r.hp,"P1 avatar : nom accessible « Mon profil », plus de aria-haspopup",r);

   // P2 stats : séances faites, régularité cohérente, distance, série, suivi du poids, graphique
   const t=await p.evaluate(()=>[...document.querySelectorAll("#meStats .stat")].map(s=>({k:s.querySelector(".k").textContent,v:s.querySelector(".v").textContent.trim(),d:s.querySelector(".d").textContent})));
   const g=k=>t.find(x=>x.k===k)||{v:"",d:""}; const nd=parseInt(g("Séances faites").v), n=parseInt((/sur (\d+)/.exec(g("Séances faites").d)||[])[1]);
   ok(nd>=3&&nd<=7&&n>=nd,"P2 séances faites comptées sur la semaine cochée",t);
   ok(parseInt(g("Régularité").v)===Math.round(nd/n*100),"P2 régularité = faites / prévues à ce jour",{nd,n,reg:g("Régularité").v});
   ok(parseFloat(g("Distance").v.replace(",","."))>0&&/km/.test(g("Distance").v),"P2 distance > 0",g("Distance"));
   ok(/^\d+/.test(g("Série").v),"P2 série affichée",g("Série"));
   ok(g("Suivi").v.startsWith("2")&&!/kg/.test(JSON.stringify(t)),"P2 suivi : semaines notées, aucune variation de poids dans les stats",t);
   ok(await p.evaluate(()=>!!document.querySelector("#meStats svg[role=img]")&&/Semaine \d+ : [\d,]+ km faits sur/.test(document.querySelector("#meStats ul.sr-only").textContent)),"P2 graphique du volume par semaine, avec ses valeurs en texte");
   ok(await p.evaluate(()=>document.title==="Mon profil · Pacebook"),"P2 titre du document");
   ok(await p.evaluate(()=>/Semaine \d+ sur \d+|Plan terminé/.test(document.querySelector("#meId").textContent)),"P2 progression du plan dans l'en-tête");

   // P3 infos : affichage puis modification avec contrôles
   ok(await p.evaluate(()=>{ const t=document.querySelector("#meInfo").textContent; return /35 ans/.test(t)&&/178 cm/.test(t)&&/80 kg/.test(t)&&!/79,4/.test(t); }),"P3 infos affichées (âge, taille, poids), sans doublon de pesée");
   await p.click("#meEditB"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>document.activeElement.id==="me_age"&&document.querySelector("#meEditB").hidden),"P3 « Modifier » ouvre le formulaire, focus sur l'âge");
   await p.fill("#me_age","12"); await p.fill("#me_taille","300"); await p.fill("#me_poids","8O"); await p.fill("#me_fcmax","190.5"); await p.click("#meSave"); await p.waitForTimeout(150);
   const inv=await p.evaluate(()=>({ids:[...document.querySelectorAll("#meForm [aria-invalid=true]")].map(x=>x.id),f:document.activeElement.id,age:(document.getElementById("me_ageErr")||{}).textContent,err:document.querySelector("#meErr").textContent,saved:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age}));
   ok(inv.ids.join()==="me_age,me_taille,me_poids,me_fcmax"&&inv.f==="me_age","P3 4 erreurs signalées (aria-invalid), focus sur la première",inv);
   ok(/15 ans et plus/.test(inv.age)&&/4 champs à corriger/.test(inv.err)&&inv.saved===35,"P3 âge < 15 refusé, rien d'enregistré",inv);
   ok(await p.evaluate(()=>document.querySelector("#me_age").getAttribute("aria-describedby").includes("me_ageErr")),"P3 message relié au champ (aria-describedby)");
   await p.fill("#me_age","16"); ok(await p.evaluate(()=>!document.querySelector("#meMinor").hidden),"P3 âge 15-17 : avertissement « moins de 18 ans »");
   await p.fill("#me_age","36"); await p.fill("#me_taille","180"); await p.fill("#me_poids","79,5"); await p.fill("#me_fcmax","188"); await p.fill("#me_mg",""); await p.check("#meForm input[value=F]",{force:true}); await p.click("#meSave"); await p.waitForTimeout(400);
   const sv=await p.evaluate(()=>({p:JSON.parse(localStorage.getItem("carnet-course.v1")).profile,f:document.activeElement.id,form:!!document.querySelector("#meForm"),age:document.querySelector("#age").value,toast:document.querySelector("#toasts").textContent}));
   ok(sv.p.age==="36"&&sv.p.taille==="180"&&sv.p.poids==="79.5"&&sv.p.fcmax==="188"&&sv.p.sexe==="F"&&sv.p.mg===""&&!sv.form,"P3 enregistrement : profil mis à jour, formulaire refermé",sv);
   ok(sv.age==="36"&&sv.f==="meEditB"&&/enregistrées/.test(sv.toast),"P3 onglet Profil synchronisé, focus rendu, confirmation",sv);
   await p.click("#meEditB"); await p.fill("#me_age","50"); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!document.getElementById("me").hidden&&!document.querySelector("#meForm")&&JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age==="36"),"P3 Échap pendant la saisie : annule la modification, la page reste ouverte");
   await p.click("#meEditB"); await p.evaluate(()=>{ document.querySelector("#me_age").value="3".repeat(40); }); await p.click("#meSave"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>document.querySelector("#me_age").getAttribute("aria-invalid")==="true"&&JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age==="36"),"P3 valeur forcée hors longueur (script) refusée");
   await p.click('#me [data-me="cancel"]');
   // passage de mineur à majeur : confirmation explicite avant d\x27enregistrer
   await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem("carnet-course.v1")); d.profile.age="17"; localStorage.setItem("carnet-course.v1",JSON.stringify(d)); }); await p.reload(); await p.waitForTimeout(900); await open(p);
   await p.click("#meEditB"); await p.fill("#me_age","18"); await p.click("#meSave"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>/18 ans ou plus/.test(document.querySelector("#meErr").textContent)&&JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age==="17"),"P3 17 → 18 ans : confirmation demandée, rien d\x27enregistré");
   await p.click("#meSave"); await p.waitForTimeout(300); ok(await p.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age==="18"),"P3 second appui : âge enregistré");
   await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem("carnet-course.v1")); d.profile.age="36"; localStorage.setItem("carnet-course.v1",JSON.stringify(d)); }); await p.reload(); await p.waitForTimeout(900); await open(p);

   // P4 mode discret : valeurs masquées (texte remplacé), réglage gardé sur l'appareil
   await p.click("#mePriv"); await p.waitForTimeout(150);
   const dq=await p.evaluate(()=>({pr:document.querySelector("#mePriv").getAttribute("aria-pressed"),txt:document.querySelector("#meInfo").textContent+document.querySelector("#meStats").textContent,ls:localStorage.getItem("carnet.discret")}));
   ok(dq.pr==="true"&&dq.ls==="1"&&!/36 ans|180 cm|79,5 kg|−1,6 kg/.test(dq.txt)&&/•••/.test(dq.txt),"P4 mode discret : âge, taille, poids et évolution masqués",dq);
   await p.click("#mePriv"); ok(await p.evaluate(()=>localStorage.getItem("carnet.discret")==="0"&&/36 ans/.test(document.querySelector("#meInfo").textContent)),"P4 mode discret retiré");

   // P5 une confirmation ouverte depuis la page : feuille par-dessus, Échap la ferme, la page reste, focus rendu
   await p.click("#me [data-acc=erase]"); await p.waitForTimeout(200); ok(await p.evaluate(()=>!!document.querySelector('.sheet[data-kind="erase"]')),"P5 « Effacer mes données » : confirmation en feuille");
   await p.keyboard.press("Escape"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!document.querySelector(".sheet")&&!document.getElementById("me").hidden&&document.activeElement.dataset.acc==="erase"),"P5 Échap : feuille fermée, page conservée, focus sur l'action");

   // P6 retour : bouton Retour, puis retour du navigateur, puis Échap
   await p.click('#me [data-me="back"]'); await p.waitForTimeout(250);
   const p6=await p.evaluate(()=>({me:document.getElementById("me").hidden,wrap:!document.querySelector(".wrap").hidden,f:document.activeElement.className+"#"+document.activeElement.id,h:history.state})); ok(p6.me&&p6.wrap&&/av/.test(p6.f)&&!(p6.h&&p6.h.pbMe),"P6 « Retour » : application, focus sur l'avatar, historique nettoyé",p6);
   await open(p); await p.goBack(); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>document.getElementById("me").hidden&&!document.querySelector(".wrap").hidden&&/\/$/.test(location.pathname)),"P6 retour du navigateur : la page se ferme sans quitter le site");
   await open(p); await p.keyboard.press("Escape"); await p.waitForTimeout(250);
   ok(await p.evaluate(()=>document.getElementById("me").hidden&&!document.querySelector(".wrap").hidden),"P6 Échap ferme la page");

   // P7 « Ouvrir mes réglages » : onglet Profil
   await open(p); await p.click('#me [data-me="settings"]'); await p.waitForTimeout(250);
   ok(await p.evaluate(()=>document.getElementById("me").hidden&&document.querySelector("#tab-profil").getAttribute("aria-selected")==="true"&&!document.getElementById("p-profil").hidden),"P7 lien vers les réglages : onglet Profil");
   ok((await p.evaluate(()=>window.__csp)).length===0,"P7 aucune violation de CSP"); await p.ctx.close(); }

 // P8 nom venu du fournisseur : toujours échappé ; masqué en mode discret (initiale comprise)
 { const SC=await L.serve({"/config.js":L.cfgJs()}); const db=L.makeDb(); const PEND=JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()});
   const ctx=await b.newContext({viewport:{width:390,height:844},locale:"fr-FR"}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push("PE "+e.message));
   await L.fake(p,db,{session:L.SESSION("u-x",`<img src=x onerror="window.__xss=1">Zoé`)});
   await p.addInitScript(({seed,PEND})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.consent",PEND); } },{seed:data(),PEND});
   await p.goto(SC.url+"/"); await p.waitForTimeout(1500); await open(p);
   const r=await p.evaluate(()=>({img:document.querySelectorAll("#me img").length,xss:!!window.__xss,nm:(document.querySelector(".me-nm")||{}).textContent||"",acc:[...document.querySelectorAll("#me [data-acc]")].map(x=>x.dataset.acc).join()}));
   ok(r.img===0&&!r.xss&&/<img/.test(r.nm),"P8 nom du fournisseur affiché comme du texte (aucune balise interprétée)",r);
   ok(/signout/.test(r.acc)&&/withdraw/.test(r.acc)&&/delacct/.test(r.acc)&&/export/.test(r.acc),"P8 connecté : actions de session et de compte présentes",r);
   await p.click("#mePriv"); await p.waitForTimeout(150);
   ok(await p.evaluate(()=>!/Zoé|img/.test(document.querySelector("#meId").textContent+document.querySelector("#meAcct .acc-st").textContent)),"P8 mode discret : nom et initiale masqués");
   await ctx.close(); }

 // P9 données d'exemple : pas de stats inventées, pas de modification, invitation à créer le plan
 { const p=await mk(S,{}); await p.evaluate(()=>{ const x=document.querySelector("[data-act=example]"); if(x) x.click(); }); await p.waitForTimeout(200); await open(p);
   const r=await p.evaluate(()=>({stats:document.querySelectorAll("#meStats .stat").length,cta:!!document.querySelector('#meStats [data-me="wizard"]'),edit:document.querySelector("#meEditB").hidden}));
   ok(r.stats===0&&r.cta&&r.edit,"P9 exemple : aucune stat, bouton « Créer mon plan », pas de modification",r);
   await p.click('#meStats [data-me="wizard"]'); await p.waitForTimeout(250);
   ok(await p.evaluate(()=>!document.getElementById("wiz").hidden&&document.getElementById("me").inert),"P9 l'assistant s'ouvre, la page derrière est inerte"); await p.ctx.close(); }

 // P10 petit écran (320 px) : pas de défilement horizontal, cibles tactiles d'au moins 36 px
 { const p=await mk(S,{seed:data(),width:320}); await open(p);
   const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,small:[...document.querySelectorAll("#me button:not([hidden]),#me a")].filter(x=>x.getClientRects().length&&!x.closest(".legalnav")&&!x.closest(".me-more")&&x.getBoundingClientRect().height<36).map(x=>x.textContent.trim().slice(0,30))}));
   ok(r.sw<=r.cw,"P10 320 px : aucun débordement horizontal",r); ok(r.small.length===0,"P10 boutons assez grands",r.small); await p.ctx.close(); }

 ok(E.length===0,"aucune erreur JavaScript ni avertissement",E.slice(0,5));
 await b.close(); console.log(fails? fails+" échec(s)" : "Tout est OK"); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
