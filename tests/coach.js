// v15 Coach : faux webhook n8n (réponses normales, lentes, 500, énormes, HTML hostile, JSON invalide, annulation), consentement, JWT, garde-fous santé, mineurs
const {chromium}=require("playwright"); const L=require("./lib"); const http=require("http");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:""};
const seed=(o={})=>JSON.stringify({profile:{...prof,...o.profile},isExample:false,log:[{date:"2026-09-27",poids:81,at:1,sommeil:7,fatigue:2,faites:3,prevues:4,douleur:"non"}],feel:{"2026-10-08":{rpe:7,mood:4,pain:1,zone:"genou",note:"NOTE-SECRETE",at:5}},acts:{"2026-10-07|course|45|0700|800":{date:"2026-10-07",type:"course",min:45,hm:"0700",km:8,kcal:500,fc:150,src:"apple",at:5}},week:2,seen:15});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):"")); };
const JWT="aaaaaaaaaa.bbbbbbbbbb.cccccccccc"; const GOOD={...L.SESSION(),access_token:JWT};
(async()=>{
 // faux webhook : le comportement dépend d'un mot du message
 const hits=[]; const hook=http.createServer((req,res)=>{ const cors={"Access-Control-Allow-Origin":req.headers.origin||"*","Access-Control-Allow-Headers":"content-type, authorization","Access-Control-Allow-Methods":"POST, OPTIONS"};
   if(req.method==="OPTIONS"){ res.writeHead(204,cors); return res.end(); }
   let b=""; req.on("data",c=>b+=c); req.on("end",()=>{ let j={}; try{ j=JSON.parse(b); }catch(e){} hits.push({auth:req.headers.authorization||"",cred:req.headers.cookie||"",ref:req.headers.referer||"",body:j,raw:b});
     const last=((j.messages||[]).slice(-1)[0]||{}).content||""; const send=(st,body,ct="application/json",delay=0)=>setTimeout(()=>{ res.writeHead(st,{...cors,"Content-Type":ct}); res.end(body); },delay);
     if(/bonjour/.test(last)) return send(200,JSON.stringify({reply:"Salut **toi** :\n- un\n- deux\n\nSecond paragraphe avec `code`."}));
     if(/lent/.test(last)) return send(200,JSON.stringify({reply:"Réponse lente."}),undefined,1200);
     if(/bloque/.test(last)) return send(200,JSON.stringify({reply:"jamais"}),undefined,30000);
     if(/err500/.test(last)) return send(500,"<html>stack trace secret</html>","text/html");
     if(/err401/.test(last)) return send(401,JSON.stringify({reply:"non"}));
     if(/err429/.test(last)) return send(429,JSON.stringify({reply:"non"}));
     if(/enorme/.test(last)) return send(200,JSON.stringify({reply:"x".repeat(200000)}));
     if(/long/.test(last)) return send(200,JSON.stringify({reply:"y".repeat(10000)}));
     if(/hostile/.test(last)) return send(200,JSON.stringify({reply:"<img src=x onerror=window.__pwn=1><script>window.__pwn=1</script> [lien](javascript:alert(1)) **gras** <b>b</b>"}));
     if(/invalide/.test(last)) return send(200,"ceci n'est pas du json");
     if(/vide/.test(last)) return send(200,JSON.stringify({}));
     if(/objet/.test(last)) return send(200,JSON.stringify({reply:{a:1}}));
     if(/redirect/.test(last)){ res.writeHead(302,{...cors,Location:"https://evil.example/"}); return res.end(); }
     send(200,JSON.stringify({reply:"ok"})); }); });
 await new Promise(r=>hook.listen(0,"127.0.0.1",r)); const HOOK="http://127.0.0.1:"+hook.address().port+"/webhook/carnet-coach"; L.EXTRA.v=" http://127.0.0.1:"+hook.address().port;
 const b=await chromium.launch(); const E=[], CSPV=[];
 const mk=async(S,{session=GOOD,sd=seed(),width=390,hist,ls}={})=>{ const ctx=await b.newContext({viewport:{width,height:844},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource|net::ERR|CORS|status of (4|5)\d\d/.test(m.text())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,L.makeDb(),{session}); await p.addInitScript(({sd,hist,pend})=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI));
    if(!sessionStorage.__seed){ sessionStorage.__seed=1; localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); if(pend) localStorage.setItem("carnet.consent",pend); if(hist) localStorage.setItem("carnet.coach.hist",hist); } },{sd,hist,pend:session?JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()}):null});
  await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 const csp=async p=>{ const v=await p.evaluate(()=>window.__csp||[]); if(v.length) CSPV.push(...v); };
 const open=async p=>{ await p.click("#tab-coach"); if(await p.evaluate(()=>document.querySelector("#coachPop").hidden)) await p.click("#coachFab"); await p.waitForTimeout(150); };   // onglet = historique ; la conversation est dans la bulle
 const say=async(p,t)=>{ await p.fill("#coachIn",t); await p.waitForTimeout(1600); await p.click("#coachSend"); };   // la pause évite la garde anti-rafale (1,5 s)
 const consent=async(p,{prof:a=false,feel:f=false,stats:s=false}={})=>{ await p.waitForSelector(".sheet #coAccept"); await p.check("#coAccept"); if(a) await p.check("#coProf"); if(f) await p.check("#coFeel"); if(s) await p.check("#coStat"); await p.click("#coGo"); await p.waitForTimeout(250); };
 const last=p=>p.evaluate(()=>{ const m=[...document.querySelectorAll("#coachLog .cmsg")].pop(); return m? {cls:m.className,txt:m.querySelector(".cbody").textContent,html:m.querySelector(".cbody").innerHTML} : null; });
 const SC={"/config.js":L.cfgJs({CHAT_WEBHOOK_URL:HOOK,CHAT_PROVIDER_NAME:"Fournisseur-Test (États-Unis)"})};

 // C0 : non configuré => onglet absent, aucune requête
 { const S0=await L.serve({"/config.js":L.cfgJs()}); const p=await mk(S0); const n0=hits.length;
   ok(await p.evaluate(()=>!document.querySelector("#tab-coach")&&!document.querySelector("#p-coach")),"C0 non configuré : onglet et panneau absents du DOM");
   ok(await p.evaluate(()=>[...document.querySelectorAll("nav.tabs [role=tab]")].length===5),"C0 cinq onglets seulement");
   ok(hits.length===n0,"C0 aucune requête"); await p.ctx.close(); S0.close(); }
 // C0b : URL refusée (http distant, joker, identifiants) => caché
 for(const u of ["http://evil.example.org/hook","https://user:pw@n8n.example.org/h","https://n8n.example.org/h?x=1","javascript:alert(1)","https://*.example.org/h"]){ const S0=await L.serve({"/config.js":L.cfgJs({CHAT_WEBHOOK_URL:u})}); const p=await mk(S0); ok(await p.evaluate(()=>!document.querySelector("#tab-coach")),"C0b URL refusée : "+u); await p.ctx.close(); S0.close(); }

 const S=await L.serve(SC);
 // C1 : consentement avant tout envoi
 { const p=await mk(S); await open(p); hits.length=0;
   ok(await p.evaluate(()=>!document.querySelector("#tab-coach").hidden&&document.querySelector("#p-coach").hidden===false&&!document.querySelector("#coachFab").hidden&&!document.querySelector("#coachPop").hidden),"C1 onglet visible, bulle ouverte");
   ok(await p.evaluate(()=>/pas un avis médical/.test(document.querySelector("#coachNote").textContent)),"C1 rappel : pas un avis médical");
   await p.fill("#coachIn","bonjour"); await p.click("#coachSend"); await p.waitForSelector(".sheet #coAccept");
   ok(hits.length===0,"C1 la feuille de consentement s'ouvre, rien n'est envoyé");
   ok(await p.evaluate(()=>!document.querySelector("#coAccept").checked&&!document.querySelector("#coProf").checked&&!document.querySelector("#coFeel").checked&&!document.querySelector("#coStat").checked),"C1 aucune case précochée (profil, ressenti, stats : non par défaut)");
   ok(await p.evaluate(()=>{ const t=document.querySelector(".sheet").textContent; return /serveur n8n/.test(t)&&t.includes("127.0.0.1")&&t.includes("Fournisseur-Test (États-Unis)")&&/informations de santé/.test(t)&&/âge/.test(t)&&/Union européenne/.test(t); }),"C1 la feuille nomme n8n, l'hôte, le fournisseur (config), la santé, l'âge et les transferts hors UE");
   await p.click("#coGo"); ok(await p.evaluate(()=>!document.querySelector("#coErr").hidden)&&hits.length===0,"C1 sans « J'accepte » : refus, rien envoyé");
   await p.keyboard.press("Escape"); await p.waitForTimeout(300); ok(hits.length===0,"C1 fermer la feuille n'envoie rien");
   ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.consent")),"C1 aucun consentement enregistré");
   await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
   ok(hits.length===1,"C1 après accord : un envoi, et un seul (le message en attente)");
   const h=hits[0]; ok(h.body.v===1&&h.body.messages.length===1&&h.body.messages[0].role==="user"&&h.body.messages[0].content==="bonjour","C1 corps : {v,messages}");
   ok(Object.keys(h.body.context||{}).join()==="profil"&&Object.keys(h.body.context.profil).join()==="age"&&h.body.context.profil.age===35&&!/NOTE-SECRETE|178|ressenti|stats/.test(h.raw),"C1 sans case cochée : seul l'âge est joint (coach réservé aux adultes), ni profil, ni ressenti, ni stats, ni notes",h.body);
   ok(h.auth==="Bearer "+JWT&&h.cred===""&&h.ref==="","C1 connecté : JWT en en-tête, pas de cookie, pas de référent");
   const m=await last(p); ok(/<strong>toi<\/strong>/.test(m.html)&&/<li>un<\/li>/.test(m.html)&&/<code>code<\/code>/.test(m.html),"C1 mini-markdown : gras, liste, code",m.html);
   ok(await p.evaluate(()=>document.querySelector("#coachIn").value===""&&!document.querySelector("#coachSend").disabled),"C1 champ vidé, bouton rendu");
   await csp(p); await p.ctx.close(); }
 // C1b : invité => bloqué localement, aucun envoi, aucune demande de consentement
 { const p=await mk(S,{session:null}); await open(p); hits.length=0; await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(400);
   const m=await last(p); ok(/Connecte-toi/.test(m.txt)&&hits.length===0&&await p.evaluate(()=>!document.querySelector(".sheet")),"C1b invité : bloqué dans le navigateur (E.auth), 0 requête, pas de consentement demandé",m); await p.ctx.close(); }
 // C2 : rubriques choisies (profil, ressenti, stats) et JWT si connecté
 { const p=await mk(S,{session:{...L.SESSION(),access_token:JWT}}); await open(p); hits.length=0;
   await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p,{prof:true,feel:true,stats:true}); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
   const h=hits[0]; ok(h&&h.auth==="Bearer "+JWT,"C2 connecté : JWT Supabase en en-tête Authorization",h&&h.auth);
   ok(h.body.context&&h.body.context.profil&&h.body.context.profil.age===35&&h.body.context.profil.sport==="course"&&!("sexe" in h.body.context.profil),"C2 résumé de profil borné (pas de sexe, taille…)",h.body.context);
   ok(h.body.context.ressenti&&h.body.context.ressenti[0].effort===7&&h.body.context.ressenti[0].douleur===1&&!/NOTE-SECRETE|genou/.test(h.raw),"C2 ressenti sans notes ni zone");
   ok(h.body.context.stats&&h.body.context.stats[0].minutes===45&&h.body.context.stats[0].km===8,"C2 stats importées par semaine");
   ok(!/\"sb-|refresh|access_token/.test(h.raw),"C2 aucun jeton dans le corps");
   // modifier les choix : feuille pré-remplie, puis retrait
   await p.click("#coachCfg"); await p.waitForSelector(".sheet #coAccept");
   ok(await p.evaluate(()=>document.querySelector("#coAccept").checked&&document.querySelector("#coProf").checked),"C2 choix mémorisés affichés"); await p.click("#coRevoke"); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.consent")),"C2 retrait de l'accord : effacé");
   hits.length=0; await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForSelector(".sheet #coAccept"); ok(hits.length===0,"C2 après retrait : on redemande, rien n'est envoyé");
   await csp(p); await p.ctx.close(); }
 // C3 : filet de sécurité : jamais envoyé, message fixe (même sans consentement)
 { const p=await mk(S); await open(p); hits.length=0;
   for(const [t,re] of [["j'ai envie de me suicider",/3114/],["douleur dans la poitrine depuis ce matin",/15 ou le 112/],["je pense que je suis anorexique, je veux arrêter de manger",/professionnel de santé/],["J’AI UN MALAISE APRÈS LA COURSE",/15 ou le 112/]]){
     await p.fill("#coachIn",t); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(250); const m=await last(p); ok(re.test(m.txt)&&/aucun serveur/.test(m.txt),"C3 « "+t.slice(0,28)+" » : message fixe de prudence"); }
   { const bad=["envie d'en finir avec la vie","J’ai envie d’en finir","je veux me tuer","I want to kill myself","self-harm","je veux ne plus manger","jeûne extrême de 5 jours","je veux perdre 10 kg en une semaine","lose 8kg in a week","douleur à la poitrine","crise cardiaque ?","du sang dans mes urines","I fainted after the run","chest pain!!","S.U.I.C.I.D.E","je mange 600 kcal par jour","400 kcal/jour","stop eating","me faire vomir","je crache du sang","douleur TRÈS forte au genou","ENVIE D'EN FINIR","j'ai des palpitations","severe pain in my knee"];
     const good=["mon plan de 5 km","mal aux jambes après la sortie longue","j'ai fait une prise de sang","2 000 kcal par jour","2000 kcal/jour","1 800 kcal par jour","un repas de 600 kcal","en finir avec ma sortie longue","comment gérer ma sortie de dimanche","protéines 150 g par jour"];
     const PH=require("./coach-phrases.json"); const all=[...PH.detresse_attendu,...PH.urgence_attendu,...PH.tca_attendu,...PH.ui2_detresse,...PH.ui2_urgence,...PH.ui2_tca,...PH.ui3_detresse,...PH.ui3_urgence,...PH.ui3_tca]; const rr=await p.evaluate(a=>a.filter(x=>!window.CarnetCoach.guard(x)),all); ok(rr.length===0,"C3 les "+all.length+" formulations du testeur (fr, espaces, caractères invisibles, fautes) : toutes bloquées",rr);
     const fp=await p.evaluate(a=>a.filter(x=>window.CarnetCoach.guard(x)),[...PH.ui2_ok,...PH.ui3_ok,...PH.normal_faux_positifs].filter(x=>!/malaisé|fracture de fatigue|malaise vagal/.test(x))); ok(fp.length===0,"C3 phrases ordinaires du testeur : pas de blocage",fp);
     const r=await p.evaluate(({bad,good})=>({miss:bad.filter(x=>!window.CarnetCoach.guard(x)),fp:good.filter(x=>window.CarnetCoach.guard(x))}),{bad,good}); ok(r.miss.length===0,"C3 détection : "+bad.length+" formulations (fr, en, accents, casse, ponctuation) bloquées",r.miss); ok(r.fp.length===0,"C3 pas de faux positifs sur "+good.length+" messages ordinaires",r.fp);
     const kinds=await p.evaluate(()=>["en finir avec la vie","chest pain","stop eating"].map(x=>window.CarnetCoach.guard(x))); ok(kinds.join()==="detresse,urgence,tca","C3 catégories : détresse, urgence, alimentation",kinds);
     for(const t of ["envie d'en finir avec la vie","I want to kill myself","jeûne extrême pour perdre 8 kg en une semaine","crise cardiaque ?"]){ await p.fill("#coachIn",t); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(250); const m=await last(p); ok(/aucun serveur/.test(m.txt),"C3 « "+t+" » : message fixe, jamais envoyé"); } }
   ok(hits.length===0&&await p.evaluate(()=>!document.querySelector(".sheet")),"C3 aucune requête, aucune demande de consentement");
   await p.evaluate(()=>{ if(!document.querySelector("#coachPop").hidden) document.querySelector("#coachClose").click(); }); await p.click("#tab-semaine"); await open(p); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>8); await p.waitForTimeout(100);
   ok(hits.length===1&&hits[0].body.messages.length===1&&!/suicid|poitrine|anorex/i.test(hits[0].raw),"C3 les messages bloqués ne partent jamais, même plus tard dans la conversation",hits[0]&&hits[0].raw);
   await p.ctx.close(); }
 // C4 : réponses et erreurs
 { const p=await mk(S); await open(p); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0); hits.length=0;
   const t=async(w,re,msg)=>{ await say(p,w); await p.waitForFunction(()=>!document.querySelector("#coachSend").disabled,null,{timeout:20000}); await p.waitForTimeout(150); const m=await last(p); ok(re.test(m.txt),msg,m); return m; };
   await t("hostile",/lien|gras|<img/,"C4 HTML hostile : affiché comme texte");
   ok(await p.evaluate(()=>!window.__pwn&&!document.querySelector("#coachLog img, #coachLog script, #coachLog a, #coachLog b")),"C4 HTML hostile : aucun élément créé, rien d'exécuté");
   ok(await p.evaluate(()=>[...document.querySelectorAll("#coachLog .bot")].pop().textContent.includes("<img src=x onerror=window.__pwn=1>")),"C4 le texte hostile est visible tel quel");
   await t("long",/^y{100}/,"C4 réponse de 10 000 caractères : coupée à 4 000"); ok((await last(p)).txt.length<=4010,"C4 taille bornée",(await last(p)).txt.length);
   await t("enorme",/trop volumineuse/,"C4 corps de 200 Ko refusé");
   await t("err500",/problème/,"C4 500 : message clair, rien de technique"); ok(!/stack trace/.test((await last(p)).txt),"C4 500 : le corps de l'erreur n'est pas affiché");
   await t("err401",/Connecte-toi/,"C4 401 : invite à se connecter"); await t("err429",/Trop de messages/,"C4 429 : limite de débit");
   await t("invalide",/illisible/,"C4 JSON invalide"); await t("vide",/illisible/,"C4 réponse sans « reply »"); await t("objet",/illisible/,"C4 « reply » qui n'est pas du texte");
   await t("redirect",/joindre/,"C4 redirection refusée (redirect: error)");
   ok(await p.evaluate(()=>/err/.test([...document.querySelectorAll("#coachLog .cmsg")].pop().className)),"C4 erreur : bulle distincte");
   // lent : indicateur visible
   await p.fill("#coachIn","lent"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!document.querySelector("#coachWait").hidden&&document.querySelector("#coachSend").disabled&&!document.querySelector("#coachCancel").hidden&&document.querySelector("#coachForm").getAttribute("aria-busy")==="true"),"C4 réponse lente : indicateur, bouton désactivé, Annuler visible");
   await p.waitForFunction(()=>!document.querySelector("#coachSend").disabled); ok((await last(p)).txt.includes("Réponse lente"),"C4 réponse lente reçue");
   // annulation
   const n=hits.length; await p.fill("#coachIn","bloque"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(300); await p.click("#coachCancel"); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!document.querySelector("#coachSend").disabled&&document.querySelector("#coachCancel").hidden&&document.querySelector("#coachIn").value==="bloque"),"C4 annulation : champ restauré, bouton rendu");
   ok(!(await last(p)).cls.includes("err")&&(await p.evaluate(()=>/annulé/.test(document.querySelector("#coachLive").textContent))),"C4 annulation : pas d'erreur affichée, annoncée aux lecteurs d'écran");
   // historique borné et effaçable
   const hn=await p.evaluate(()=>Math.max(...JSON.parse(localStorage.getItem("carnet.coach.hist")).convs.map(c=>c.m.length))); ok(hn<=40,"C4 historique local borné ("+hn+")");
   await p.click("#coachClear"); ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.hist")&&!document.querySelector("#coachLog .cmsg")),"C4 effacer la conversation");
   await csp(p); await p.ctx.close(); }
 // C9 : « Effacer mes données » efface aussi le coach, y compris une réponse en vol
 { const p=await mk(S); await open(p); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
   hits.length=0; await p.fill("#coachIn","lent"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForTimeout(300);
   await p.evaluate(()=>{ if(!document.querySelector("#coachPop").hidden) document.querySelector("#coachClose").click(); }); await p.click(".js-av >> visible=true"); await p.waitForTimeout(350); await p.click("[data-acc=erase]"); await p.waitForTimeout(250); await p.click("#erNext"); await p.waitForTimeout(250); await p.click("#erGo"); await p.waitForTimeout(500);
   ok(await p.evaluate(()=>!document.querySelector("#coachLog .cmsg")&&!localStorage.getItem("carnet.coach.hist")&&!localStorage.getItem("carnet.coach.consent")),"C9 effacement : écran du coach vidé, stockage vidé");
   await p.waitForTimeout(2200);
   ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.hist")&&!document.querySelector("#coachLog .cmsg")&&!document.querySelector("#coachSend").disabled),"C9 la réponse en vol est jetée : l'historique n'est pas recréé, le bouton est rendu");
   await p.evaluate(()=>window.CarnetCoach.wipe()); ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.hist")),"C9 wipe() exporté");
   await p.ctx.close(); }
 // C9b : historique effacé dans un autre onglet (clé supprimée) : rien ne revient
 { const p=await mk(S); await open(p); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
   await p.evaluate(()=>localStorage.removeItem("carnet.coach.hist")); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>=1); await p.waitForTimeout(200);
   ok(hits.slice(-1)[0].body.messages.length===1&&await p.evaluate(()=>document.querySelectorAll("#coachLog .cmsg").length===2),"C9b historique supprimé ailleurs : la mémoire est vidée avant l'envoi (1 seul message envoyé)",hits.slice(-1)[0].body.messages.length); await p.ctx.close(); }
 // C5 : historique malveillant dans le stockage : assaini, plafonné
 { const bad=[]; for(let i=0;i<100;i++) bad.push({r:i%2?"a":"u",t:"m"+i+"<img src=x onerror=window.__pwn=1>"}); bad.push({r:"x",t:"?"},null,{r:"u",t:{a:1}},{r:"u",t:"z".repeat(100000)});
   const p=await mk(S,{hist:JSON.stringify(bad)}); await open(p);
   const c=await p.evaluate(()=>({n:document.querySelectorAll("#coachLog .cmsg").length,img:document.querySelectorAll("#coachLog img").length,pwn:!!window.__pwn,max:Math.max(...[...document.querySelectorAll("#coachLog .cbody")].map(e=>e.textContent.length))}));
   ok(c.n<=40&&c.img===0&&!c.pwn&&c.max<=4000,"C5 historique piégé : ≤ 40 messages, texte seul, tailles bornées",c); await p.ctx.close(); }
 // C6c : encart permanent de détresse, et indice de défilement des onglets à 320 px
 { const p=await mk(S,{width:320}); await open(p); ok(await p.evaluate(()=>{ const e=document.querySelector("#coachSos"); return e.getClientRects().length>0&&/3114/.test(e.textContent)&&/24 h\/24/.test(e.textContent)&&/15 \/ 112/.test(e.textContent); }),"C6c encart permanent « 3114 (24 h/24) · urgence : 15 / 112 » visible dans le Coach");
   await p.evaluate(()=>{ if(!document.querySelector("#coachPop").hidden) document.querySelector("#coachClose").click(); }); await p.click("#tab-semaine"); await p.waitForTimeout(400); const hint=await p.evaluate(()=>{ const n=document.querySelector("nav.tabs"), sg=n.querySelector(".segc"); return {more:n.classList.contains("tabs-more"),after:getComputedStyle(n,"::after").content,over:sg.scrollWidth>sg.clientWidth}; });
   ok(!hint.over||(hint.more&&/›/.test(hint.after)),"C6c 320 px : si la barre d'onglets défile, un chevron indique la suite",hint);
   await p.evaluate(()=>{ const sg=document.querySelector(".segc"); sg.scrollLeft=9999; }); await p.waitForTimeout(300); ok(await p.evaluate(()=>!document.querySelector("nav.tabs").classList.contains("tabs-more")),"C6c fin de barre atteinte : chevron retiré"); await p.ctx.close(); }
 // C6b : cases à cocher du consentement : bordure visible (contraste >= 3:1 avec le fond de la feuille), en clair et en sombre
 for(const scheme of ["light","dark"]){ const p=await mk(S); await p.emulateMedia({colorScheme:scheme}); await open(p); await say(p,"bonjour"); await p.waitForSelector(".sheet #coAccept");
   const r=await p.evaluate(()=>{ const i=document.querySelector("#coProf"), cs=getComputedStyle(i), sh=getComputedStyle(document.querySelector(".sheet")); return {bc:cs.borderTopColor,bw:parseFloat(cs.borderTopWidth),bg:sh.backgroundColor,body:getComputedStyle(document.body).backgroundColor,w:i.getBoundingClientRect().width}; });
   const px=c=>c.match(/[\d.]+/g).map(Number), lum=([r,g,b])=>{ const f=v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
   let bg=px(r.bg); if(bg.length>3&&bg[3]===0) bg=px(r.body); const L1=lum(px(r.bc)), L2=lum(bg), cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
   ok(r.bw>=2&&cr>=3&&r.w>=22,"C6b case à cocher ("+scheme+") : bordure "+r.bw+" px, contraste "+cr.toFixed(1)+":1",r); await p.ctx.close(); }
 // C6 : mineur, profil d'exemple
 { const p=await mk(S,{sd:seed({profile:{age:16}})}); const n=hits.length; await open(p);
   ok(await p.evaluate(()=>!document.querySelector("#coachGate").hidden&&/avant 18 ans/.test(document.querySelector("#coachGate").textContent)&&document.querySelector("#coachForm").hidden),"C6 moins de 18 ans : coach désactivé, explication, pas de champ de saisie");
   ok(await p.evaluate(()=>{ const vis=[...document.querySelectorAll("#p-coach > *")].filter(e=>e.getClientRects().length&&!e.classList.contains("sr-only")); return vis.length===3&&vis[2].textContent.trim()==="Le coach est désactivé avant 18 ans."&&/3114/.test(vis[1].textContent); }),"C6 mineur : seul le message « Le coach est désactivé avant 18 ans. » est affiché (titre et encart 3114 / 15 / 112 mis à part)");
   ok(hits.length===n,"C6 aucune requête"); await p.ctx.close();
   const p2=await mk(S,{sd:JSON.stringify({profile:prof,isExample:true,log:[],week:1,seen:15})}); await open(p2);
   ok(await p2.evaluate(()=>/profil/.test(document.querySelector("#coachGate").textContent)&&document.querySelector("#coachForm").hidden),"C6 sans profil rempli : désactivé"); await p2.ctx.close(); }
 // C7 : feuilles de même taille, 320 px sans débordement, onglets
 for(const [w,h] of [[320,568],[375,740],[768,900],[1280,800]]){ const p=await mk(S,{width:w}); await p.setViewportSize({width:w,height:h});
   const sz=async()=>{ await p.waitForTimeout(420); return p.evaluate(()=>{ const s=document.querySelector(".sheet"); const q=x=>{ const e=s.querySelector(x); return e? Math.round(e.getBoundingClientRect().height):null; }; const bb=s.getBoundingClientRect(); return [Math.round(bb.width),Math.round(bb.height),Math.round(bb.x),Math.round(bb.y),q(".sh-h"),q(".sh-f")].join(); }); };
   await p.evaluate(()=>{ if(!document.querySelector("#coachPop").hidden) document.querySelector("#coachClose").click(); }); await p.click("#tab-semaine"); await p.click("#days [data-move]"); const ref=await sz(); await p.keyboard.press("Escape"); await open(p); await p.click("#coachCfg"); const co=await sz();
   ok(ref===co,"C7 feuille Coach de même taille que les autres à "+w+" px",{ref,co}); await p.keyboard.press("Escape");
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"C7 aucun défilement horizontal à "+w+" px");
   ok(await p.evaluate(()=>{ const t=[...document.querySelectorAll("nav.tabs [role=tab]:not([hidden])")]; return t.length===6&&t.every(b=>b.scrollWidth<=b.clientWidth+1&&b.getBoundingClientRect().height>=30); }),"C7 six onglets lisibles à "+w+" px");
   await csp(p); await p.ctx.close(); }
 // C8 : effacer mes données efface aussi le coach
 { const p=await mk(S); await open(p); await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
   ok(await p.evaluate(()=>!!localStorage.getItem("carnet.coach.hist")&&!!localStorage.getItem("carnet.coach.consent")),"C8 historique et consentement en local");
   await p.evaluate(()=>{ if(!document.querySelector("#coachPop").hidden) document.querySelector("#coachClose").click(); }); await p.click(".apptop .av"); await p.waitForTimeout(350); await p.click("[data-acc=erase]"); await p.click("#erNext").catch(()=>{}); await p.waitForTimeout(300);
   const btn=await p.$(".sheet #erGo, .sheet [data-erase-go], .sheet .btn.danger"); if(btn){ await btn.click(); await p.waitForTimeout(500); }
   ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.hist")&&!localStorage.getItem("carnet.coach.consent")),"C8 effacement des données : historique et consentement du coach effacés");
   await p.ctx.close(); }
