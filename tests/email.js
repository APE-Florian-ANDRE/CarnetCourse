// compte par e-mail et mot de passe : création, confirmation, connexion, erreurs traduites, consentement exigé, mot de passe oublié (faux Supabase, aucun réseau)
const {chromium}=require("playwright"); const L=require("./lib");
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const b=await chromium.launch(); const E=[];
 const S=await L.serve({"/config.js":L.cfgJs({EMAIL_LOGIN:true})});
 const mk=async(init)=>{ const ctx=await b.newContext({viewport:{width:390,height:844},locale:"fr-FR"}); const p=await ctx.newPage();
   p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(m.type()==="error") E.push(m.text().slice(0,160)); });
   await L.fake(p,L.makeDb()); if(init) await p.addInitScript(init); await p.goto(S.url+"/"); await p.waitForTimeout(700); return p; };
 const open=async p=>{ await p.evaluate(()=>document.querySelector(".js-login:not([hidden])").click()); await p.waitForTimeout(300); };
 const tick=p=>p.evaluate(()=>{ for(const id of ["accAge","accTerms","accHealth"]){ const c=document.getElementById(id); if(!c.checked) c.click(); } });
 const fill=async(p,email,pw)=>{ await p.fill("#auEmail",email); await p.fill("#auPw",pw); };
 const msg=p=>p.evaluate(()=>document.querySelector("#accMsg").textContent.trim());
 // M1 : formulaire visible, mode création par défaut
 let p=await mk(); await open(p);
 ok(await p.evaluate(()=>!document.querySelector("#auMail").hidden&&document.querySelector("[data-mm=signup]").getAttribute("aria-pressed")==="true"&&document.querySelector("#auPw").autocomplete==="new-password"&&document.querySelector("#auForgot").hidden),"M1 formulaire e-mail affiché (création de compte, new-password, pas de « mot de passe oublié »)");
 // M2 : pas de cases avant la connexion (accord demandé une fois, ensuite)
 ok(await p.evaluate(()=>document.querySelector("#auCons").hidden&&!document.querySelector("#auTos").hidden),"M2 écran court : pas de cases avant, CGU rappelées");
 await fill(p,"pas-une-adresse","unephrasedepasse"); await p.click("#auGo"); await p.waitForTimeout(150);
 ok(/pas valide/.test(await msg(p))&&!(await p.evaluate(()=>window.__mail)),"M3 adresse invalide refusée sans appel");
 await fill(p,"zoe@example.org","court"); await p.click("#auGo"); await p.waitForTimeout(150);
 ok(/8 caractères/.test(await msg(p))&&!(await p.evaluate(()=>window.__mail)),"M4 mot de passe trop court refusé sans appel");
 // M5 : création sans confirmation e-mail => connecté, accord enregistré
 await fill(p,"zoe@example.org","unephrasedepasse"); await p.click("#auGo"); await p.waitForTimeout(900);
 ok(await p.evaluate(()=>window.__mail[0].op==="signUp"&&window.__mail[0].redirect===location.origin+"/"),"M5 compte créé, lien de retour = ce site");
 ok(await p.evaluate(()=>!document.getElementById("auth").hidden&&!!document.querySelector('#auth [data-acc="consent-ok"]')&&!document.querySelector("#auCons").hidden),"M5 première connexion : écran « Dernière étape » avec les trois cases");
 await tick(p); await p.click("[data-acc=consent-ok]"); await p.waitForTimeout(900);
 ok(await p.evaluate(()=>document.querySelector(".js-av").dataset.st==="connected"),"M5 accord donné : connecté, sauvegarde active");
 ok(await p.evaluate(()=>!document.querySelector("#auPw")||document.querySelector("#auPw").value===""),"M5 mot de passe effacé du champ");
 // M6 : session gardée après rechargement
 await p.reload(); await p.waitForTimeout(900); ok(await p.evaluate(()=>document.querySelector(".js-av").dataset.st==="connected"),"M6 session gardée après rechargement");
 await p.context().close();
 // M7 : confirmation exigée => message « vérifie ta boîte mail », reste sur l'écran
 p=await mk(()=>{ window.__mailConfirm=1; }); await open(p); await fill(p,"lea@example.org","unephrasedepasse"); await p.click("#auGo"); await p.waitForTimeout(600);
 ok(/boîte mail/.test(await msg(p))&&/lea@example\.org/.test(await msg(p))&&!(await p.evaluate(()=>document.querySelector("#auth").hidden)),"M7 confirmation exigée : message clair, écran ouvert");
 // M8 : connexion avant confirmation => message traduit ; mauvais mot de passe => message générique
 await p.click("[data-mm=signin]"); ok(await p.evaluate(()=>document.querySelector("#auPw").autocomplete==="current-password"&&!document.querySelector("#auForgot").hidden&&/connecter/.test(document.querySelector("#auGo").textContent)),"M8 mode connexion : current-password, « mot de passe oublié » visible");
 await fill(p,"lea@example.org","unephrasedepasse"); await p.click("#auGo"); await p.waitForTimeout(400); ok(/Confirme d'abord/.test(await msg(p)),"M8 adresse non confirmée : message traduit");
 await fill(p,"lea@example.org","mauvais-mot-de-passe"); await p.click("#auGo"); await p.waitForTimeout(400); ok(/incorrect/.test(await msg(p))&&!/Invalid/.test(await msg(p)),"M8 mauvais mot de passe : message traduit, jamais le texte reçu");
 // M9 : mot de passe oublié
 await p.fill("#auEmail",""); await p.click("#auForgot"); await p.waitForTimeout(150); ok(/Saisis d'abord/.test(await msg(p)),"M9 mot de passe oublié sans adresse : message");
 await p.fill("#auEmail","lea@example.org"); await p.click("#auForgot"); await p.waitForTimeout(400);
 ok(/Si un compte existe/.test(await msg(p))&&await p.evaluate(()=>window.__mail.some(m=>m.op==="reset"&&m.redirect===location.origin+"/")),"M9 e-mail de réinitialisation : réponse neutre, lien de retour = ce site");
 await p.context().close();
 // M10 : création désactivée côté Supabase => message traduit
 p=await mk(()=>{ window.__mailDisabled=1; }); await open(p); await fill(p,"max@example.org","unephrasedepasse"); await p.click("#auGo"); await p.waitForTimeout(500);
 ok(/pas encore activée/.test(await msg(p)),"M10 inscription désactivée : message traduit"); await p.context().close();
 // M11 : retour du lien de réinitialisation => feuille « nouveau mot de passe »
 p=await mk(); await p.evaluate(()=>{ localStorage.setItem("sb-carnet-auth",JSON.stringify({user:{id:"u-mail",email:"zoe@example.org",user_metadata:{}},access_token:"m".repeat(20)})); }); await p.reload(); await p.waitForTimeout(900);
 await p.evaluate(()=>window.__sbAuth.__emit("PASSWORD_RECOVERY")); await p.waitForTimeout(600);
 ok(await p.evaluate(()=>{ const s=document.querySelector('.sheet[data-kind="pw"]'); return !!s&&document.activeElement.id==="npw"; }),"M11 lien de réinitialisation : feuille « Nouveau mot de passe », champ focalisé");
 await p.fill("#npw","nouvelle phrase de passe"); await p.click("#npwGo"); await p.waitForTimeout(400);
 ok(await p.evaluate(()=>!document.querySelector('.sheet[data-kind="pw"]')&&window.__mail.some(m=>m.op==="update"&&m.pw==="nouvelle phrase de passe")),"M11 nouveau mot de passe enregistré, feuille fermée"); await p.context().close();
 // M12 : EMAIL_LOGIN absent => pas de formulaire
 { const S2=await L.serve({"/config.js":L.cfgJs()}); const ctx=await b.newContext({viewport:{width:390,height:844}}); const q=await ctx.newPage(); await L.fake(q,L.makeDb()); await q.goto(S2.url+"/"); await q.waitForTimeout(600);
   await q.evaluate(()=>document.querySelector(".js-login:not([hidden])").click()); await q.waitForTimeout(250); ok(await q.evaluate(()=>document.querySelector("#auMail").hidden),"M12 sans EMAIL_LOGIN : formulaire e-mail caché"); await ctx.close(); S2.close(); }
 { const ctx=await b.newContext({viewport:{width:390,height:844}}); const q=await ctx.newPage(); await L.fake(q,L.makeDb()); await q.goto(S.url+"/?code=abc123"); await q.waitForTimeout(1200);
   ok(await q.evaluate(()=>location.search===""&&!document.getElementById("auth").hidden&&document.querySelector("[data-mm=signin]").getAttribute("aria-pressed")==="true"&&/n'a pas pu se terminer/.test(document.querySelector("#toasts").textContent)),"M13 lien ouvert dans un autre navigateur : message clair, connexion par e-mail proposée, URL nettoyée"); await ctx.close(); }
 ok(E.length===0,"aucune erreur console",E);
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); process.exit(fails?1:0); })();
