// Validation des entrées et anti-injection : chaque saisie invalide est refusée avec un message relié au champ (aria-invalid, aria-describedby) ;
// les chaînes hostiles (formulaires, JSON importé, Coach, retour OAuth) ne sont jamais exécutées ni injectées dans le DOM.
const {chromium}=require("playwright"); const L=require("./lib"); const http=require("http");
const H=[`<img src=x onerror=alert(1)>`,`"><script>alert(1)</script>`,`javascript:alert(1)`,`'"><img src=x onerror=window.__pwn=1>`,`<svg onload=alert(1)>`,"A".repeat(100000)+"<img src=x onerror=alert(1)>"];
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:"2026-12-13"};
const seed=JSON.stringify({profile:prof,isExample:false,log:[{date:"2026-09-27",poids:81,at:1,sommeil:7,fatigue:2,faites:3,prevues:4,douleur:"non"}],week:2,seen:15});
const GOOD={...L.SESSION(),access_token:"aaaaaaaaaa.bbbbbbbbbb.cccccccccc"};
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):"")); };
(async()=>{
 // faux webhook du Coach : renvoie le message reçu suivi d'une charge hostile
 const hits=[]; const hook=http.createServer((req,res)=>{ const cors={"Access-Control-Allow-Origin":req.headers.origin||"*","Access-Control-Allow-Headers":"content-type, authorization","Access-Control-Allow-Methods":"POST, OPTIONS"};
   if(req.method==="OPTIONS"){ res.writeHead(204,cors); return res.end(); }
   let b=""; req.on("data",c=>b+=c); req.on("end",()=>{ let j={}; try{ j=JSON.parse(b); }catch(e){} hits.push(j); const last=((j.messages||[]).slice(-1)[0]||{}).content||"";
     res.writeHead(200,{...cors,"Content-Type":"application/json"}); res.end(JSON.stringify({reply:"Écho : "+last+"\n- "+H[0]+"\n[lien](javascript:alert(1)) <script>window.__pwn=1</script>"})); }); });
 await new Promise(r=>hook.listen(0,"127.0.0.1",r)); const HOOK="http://127.0.0.1:"+hook.address().port+"/webhook/carnet-coach"; L.EXTRA.v=" http://127.0.0.1:"+hook.address().port;
 const S=await L.serve({"/config.js":L.cfgJs({CHAT_WEBHOOK_URL:HOOK,CHAT_PROVIDER_NAME:"Fournisseur-Test"})});
 const b=await chromium.launch(); const E=[], DLG=[];
 const mk=async({session=null,sd=seed,path="/",ls={}}={})=>{ const ctx=await b.newContext({viewport:{width:390,height:844},locale:"fr-FR"}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push("PE "+e.message)); p.on("dialog",d=>{ DLG.push(d.type()+" "+d.message()); d.dismiss().catch(()=>{}); });
  p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource|net::ERR/.test(m.text())) E.push(m.type()+" "+m.text().slice(0,160)); });
  await L.fake(p,L.makeDb(),{session});
  await p.addInitScript(({sd,ls})=>{ window.__csp=[]; window.__inj=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI));
    // tout élément dangereux ajouté au DOM, même brièvement, est relevé
    const bad=n=> n.nodeType===1&&(/^(IMG|SCRIPT|IFRAME|OBJECT|EMBED)$/.test(n.tagName)&&!(n.tagName==="SCRIPT"&&n.src&&n.src.startsWith(location.origin))||[...n.attributes].some(a=>/^on/i.test(a.name)||/^\s*javascript:/i.test(a.value)));
    new MutationObserver(ms=>{ for(const m of ms) for(const n of m.addedNodes){ if(bad(n)) window.__inj.push(n.outerHTML.slice(0,120)); if(n.querySelectorAll) n.querySelectorAll("*").forEach(c=>{ if(bad(c)) window.__inj.push(c.outerHTML.slice(0,120)); }); } }).observe(document,{childList:true,subtree:true});
    if(!sessionStorage.__seed){ sessionStorage.__seed=1; if(sd) localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); for(const [k,v] of Object.entries(ls)) localStorage.setItem(k,v); } },{sd,ls});
  await p.goto(S.url+path); await p.waitForTimeout(800); p.ctx=ctx; return p; };
 // aucun élément injecté, aucun script exécuté
 const clean=async(p,t)=>{ const r=await p.evaluate(()=>({inj:window.__inj,pwn:window.__pwn,csp:window.__csp,img:document.querySelectorAll("img[src='x'],[onerror],[onload]:not(script),a[href^='javascript' i]").length})); ok(!r.inj.length&&r.pwn===undefined&&!r.img&&!DLG.length,t+" : rien d'injecté ni d'exécuté",{...r,DLG}); if(r.csp.length) E.push("CSP "+r.csp.join()); };
 const act=(p,a)=>p.evaluate(a=>{ const x=document.createElement("button"); x.type="button"; x.dataset.act=a; x.hidden=true; document.body.append(x); x.click(); x.remove(); },a);
 const setv=(p,sel,v)=>p.evaluate(([s,v])=>{ const e=document.querySelector(s); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); },[sel,v]);
 const err=(p,id)=>p.evaluate(id=>{ const e=document.getElementById(id), ids=(e.getAttribute("aria-describedby")||"").split(" ").filter(Boolean), m=document.getElementById(id+"Err");
   return {inv:e.getAttribute("aria-invalid")==="true",linked:!!m&&ids.includes(m.id)&&!m.hidden,txt:m&&!m.hidden?m.textContent:""}; },id);
 const nLog=p=>p.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")).log.length);

 // V1 : Suivi
 { const p=await mk(); await p.click("#tab-suivi"); await p.waitForTimeout(150); const n0=await nLog(p), sub=()=>p.evaluate(()=>document.querySelector("#logForm").requestSubmit());
   const fut=await p.evaluate(()=>{ const d=new Date(); d.setDate(d.getDate()+3); return d.toISOString().slice(0,10); });
   await setv(p,"#lgDate",fut); await setv(p,"#lgPoids","80"); await sub(); let r=await err(p,"lgDate");
   ok(r.inv&&r.linked&&/futur/.test(r.txt),"V1 date future refusée, message relié au champ",r); ok(await p.evaluate(()=>document.activeElement.id)==="lgDate","V1 le focus va au champ en erreur");
   await setv(p,"#lgDate",""); await sub(); r=await err(p,"lgDate"); ok(r.inv&&/Choisis la date/.test(r.txt),"V1 date vide refusée",r);
   await setv(p,"#lgDate","2026-10-01");
   for(const v of ["","abc","300","10","-5",...H]){ await setv(p,"#lgPoids",v); await sub(); r=await err(p,"lgPoids"); ok(r.inv&&r.linked&&/kg|kilos/.test(r.txt),"V1 poids « "+v.slice(0,30)+" » refusé avec message",r); }
   await setv(p,"#lgPoids","80"); r=await err(p,"lgPoids"); ok(!r.inv&&!r.txt,"V1 l'erreur disparaît dès la correction",r);
   for(const v of ["50","1","abc",H[0]]){ await setv(p,"#lgSommeil",v); await sub(); r=await err(p,"lgSommeil"); ok(r.inv&&/entre 3 et 12/.test(r.txt),"V1 sommeil « "+v.slice(0,30)+" » refusé",r); }
   await setv(p,"#lgSommeil","7,5");
   await setv(p,"#lgFaites","5"); await setv(p,"#lgPrevues","3"); await sub(); r=await err(p,"lgFaites"); ok(r.inv&&/Pas plus que les séances prévues \(3\)/.test(r.txt),"V1 faites > prévues refusé",r);
   await setv(p,"#lgFaites","-1"); await setv(p,"#lgPrevues","4"); await sub(); r=await err(p,"lgFaites"); ok(r.inv&&/de 0 à 7/.test(r.txt),"V1 faites négatif refusé",r);
   await setv(p,"#lgFaites","2.5"); await sub(); r=await err(p,"lgFaites"); ok(r.inv,"V1 nombre de séances non entier refusé",r);
   await setv(p,"#lgFaites","3"); await setv(p,"#lgPrevues","9"); await sub(); r=await err(p,"lgPrevues"); ok(r.inv&&/de 1 à 7/.test(r.txt),"V1 prévues 9 refusé",r);
   ok(await nLog(p)===n0,"V1 aucune saisie invalide enregistrée");
   ok(/corriger/.test(await p.textContent("#logMsg")),"V1 résumé de l'erreur annoncé (role=status)");
   // saisie valide, puis double envoi : une seule semaine, pas de « remplacée »
   await setv(p,"#lgPrevues","4"); await p.evaluate(()=>{ const f=document.querySelector("#logForm"); f.requestSubmit(); f.requestSubmit(); }); await p.waitForTimeout(200);
   ok(await nLog(p)===n0+1,"V1 saisie valide enregistrée une fois");
   ok(!/remplacée/.test(await p.evaluate(()=>(document.querySelector("#toast")||{}).textContent||"")),"V1 double envoi ignoré (pas de « semaine remplacée »)");
   ok(await p.evaluate(()=>!document.querySelector("#logForm [aria-invalid]")),"V1 plus aucun champ marqué invalide");
   await clean(p,"V1 Suivi"); await p.ctx.close(); }

 // V2 : Profil — chaînes hostiles dans chaque champ texte
 { const p=await mk(); await p.click("#tab-profil"); await p.waitForTimeout(150); await p.evaluate(()=>document.querySelectorAll("#profileForm details").forEach(d=>d.open=true));
   for(const id of ["poids","cible","mg","hSem","longest"]) for(const v of H){ await setv(p,"#"+id,v); }
   await p.selectOption("#ref","vma"); await p.waitForTimeout(100); for(const v of H) await setv(p,"#refVal",v); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>["mg","cible","refVal"].every(i=>document.getElementById(i).getAttribute("aria-invalid")==="true")),"V2 masse grasse, poids visé, VMA illisibles : champs marqués invalides");
   ok(await p.evaluate(()=>/non reconnue/.test(document.querySelector("#vmaHint").textContent)&&document.querySelector("#refVal").getAttribute("aria-describedby").includes("vmaHint")),"V2 message VMA relié au champ");
   ok(await p.evaluate(()=>/^\d/.test(document.querySelector("#poids").value)),"V2 poids illisible : valeur précédente remise");
   ok(await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem("carnet-course.v1")).profile).every(v=>typeof v!=="string"||v.length<=40)),"V2 valeurs enregistrées de longueur bornée");
   await setv(p,"#refVal","14,5"); await setv(p,"#mg",""); await setv(p,"#cible","75"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>["mg","cible","refVal"].every(i=>!document.getElementById(i).hasAttribute("aria-invalid"))),"V2 valeurs corrigées : plus d'erreur");
   for(const t of ["semaine","plan","suivi","profil"]){ await p.click("#tab-"+t).catch(()=>{}); await p.waitForTimeout(120); }
   await p.reload(); await p.waitForTimeout(700); await clean(p,"V2 Profil"); await p.ctx.close(); }

 // V3 : assistant
 { const p=await mk({sd:null}); await act(p,"wizard"); await p.waitForSelector("#wzForm:not([hidden]), #wiz:not([hidden])").catch(()=>{}); await p.waitForTimeout(200);
   await p.check("input[name=wz_sexe][value=H]",{force:true}); await p.fill("#wzAge","30"); await p.fill("#wzTaille","175");
   const wzE=async id=>p.evaluate(id=>{ const e=document.getElementById(id); return {inv:e.getAttribute("aria-invalid")==="true",linked:(e.getAttribute("aria-describedby")||"").split(" ").includes("wzErr"),txt:document.querySelector("#wzErr").hidden?"":document.querySelector("#wzErr").textContent}; },id);
   for(const v of ["",H[0],H[1],"300"]){ await setv(p,"#wzPoids",v); await p.click("#wzNext"); const r=await wzE("wzPoids"); ok(r.inv&&r.linked&&/entre 35 et 250/.test(r.txt),"V3 poids « "+v.slice(0,25)+" » refusé, message relié",r); }
   await setv(p,"#wzPoids","80"); await setv(p,"#wzCible",H[2]); await p.click("#wzNext"); let r=await wzE("wzCible"); ok(r.inv&&r.linked,"V3 poids visé hostile refusé",r);
   ok(!(await wzE("wzPoids")).inv,"V3 l'ancien champ en erreur n'est plus marqué");
   await setv(p,"#wzCible",""); await p.click("#wzNext"); ok(await p.evaluate(()=>document.querySelector("#wzErr").hidden&&!document.querySelector("#wiz [aria-invalid], [id^=wz][aria-invalid]")),"V3 étape valide : message et marques retirés");
   await clean(p,"V3 Assistant"); await p.ctx.close(); }

 // V4 : ressenti (note libre)
 { const p=await mk(); await p.click("#tab-semaine").catch(()=>{}); const fb=p.locator("#days [data-feel]").first();
   if(await fb.count()){ await fb.click(); await p.waitForSelector(".sheet #fSave"); await p.click("#fSave"); ok(await p.evaluate(()=>document.querySelector("#fRpe").getAttribute("aria-invalid")==="true"&&document.querySelector("#fRpe").getAttribute("aria-describedby").includes("fMsg")&&/RPE/.test(document.querySelector("#fMsg").textContent)),"V4 RPE manquant : champ marqué, message relié");
     await p.selectOption("#fRpe","5"); await p.fill("#fNote",H[3]); await p.click("#fSave"); await p.waitForTimeout(200); await p.click("#tab-suivi"); await p.waitForTimeout(200);
     ok(await p.evaluate(h=>[...document.querySelectorAll("#feelCard [data-note]")].some(s=>s.textContent===h.slice(0,200)),H[3]),"V4 note hostile affichée comme du texte");
   } else ok(false,"V4 aucun bouton Ressenti");
   await clean(p,"V4 Ressenti"); await p.ctx.close(); }

 // V5 : import JSON hostile
 { const p=await mk({session:null}); const hx=H[0], big={...prof,refVal:hx,cible:hx,mg:H[1],objectif:hx,sport:hx,cross:hx,types:[hx,"vma"],start:hx,raceDate:"2026-12-13",sexe:hx,"__proto__":{polluted:1},constructor:{prototype:{polluted:1}}};
   const doc={app:"carnet-de-course",format:1,profile:big,isExample:false,week:hx,log:[{date:"2026-09-20",poids:80,sommeil:hx,douleur:hx,fatigue:hx,at:1},{date:hx,poids:hx},{date:"2026-09-13",poids:"80<img src=x onerror=alert(1)>"}],
     appliedByDate:{[hx]:1},deleted:{[hx]:1},moves:{[hx]:{to:hx}},done:{[hx]:{v:hx}},feel:{"2026-10-08":{rpe:7,mood:4,pain:1,zone:hx,note:H[1]+H[0],sig:hx,at:5}},acts:{[hx]:{date:hx},"2026-10-07|course|45|0700|800":{date:"2026-10-07",type:"course",min:45,km:hx,kcal:500,fc:150,src:hx,at:5}},rhr:{[hx]:{bpm:hx}},eid:hx};
   const imp=async(buf,name="x.json")=>{ await act(p,"acct"); await p.waitForSelector(".sheet input[type=file]",{state:"attached"}); await p.setInputFiles(".sheet input[type=file]",{name,mimeType:"application/json",buffer:buf}); await p.waitForTimeout(400); };
   await imp(Buffer.from("pas du json <img src=x onerror=alert(1)>")); ok(/pas un JSON lisible/.test(await p.textContent(".sheet #accMsg")),"V5 fichier illisible : message clair");
   await p.keyboard.press("Escape"); await imp(Buffer.alloc(2*1024*1024+10,32)); ok(/trop gros/.test(await p.textContent(".sheet #accMsg")),"V5 fichier de plus de 2 Mo refusé");
   await p.keyboard.press("Escape"); await imp(Buffer.from(JSON.stringify({...doc,profile:{...big,age:hx}}))); ok(/incomplet/.test(await p.textContent(".sheet #accMsg")),"V5 profil sans âge lisible refusé");
   await p.keyboard.press("Escape"); await imp(Buffer.from(JSON.stringify(doc))); await p.waitForSelector("#impGo"); await p.click("#impGo"); await p.waitForTimeout(500);
   const st=await p.evaluate(()=>JSON.parse(localStorage.getItem("carnet-course.v1")));
   const rest=JSON.stringify({...st,feel:0}); ok(!/<img|<script|<svg|javascript:/i.test(rest),"V5 hors note libre, aucun texte hostile conservé (profil, suivi, coches, activités…)",rest.slice(0,300));
   ok(st.log.length===1&&st.log[0].sommeil===null&&st.log[0].douleur==="non"&&st.log[0].fatigue===null&&!st.profile.refVal&&st.profile.sexe!==hx,"V5 suivi et profil nettoyés",{log:st.log,p:st.profile});
   ok(await p.evaluate(()=>({}).polluted===undefined&&Object.prototype.polluted===undefined),"V5 aucune pollution de prototype");
   for(const t of ["semaine","plan","suivi","profil"]){ await p.click("#tab-"+t).catch(()=>{}); await p.waitForTimeout(150); }
   ok(await p.evaluate(()=>[...document.querySelectorAll("#feelCard [data-note]")].some(s=>s.textContent.includes("<script>"))),"V5 note importée affichée comme du texte");
   await clean(p,"V5 Import JSON"); await p.ctx.close(); }

 // V6 : Coach — message hostile, réponse hostile, longueur, limite de fréquence
 { const p=await mk({session:GOOD,ls:{"carnet.consent":JSON.stringify({cgu:"2026-10-10",privacy:"2026-10-10",terms:true,health:true,age15:true,at:new Date().toISOString()}),"carnet.coach.consent":JSON.stringify({v:"2026-10-10.3",send:true,at:new Date().toISOString(),profile:false,feel:false,stats:false})}}); await p.click("#tab-coach"); await p.waitForTimeout(150);
   const n0=hits.length; await p.fill("#coachIn",H[1]+" "+H[0]); await p.click("#coachSend"); await p.waitForFunction(()=>document.querySelectorAll("#coachLog .cmsg.bot").length>0,null,{timeout:5000}).catch(()=>{});
   ok(hits.length===n0+1,"V6 message envoyé au webhook");
   ok(await p.evaluate(h=>{ const u=[...document.querySelectorAll("#coachLog .cmsg.me .cbody")].pop(); return !!u&&u.textContent===h&&!u.children.length; },H[1]+" "+H[0]),"V6 message hostile affiché comme du texte");
   ok(await p.evaluate(()=>{ const r=[...document.querySelectorAll("#coachLog .cmsg.bot .cbody")].pop(); return !!r&&/onerror/.test(r.textContent)&&!r.querySelector("img,script,a"); }),"V6 réponse hostile affichée comme du texte (aucun lien, image ni script)");
   await p.waitForTimeout(1600); await p.evaluate(v=>{ const t=document.querySelector("#coachIn"); t.value=v; },H[5]); await p.click("#coachSend"); await p.waitForTimeout(600);
   ok(hits.length===n0+2&&hits[hits.length-1].messages.slice(-1)[0].content.length<=1000,"V6 message très long tronqué à 1000 caractères avant l'envoi");
   await p.evaluate(()=>{ const n=Date.now(); localStorage.setItem("carnet.coach.rate",JSON.stringify(Array.from({length:20},(_,i)=>n-60000+i))); });
   await p.waitForTimeout(1600); await p.fill("#coachIn","bonjour encore"); await p.click("#coachSend"); await p.waitForTimeout(400);
   ok(hits.length===n0+2,"V6 limite de 20 messages par heure : rien n'est envoyé");
   ok(await p.evaluate(()=>{ const m=[...document.querySelectorAll("#coachLog .cmsg")].pop(); return /err/.test(m.className)&&/20 messages/.test(m.textContent)&&document.querySelector("#coachIn").value==="bonjour encore"; }),"V6 message clair, texte gardé dans le champ");
   await p.fill("#coachIn","x"); await p.evaluate(()=>document.querySelector("#coachForm").requestSubmit()); await p.waitForTimeout(100); ok(/Patiente/.test(await p.textContent("#coachLive")),"V6 rafale (moins de 1,5 s) : annonce « Patiente »");
   await clean(p,"V6 Coach"); await p.ctx.close(); }

 // V7 : retour OAuth piégé et écran de connexion
 { const q="?error=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&error_description=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E#error=javascript:alert(1)";
   const p=await mk({session:null,path:"/"+q}); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>location.search===""&&location.hash===""),"V7 URL de retour en erreur nettoyée");
   ok(await p.evaluate(()=>!document.body.innerHTML.includes("onerror")&&!document.body.textContent.includes("alert(1)")),"V7 le texte reçu dans l'URL n'est jamais affiché");
   await act(p,"login"); await p.waitForSelector("#auth:not([hidden])");
   ok(await p.evaluate(()=>document.querySelector("#auCons").hidden&&!document.querySelector("#auth [aria-invalid]")),"V7 écran de connexion court : pas de cases à cocher avant");
   await p.evaluate(()=>{ const b=document.querySelector("#auth [data-acc=prov]"); b.click(); b.click(); }); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>window.__oauth.length===1),"V7 double clic : une seule redirection OAuth");
   await clean(p,"V7 Connexion"); await p.ctx.close(); }

 ok(!E.length,"console propre, aucune violation CSP",E); ok(!DLG.length,"aucune boîte de dialogue ouverte",DLG);
 await b.close(); S.close(); hook.close(); console.log(fails? fails+" ÉCHEC(S)" : "TOUT OK"); process.exit(fails?1:0); })();