// C10 : bulle et historique des conversations (onglet), ancien format repris
{ const old=JSON.stringify([{r:"u",t:"ANCIENNE question"},{r:"a",t:"ancienne réponse"}]);
  const p=await mk(S,{hist:old,width:1280}); await p.click("#tab-coach"); await p.waitForTimeout(150);
  ok(await p.evaluate(()=>document.querySelectorAll("#coachConvs [data-conv]").length===1&&/ANCIENNE question/.test(document.querySelector("#coachConvs").textContent)&&document.querySelector("#coachPop").hidden),"C10 ancien historique repris comme une conversation ; bulle fermée");
  await p.click("#coachNew"); await p.waitForTimeout(100); ok(await p.evaluate(()=>!document.querySelector("#coachPop").hidden&&!document.querySelector("#coachLog .cmsg")&&document.activeElement.id==="coachIn"),"C10 nouvelle conversation : bulle ouverte, vide, champ actif");
  await p.fill("#coachIn","bonjour"); await p.waitForTimeout(1600); await p.click("#coachSend"); await consent(p); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0);
  ok(hits.slice(-1)[0].body.messages.length===1,"C10 seule la conversation ouverte est envoyée");
  ok(await p.evaluate(()=>document.querySelectorAll("#coachConvs [data-conv]").length===2),"C10 deux conversations dans l'onglet");
  await p.keyboard.press("Escape"); ok(await p.evaluate(()=>document.querySelector("#coachPop").hidden&&document.activeElement.id==="coachFab"),"C10 Échap ferme la bulle, focus rendu");
  await p.click("#coachConvs li:last-child [data-conv]"); ok(await p.evaluate(()=>!document.querySelector("#coachPop").hidden&&/ANCIENNE question/.test(document.querySelector("#coachLog").textContent)),"C10 rouvrir une conversation précédente");
  await p.click("#coachClose"); await p.click("#coachConvs li:last-child [data-delconv]");
  ok(await p.evaluate(()=>document.querySelectorAll("#coachConvs [data-conv]").length===1&&!/ANCIENNE/.test(localStorage.getItem("carnet.coach.hist"))),"C10 supprimer une conversation");
  await p.click("#coachClearAll"); ok(await p.evaluate(()=>!localStorage.getItem("carnet.coach.hist")&&!document.querySelector("#coachConvs [data-conv]")),"C10 tout effacer");
  await csp(p); await p.ctx.close(); }
 console.log("erreurs console",E,"violations CSP",CSPV); fails+=E.length+CSPV.length; ok(E.length===0&&CSPV.length===0,"console propre, aucune violation CSP");
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); hook.close(); process.exit(fails?1:0); })();
