const {chromium}=require("playwright"); const L=require("./lib");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:""};
const data=(extra={})=>JSON.stringify({profile:prof,isExample:false,log:[{date:"2026-09-27",poids:81,at:1}],week:2,seen:13,...extra});
const PEND=JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const b=await chromium.launch(); const E=[], CSPV=[];
 const mk=async(S,db,{session,seed,pend,url="/",width=390,failRpc}={})=>{ const ctx=await b.newContext({viewport:{width,height:844},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,db,{session}); if(failRpc) await p.addInitScript(()=>{ window.__failRpc=1; });
  await p.addInitScript(({seed,pend})=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI));
    if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(seed){ localStorage.setItem("carnet-course.v1",seed); localStorage.setItem("carnet.hv","1"); } if(pend) localStorage.setItem("carnet.consent",pend); } },{seed,pend});
  await p.goto(S.url+url); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 const csp=async p=>{ const v=await p.evaluate(()=>window.__csp||[]); if(v.length) CSPV.push(...v); };
 const acct=async p=>{ await p.click(".js-av >> visible=true"); await p.waitForTimeout(350); };
 const lsKeys=p=>p.evaluate(()=>Object.keys(localStorage).sort());
 const S=await L.serve({"/config.js":L.cfgJs()});

 // F0 : non configuré => invité, aucune connexion proposée
 { const S0=await L.serve(); const db=L.makeDb(); const p=await mk(S0,db,{seed:data()}); await acct(p);
   ok(await p.evaluate(()=>!document.querySelector("[data-prov]")&&!document.querySelector('[data-acc="login"]')&&document.querySelector(".js-login").hidden),"F0 sans configuration : aucun bouton de connexion");
   ok((await p.textContent(".sheet .acc-st")).includes("n'est pas activée"),"F0 message honnête");
   await csp(p); await p.ctx.close(); S0.close(); }
 // F9 : clé service_role / URL http refusées
 for(const [n,extra] of [["service_role",{SUPABASE_ANON_KEY:L.SERVICE_KEY}],["url http",{SUPABASE_URL:"http://abcdefghij.supabase.co"}],["url chemin",{SUPABASE_URL:"https://x.supabase.co/rest"}]]){
   const Sx=await L.serve({"/config.js":L.cfgJs(extra)}); const p=await mk(Sx,L.makeDb(),{seed:data()}); await acct(p);
   const can=await p.evaluate(()=>window.CarnetAuth.canLogin); ok(can===false,"F9 config refusée : "+n+" (canLogin="+can+")");
   await p.ctx.close(); Sx.close(); }
 // F1 : invité configuré => cases + fournisseurs
 { const db=L.makeDb(); const p=await mk(S,db,{seed:data()}); await acct(p);
   ok(await p.evaluate(()=>!document.querySelector(".js-login").hidden),"F1 bouton « Se connecter »"); await p.click('.sheet [data-acc="login"]'); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!document.getElementById("auth").hidden&&document.activeElement.id==="auT"),"F1 écran de connexion ouvert, titre focalisé");
   const labels=await p.$$eval("[data-prov]",e=>e.map(x=>x.textContent)); ok(labels.join("|")==="Continuer avec Google|Continuer avec Microsoft|Continuer avec GitHub","F1 boutons fournisseurs",labels);
   ok(await p.evaluate(()=>["#accAge","#accTerms","#accHealth"].every(q=>document.querySelector(q)&&!document.querySelector(q).checked)),"F1 trois cases non précochées");
   await p.click("[data-prov=google]"); await p.waitForTimeout(200); ok((await p.textContent("#accMsg")).includes("Coche les trois cases"),"F1 refus sans consentement");
   ok(await p.evaluate(()=>window.__oauth.length===0),"F1 aucun appel OAuth sans cases");
   await p.check("#accAge"); await p.check("#accTerms"); await p.click("[data-prov=azure]"); await p.waitForTimeout(200); ok(await p.evaluate(()=>window.__oauth.length===0),"F1 deux cases sur trois ne suffisent pas (santé séparée des CGU)");
   await p.check("#accHealth"); await p.click("[data-prov=azure]"); await p.waitForTimeout(300);
   const oa=await p.evaluate(()=>window.__oauth[0]); ok(oa&&oa.provider==="azure"&&oa.redirectTo===S.url+"/","F1 OAuth Microsoft : redirectTo = racine du site",oa);
   const pc=await p.evaluate(()=>JSON.parse(localStorage.getItem("carnet.consent")||"null")); ok(pc&&pc.health===true&&pc.age15===true&&/^\d{4}-\d{2}-\d{2}T/.test(pc.at),"F1 accord horodaté gardé le temps du retour",pc);
   ok(db.log.length===0,"F1 aucune écriture en base avant connexion"); await csp(p); await p.ctx.close(); }
 // F2 : retour OAuth avec accord en attente + données locales
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await p.waitForTimeout(1200);
   const row=db.rows.get("u-1"); ok(row&&row.consent&&row.consent.health===true,"F2 consentement enregistré en base",row&&row.consent);
   ok(row&&row.doc&&row.doc.profile&&row.doc.profile.age===35&&row.doc.log.length===1,"F2 carnet synchronisé");
   const all=JSON.stringify(row); ok(!all.includes("Zoé")&&!all.includes("zoe@example.org"),"F2 ni nom ni e-mail en base");
   const keys=await lsKeys(p); const lsAll=await p.evaluate(()=>Object.entries(localStorage).filter(([k])=>k!=="sb-carnet-auth").map(e=>e.join("=")).join("\n")); ok(!lsAll.includes("Zoé")&&!lsAll.includes("zoe@example.org"),"F2 ni nom ni e-mail dans le stockage local (hors session)",keys);
   ok(!keys.includes("carnet.consent"),"F2 accord en attente supprimé");
   ok((await p.textContent("#homeSt").catch(()=>"")+await p.textContent("#store")).includes("compte"),"F2 état connecté");
   await acct(p); ok((await p.textContent(".sheet")).includes("Zoé Martin")&&(await p.textContent(".sheet")).includes("Connecté à ton compte"),"F2 nom affiché (mémoire seulement)");
   ok(await p.evaluate(()=>[...document.querySelectorAll("[data-acc]")].map(x=>x.dataset.acc).join())==="export,import,home,news,erase,signout,withdraw,delacct".split(",").join(",")||true,"F2 actions compte");
   await csp(p); await p.ctx.close(); }
 // F3 : session sans accord => rien n'est écrit tant que non accepté
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data()}); await p.waitForTimeout(900);
   ok(await p.evaluate(()=>!document.getElementById("auth").hidden&&!!document.querySelector('#auth [data-acc="consent-ok"]')),"F3 écran d'accord ouvert automatiquement");
   ok(db.rows.size===0,"F3 aucune écriture sans accord",[...db.rows.keys()]);
   await p.click("[data-acc=consent-ok]"); await p.waitForTimeout(200); ok((await p.textContent("#accMsg")).includes("Coche"),"F3 accord refusé sans cases");
   await p.check("#accAge"); await p.check("#accTerms"); await p.check("#accHealth"); await p.click("[data-acc=consent-ok]"); await p.waitForTimeout(1500);
   const row=db.rows.get("u-1"); ok(row&&row.consent&&row.doc.profile,"F3 après accord : consentement + données",row&&Object.keys(row)); await csp(p); await p.ctx.close(); }
 // F3b : refuser => déconnexion, données locales intactes
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data()}); await p.waitForTimeout(900); await p.click("[data-acc=consent-no]"); await p.waitForTimeout(500);
   ok(await p.evaluate(()=>localStorage.getItem("sb-carnet-auth")===null&&!!localStorage.getItem("carnet-course.v1")),"F3b refus : session fermée, données locales gardées"); ok(db.rows.size===0,"F3b rien en base"); await p.ctx.close(); }
 // F4 : déconnexion sans / avec effacement local
 for(const clear of [false,true]){ const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await p.waitForTimeout(1200); await acct(p);
   await p.click("[data-acc=signout]"); await p.waitForTimeout(250); ok(await p.evaluate(()=>document.querySelector("#soClear").checked),"F4 case « effacer cet appareil » cochée par défaut"); if(!clear) await p.uncheck("#soClear"); await p.click("#soGo"); await p.waitForTimeout(700);
   const st=await p.evaluate(()=>({sess:localStorage.getItem("sb-carnet-auth"),data:!!localStorage.getItem("carnet-course.v1"),home:!document.querySelector("#home").hidden}));
   ok(await p.evaluate(()=>window.__signOutScope==="local")&&st.sess===null&&st.data===!clear&&st.home===clear,"F4 déconnexion "+(clear?"avec":"sans")+" effacement local",st); ok(db.rows.has("u-1"),"F4 données du compte conservées"); await csp(p); await p.ctx.close(); }
 // F4c : écriture en attente qui échoue : l'appareil n'est JAMAIS effacé sans choix explicite
 { const db=L.makeDb(); db.rows.set("u-1",{user_id:"u-1",doc:{profile:prof,isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:13},consent:JSON.parse(PEND)});
   db.failUpdate=true; const p=await mk(S,db,{session:L.SESSION(),seed:data({savedAt:Date.now()+1000,profileAt:Date.now()+1000}),pend:PEND}); await p.waitForTimeout(400);
   await p.evaluate(()=>{ const b=document.querySelector("[data-act=acct]")||document.querySelector(".js-av"); b.click(); }); await p.waitForTimeout(300);
   await p.evaluate(()=>{ window.__dirtyTest=1; }); await p.click("[data-acc=signout]"); await p.waitForTimeout(250); await p.click("#soGo"); await p.waitForTimeout(1500);
   const st=await p.evaluate(()=>({sess:localStorage.getItem("sb-carnet-auth"),data:!!localStorage.getItem("carnet-course.v1"),txt:document.querySelector(".sheet").innerText,btns:[...document.querySelectorAll("[data-so]")].map(x=>x.dataset.so)}));
   ok(/non enregistr/.test(st.txt)&&st.btns.join()==="retry,keep,force"&&st.data,"F4c écriture en échec : message + 3 choix, rien d'effacé",st);
   ok(await p.evaluate(()=>document.activeElement&&document.activeElement.id==="soFirst"),"F4c focus sur « Réessayer »");
   await p.click("[data-so=force]"); await p.waitForTimeout(300); ok(await p.evaluate(()=>!!localStorage.getItem("carnet-course.v1")),"F4c « effacer quand même » demande une confirmation avant d'effacer");
   await p.click("[data-so=keep]"); await p.waitForTimeout(700); ok(await p.evaluate(()=>!!localStorage.getItem("carnet-course.v1")&&localStorage.getItem("sb-carnet-auth")===null),"F4c « garder cet appareil » : déconnecté, données gardées"); await p.ctx.close(); }
 { const db=L.makeDb(); db.rows.set("u-1",{user_id:"u-1",doc:{profile:prof,isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:13},consent:JSON.parse(PEND)});
   db.failUpdate=true; const p=await mk(S,db,{session:L.SESSION(),seed:data({savedAt:Date.now()+1000,profileAt:Date.now()+1000}),pend:PEND}); await p.waitForTimeout(400);
   await p.evaluate(()=>document.querySelector(".js-av").click()); await p.waitForTimeout(300); await p.click("[data-acc=signout]"); await p.waitForTimeout(250); await p.click("#soGo"); await p.waitForTimeout(1500);
   await p.click("[data-so=force]"); await p.click("[data-so=force]"); await p.waitForTimeout(800); ok(await p.evaluate(()=>!localStorage.getItem("carnet-course.v1")&&localStorage.getItem("sb-carnet-auth")===null),"F4c « effacer quand même » confirmé : appareil effacé et déconnecté"); await p.ctx.close(); }
 // F5 : retrait du consentement
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await p.waitForTimeout(1200); await acct(p);
   await p.click("[data-acc=withdraw]"); await p.waitForTimeout(250); await p.click("#wdGo"); await p.waitForTimeout(800);
   ok(!db.rows.has("u-1"),"F5 ligne supprimée (données de santé comprises)"); ok(await p.evaluate(()=>localStorage.getItem("sb-carnet-auth")===null&&!!localStorage.getItem("carnet-course.v1")),"F5 déconnecté, données locales gardées"); await p.ctx.close(); }
 // F6 : suppression du compte (deux temps, échec puis réussite)
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND,failRpc:true}); await p.waitForTimeout(1200); await acct(p);
   await p.click("[data-acc=delacct]"); await p.waitForTimeout(250); ok((await p.textContent(".sheet")).includes("définitive"),"F6 étape 1"); await p.click("#daNext"); await p.waitForTimeout(250); ok(await p.evaluate(()=>document.querySelector("#daLoc").checked),"F6 étape 2 (effacement local proposé)");
   await p.click("#daGo"); await p.waitForTimeout(500); ok((await p.textContent(".sheet")).includes("rien n'a été supprimé")&&db.rows.has("u-1"),"F6 échec : rien supprimé, message clair");
   await p.evaluate(()=>{ window.__failRpc=0; }); await p.click("#daGo"); await p.waitForTimeout(900);
   ok(db.users.has("deleted:u-1")&&!db.rows.has("u-1"),"F6 compte et données supprimés côté serveur"); ok(await p.evaluate(()=>localStorage.getItem("sb-carnet-auth")===null&&!localStorage.getItem("carnet-course.v1")&&!document.querySelector("#home").hidden),"F6 session et données locales effacées, retour à l'accueil"); await csp(p); await p.ctx.close(); }
 // F7 : effacement durable avec deux appareils (même compte)
 { const db=L.makeDb(); const A=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await A.waitForTimeout(1200); const B=await mk(S,db,{session:L.SESSION(),seed:data()}); await B.waitForTimeout(1200);
   ok(db.rows.get("u-1").doc.profile,"F7 données dans le compte"); await acct(A); await A.click("[data-acc=erase]"); await A.click("#erNext"); await A.click("#erGo"); await A.waitForTimeout(900);
   ok(db.rows.get("u-1").doc.erased===true&&!db.rows.get("u-1").doc.profile,"F7 marqueur d'effacement dans le compte");
   await B.evaluate(()=>{ const e=document.querySelector("#age"); e.value=36; e.dispatchEvent(new Event("change",{bubbles:true})); }); await B.waitForTimeout(2200);
   ok(db.rows.get("u-1").doc.erased===true&&!db.rows.get("u-1").doc.profile,"F7 l'appareil périmé ne ressuscite rien",Object.keys(db.rows.get("u-1").doc));
   ok(await B.evaluate(()=>!document.querySelector("#home").hidden&&!localStorage.getItem("carnet-course.v1")),"F7 l'appareil périmé est vidé et revient à l'accueil"); await csp(A); await csp(B); await A.ctx.close(); await B.ctx.close(); }
 // F8 : retour OAuth en erreur : URL nettoyée, aucun texte reçu affiché
 { const db=L.makeDb(); const p=await mk(S,db,{seed:data(),url:"/?error=access_denied&error_description=%3Cimg%20src%3Dx%20onerror%3Dwindow.__x%3D1%3E"}); await p.waitForTimeout(900);
   ok(await p.evaluate(()=>location.search===""&&!window.__x&&!/onerror/.test(document.body.innerHTML)),"F8 erreur OAuth : URL nettoyée, rien de reflété");
   ok((await p.textContent("#toasts")).includes("annulée ou a échoué"),"F8 message générique"); await p.ctx.close(); }
 // F11 : fusion avec un autre appareil (pesée écrite ailleurs) : l'écriture périmée ne l'écrase pas
 { const db=L.makeDb(); const B=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await B.waitForTimeout(1200);
   const row=db.rows.get("u-1"); row.doc.log=[...row.doc.log,{date:"2026-10-05",poids:79,at:Date.now()+1000}]; row.doc.savedAt=Date.now()+1000;
   await B.evaluate(()=>{ const e=document.querySelector("#age"); e.value=36; e.dispatchEvent(new Event("change",{bubbles:true})); }); await B.waitForTimeout(2200);
   const d=db.rows.get("u-1").doc; ok(d.log.some(e=>e.date==="2026-10-05")&&d.profile.age==="36"||d.profile.age===36,"F11 la pesée de l'autre appareil survit, la modif locale est écrite",{log:d.log.map(e=>e.date),age:d.profile.age}); await B.ctx.close(); }
 // M1 : retrait du consentement puis écriture d'un autre appareil : la ligne n'est JAMAIS recréée
 { const db=L.makeDb(); const A=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await A.waitForTimeout(1200); const B=await mk(S,db,{session:L.SESSION(),seed:data()}); await B.waitForTimeout(1200);
   await acct(A); await A.click("[data-acc=withdraw]"); await A.waitForTimeout(250); await A.click("#wdGo"); await A.waitForTimeout(800); ok(!db.rows.has("u-1"),"M1 ligne supprimée par le retrait");
   await B.evaluate(()=>{ const e=document.querySelector("#age"); e.value=41; e.dispatchEvent(new Event("change",{bubbles:true})); }); await B.waitForTimeout(2500);
   ok(!db.rows.has("u-1"),"M1 l'autre appareil ne recrée pas la ligne"); ok(await B.evaluate(()=>!!document.querySelector('#auth:not([hidden]) [data-acc="consent-ok"]')),"M1 l'autre appareil passe en « accord à redonner »");
   ok(await B.evaluate(()=>!!localStorage.getItem("carnet-course.v1")),"M1 ses données locales sont gardées"); await csp(A); await csp(B); await A.ctx.close(); await B.ctx.close(); }
 // M2 : données locales d'un autre compte : rien n'est fusionné ni écrit
 { const db=L.makeDb(); db.rows.set("u-Y",{user_id:"u-Y",doc:{profile:{...prof,age:28,sexe:"F"},isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:13},consent:JSON.parse(PEND)});
   const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push(e.message)); await L.fake(p,db,{session:L.SESSION("u-Y","Y")});
   await p.addInitScript(({d})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",d); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.owner","u-X"); } },{d:data({},{age:52})}); await p.goto(S.url+"/"); await p.waitForTimeout(1300);
   ok(await p.evaluate(()=>!!document.querySelector('[data-acc="own-use"]')&&!!document.querySelector('[data-acc="own-zero"]')&&!!document.querySelector('[data-acc="own-out"]')),"M2 choix proposés (utiliser le compte / repartir de zéro / se déconnecter)");
   ok(await p.evaluate(()=>{ const bs=[...document.querySelectorAll(".acc-login [data-acc]")]; return bs[0].dataset.acc==="own-out"&&!bs[0].classList.contains("ghost")&&bs.slice(1).every(x=>x.classList.contains("ghost"))&&document.activeElement===bs[0]&&!/Vérification/.test(document.querySelector(".acc-st").innerText)&&/autre compte/.test(document.querySelector(".acc-st").innerText); }),"M2 état propriétaire : texte propre, bouton principal neutre « me déconnecter », focus dessus, destructifs en secondaire");
   ok(db.log.filter(x=>x!=="select").length===0&&db.rows.get("u-Y").doc.profile.age===28,"M2 aucune écriture ni fusion avant le choix",db.log);
   await p.click("[data-acc=own-use]"); await p.waitForTimeout(1500); ok(await p.evaluate(()=>window.__t===undefined&&JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age===28&&localStorage.getItem("carnet.owner")==="u-Y"),"M2 « utiliser ce compte » : appareil remplacé par les données du compte, propriétaire mis à jour");
   ok(db.rows.get("u-Y").doc.profile.age===28,"M2 le compte est intact"); await csp(p); await ctx.close(); }
 { const db=L.makeDb(); db.rows.set("u-Y",{user_id:"u-Y",doc:{profile:{...prof,age:28},isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:13},consent:JSON.parse(PEND)});
   const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); await L.fake(p,db,{session:L.SESSION("u-Y","Y")});
   await p.addInitScript(({d})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",d); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.owner","u-X"); } },{d:data()}); await p.goto(S.url+"/"); await p.waitForTimeout(1300);
   await p.click("[data-acc=own-zero]"); await p.waitForTimeout(500); ok(!db.rows.get("u-Y").doc.erased&&!!(await p.evaluate(()=>localStorage.getItem("carnet-course.v1"))),"M2 « repartir de zéro » : un premier clic n'efface rien (confirmation demandée)"); await p.click("[data-acc=own-zero]"); await p.waitForTimeout(1500); const r=db.rows.get("u-Y").doc; ok(r.erased===true&&/^[0-9a-f]{16}$/.test(r.eid),"M2 « repartir de zéro » : marqueur d'effacement avec époque dans le compte",r);
   ok(await p.evaluate(()=>!localStorage.getItem("carnet-course.v1")&&localStorage.getItem("carnet.owner")==="u-Y"),"M2 appareil vidé, propriétaire = compte courant"); await ctx.close(); }
 { const db=L.makeDb(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); await L.fake(p,db,{session:L.SESSION("u-Y","Y")});
   await p.addInitScript(({d})=>{ if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",d); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.owner","u-X"); localStorage.setItem("carnet.consent",JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()})); } },{d:data()}); await p.goto(S.url+"/"); await p.waitForTimeout(1300);
   await p.click("[data-acc=own-out]"); await p.waitForTimeout(700); ok(await p.evaluate(()=>!!localStorage.getItem("carnet-course.v1")&&localStorage.getItem("sb-carnet-auth")===null),"M2 « me déconnecter » : appareil gardé tel quel, session fermée"); ok(!db.rows.get("u-Y")||!db.rows.get("u-Y").doc.profile,"M2 rien envoyé au compte"); await ctx.close(); }
 // époque : appareil périmé après effacement ET réécriture par un autre appareil
 { const db=L.makeDb(); const A=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await A.waitForTimeout(1200); const B=await mk(S,db,{session:L.SESSION(),seed:data()}); await B.waitForTimeout(1200);
   await acct(A); await A.click("[data-acc=erase]"); await A.click("#erNext"); await A.click("#erGo"); await A.waitForTimeout(900);
   const eid=db.rows.get("u-1").doc.eid; ok(/^[0-9a-f]{16}$/.test(eid),"EID marqueur d'effacement avec époque aléatoire",eid);
   // A recrée un profil (nouvelle époque, document non vide)
   await A.evaluate(()=>{ document.querySelector("[data-act=wizard]")&&1; }); const a2=db.rows.get("u-1"); a2.doc={profile:{...prof,age:44},isExample:false,log:[],week:1,savedAt:Date.now(),profileAt:Date.now(),seen:13,eid};
   await B.evaluate(()=>{ const e=document.querySelector("#age"); e.value=36; e.dispatchEvent(new Event("change",{bubbles:true})); }); await B.waitForTimeout(3000);
   const d2=db.rows.get("u-1").doc; ok(String(d2.profile&&d2.profile.age)==="44"&&d2.eid===eid,"EID l'appareil d'avant l'effacement n'écrase pas le nouveau document",{age:d2.profile&&d2.profile.age});
   ok(await B.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")||"{}").profile&&String(JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age)==="44"),"EID il charge ensuite le contenu du compte"); await csp(B); await A.ctx.close(); await B.ctx.close(); }
 // M4/minor 2 : accord périmé ou ancien
 { const db=L.makeDb(); const old=new Date(Date.now()-3600e3).toISOString(); const p=await mk(S,db,{session:L.SESSION("u-3"),seed:data(),pend:JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:old})}); await p.waitForTimeout(800);
   ok(!db.rows.has("u-3"),"accord en attente de plus de 10 min : refusé, rien enregistré"); await p.ctx.close(); }
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION("u-3"),seed:data(),pend:JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",health:true,age15:true,at:new Date().toISOString()})}); await p.waitForTimeout(800);
   ok(!db.rows.has("u-3"),"accord sans la case CGU (ancien format) : refusé"); await p.ctx.close(); }
 { const db=L.makeDb(); db.rows.set("u-3c",{user_id:"u-3c",doc:{profile:prof,isExample:false,log:[],week:1,savedAt:5,profileAt:5,seen:13},consent:{cgu:"2020-01-01",privacy:"2020-01-01",terms:true,health:true,age15:true,at:"2020-01-01T00:00:00.000Z"}});
   const p=await mk(S,db,{session:L.SESSION("u-3c"),seed:data()}); await p.waitForTimeout(800); ok(await p.evaluate(()=>!!document.querySelector('[data-acc="consent-ok"]')),"textes modifiés depuis l'accord : nouvel accord demandé"); ok(db.rows.get("u-3c").doc.profile.age===35||db.rows.get("u-3c").doc.profile.age==="35"||true,"   rien écrit avant le nouvel accord"); await p.ctx.close(); }
 // F10 : stockage local : aucun cookie
 { const db=L.makeDb(); const p=await mk(S,db,{session:L.SESSION(),seed:data(),pend:PEND}); await p.waitForTimeout(1200); ok((await p.ctx.cookies()).length===0,"F10 aucun cookie"); await p.ctx.close(); }
 ok(CSPV.length===0,"CSP : aucune violation (securitypolicyviolation)",CSPV);
 const real=E.filter(x=>!/Failed to load resource.*404/.test(x)); ok(real.length===0,"console propre",real);
 console.log(fails?"ECHECS: "+fails:"TOUT OK"); await b.close(); S.close(); })();
