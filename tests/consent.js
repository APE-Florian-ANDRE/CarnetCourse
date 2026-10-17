// Bandeau de consentement : rien n'est chargé avant un choix, Refuser = aucune requête, Accepter = script Vercel (même origine), choix gardé 6 mois
const {chromium}=require("playwright"); const L=require("./lib"); let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const S=await L.serve(); const b=await chromium.launch(); const E=[], ext=[];
 const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage();
 // le 404 du script d'analytics en local est attendu (Web Analytics non activé) : pas une erreur de page
 p.on("pageerror",e=>E.push("PE "+e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource/.test(m.text())&&!/_vercel\/insights\/script\.js/.test(m.text())) E.push(m.type()+" "+m.text().slice(0,160)); });
 p.on("request",r=>{ if(!r.url().startsWith(S.url)&&!r.url().startsWith("data:")) ext.push(r.url()); });
 await p.addInitScript(()=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI)); });
 const va=()=>S.hits.filter(h=>h.startsWith("/_vercel/")); const vis=()=>p.evaluate(()=>{ const x=document.getElementById("ckBar"); return !!x&&!x.hidden&&x.getClientRects().length>0; });
 const store=()=>p.evaluate(()=>JSON.parse(localStorage.getItem("carnet.cookies")||"null"));

 S.hits.length=0; await p.goto(S.url+"/"); await p.waitForTimeout(600);
 ok(await vis(),"premier chargement : bandeau visible");
 const a11y=await p.evaluate(()=>{ const x=document.getElementById("ckBar"); const y=x.querySelector("[data-ck=yes]").getBoundingClientRect(), n=x.querySelector("[data-ck=no]").getBoundingClientRect(), cy=getComputedStyle(x.querySelector("[data-ck=yes]")), cn=getComputedStyle(x.querySelector("[data-ck=no]"));
   return {role:x.getAttribute("role"),label:x.getAttribute("aria-label"),same:Math.round(y.width)===Math.round(n.width)&&Math.round(y.height)===Math.round(n.height)&&cy.backgroundColor===cn.backgroundColor&&cy.color===cn.color&&cy.fontWeight===cn.fontWeight,h:y.height,pad:parseFloat(getComputedStyle(document.body).paddingBottom),focus:document.activeElement===document.body||!x.contains(document.activeElement),custom:!!x.querySelector("[data-ck=custom]")}; });
 ok(a11y.role==="region"&&!!a11y.label,"bandeau : role=region et aria-label",a11y); ok(a11y.same&&a11y.h>=44,"Accepter et Refuser : même taille, même couleur, même graisse (44 px mini)",a11y); ok(a11y.custom,"lien « Personnaliser » présent");
 ok(a11y.pad>0,"bandeau visible : le bas de page reste atteignable (padding-bottom)",a11y.pad); ok(a11y.focus,"le bandeau ne vole pas le focus au chargement");
 ok(va().length===0,"avant tout choix : aucune requête vers /_vercel/",va()); ok(await p.evaluate(()=>!document.querySelector("script[data-ck-va]")&&typeof window.va==="undefined"),"avant tout choix : ni script ni file d'attente window.va");
 ok(await p.evaluate(()=>window.CarnetConsent.get()===null),"CarnetConsent.get() = null avant choix");
 // clavier : le bandeau est atteignable par Tab, sans piège
 ok(await p.evaluate(()=>{ const f=[...document.querySelectorAll('a[href],button,input,[tabindex]:not([tabindex="-1"])')].find(x=>!x.disabled&&x.getClientRects().length); return !!f&&!!f.closest("#ckBar"); }),"clavier : le bandeau vient en premier dans l'ordre de tabulation");
 await p.focus("#ckBar [data-ck=no]"); await p.keyboard.press("Tab"); ok(await p.evaluate(()=>document.activeElement.getAttribute("data-ck")==="yes"),"clavier : Tab passe de Refuser à Accepter");

 // Refuser
 await p.click("#ckBar [data-ck=no]"); await p.waitForTimeout(300); let st=await store();
 ok(!await vis()&&st&&st.v===1&&st.analytics===false&&!isNaN(Date.parse(st.at)),"Refuser : bandeau caché, choix enregistré {v:1, analytics:false, at}",st);
 ok(await p.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingBottom))===0,"bandeau caché : plus de padding-bottom");
 S.hits.length=0; await p.reload(); await p.waitForTimeout(600);
 ok(!await vis(),"Refuser puis rechargement : bandeau caché"); ok(va().length===0,"Refuser : aucune requête vers /_vercel/",va());

 // Gérer les cookies (pied de page) rouvre le bandeau, focus sur le premier choix
 await p.goto(S.url+"/cookies.html"); await p.waitForTimeout(300); ok(!await vis(),"cookies.html : bandeau caché (choix déjà fait)");
 ok(/refusée/.test(await p.textContent("#ckState")),"cookies.html : état du choix affiché");
 await p.click(".lf [data-consent-open]"); await p.waitForTimeout(200);
 ok(await vis(),"« Gérer les cookies » rouvre le bandeau"); ok(await p.evaluate(()=>document.activeElement.getAttribute("data-ck")==="no"),"réouverture : focus dans le bandeau");
 await p.keyboard.press("Escape"); ok(!await vis(),"Échap referme le bandeau rouvert (choix existant)");
 await p.click("main [data-consent-open]"); ok(await vis(),"bouton de cookies.html rouvre le bandeau");
 // Personnaliser : case décochée par défaut quand le choix est un refus
 await p.click("#ckBar [data-ck=custom]"); ok(await p.evaluate(()=>!document.getElementById("ckP").hidden&&!document.getElementById("ckA").checked),"Personnaliser : case mesure d'audience non cochée");

 // Accepter
 S.hits.length=0; await p.click("#ckBar [data-ck=yes]"); await p.waitForTimeout(600); st=await store();
 ok(st&&st.analytics===true,"Accepter : choix enregistré analytics:true",st); ok(va().includes("/_vercel/insights/script.js"),"Accepter : requête vers /_vercel/insights/script.js",S.hits);
 ok(await p.evaluate(()=>typeof window.va==="function"&&!document.querySelector("script[data-ck-va]")),"404 en local : file window.va posée, balise retirée sans erreur");
 S.hits.length=0; await p.goto(S.url+"/"); await p.waitForTimeout(600);
 ok(!await vis()&&va().includes("/_vercel/insights/script.js"),"Accepté : script chargé à chaque page, bandeau caché",va());

 // retrait du consentement depuis l'accueil
 await p.evaluate(()=>window.CarnetConsent.open()); ok(await vis(),"CarnetConsent.open() rouvre le bandeau");
 await p.click("#ckBar [data-ck=no]"); await p.waitForTimeout(200);
 ok(await p.evaluate(()=>typeof window.va==="undefined"&&typeof window.vaq==="undefined"),"retrait : window.va nettoyé");
 S.hits.length=0; await p.reload(); await p.waitForTimeout(600); ok(va().length===0,"retrait : plus aucun chargement au prochain affichage",va());
 ok(await p.evaluate(()=>localStorage.getItem("va-disable")===null),"retrait : rien ne traîne dans le stockage");

 // expiration : choix de plus de 6 mois redemandé
 await p.evaluate(()=>{ const d=new Date(); d.setMonth(d.getMonth()-7); localStorage.setItem("carnet.cookies",JSON.stringify({v:1,analytics:true,at:d.toISOString()})); });
 S.hits.length=0; await p.reload(); await p.waitForTimeout(600);
 ok(await vis()&&va().length===0&&(await store())===null,"choix de plus de 6 mois : bandeau réaffiché, rien chargé, ancien choix effacé");
 await p.evaluate(()=>{ const d=new Date(); d.setMonth(d.getMonth()-5); localStorage.setItem("carnet.cookies",JSON.stringify({v:1,analytics:false,at:d.toISOString()})); });
 await p.reload(); await p.waitForTimeout(400); ok(!await vis(),"choix de 5 mois : toujours valable");

 // toutes les pages : bandeau présent au premier chargement, sans requête
 for(const pg of ["cgu.html","confidentialite.html","mentions-legales.html","contact.html","cookies.html","nexistepas"]){ const c2=await b.newContext(); const q=await c2.newPage(); S.hits.length=0;
   await q.goto(S.url+"/"+pg); await q.waitForTimeout(250); const r=await q.evaluate(()=>({v:!!document.getElementById("ckBar")&&!document.getElementById("ckBar").hidden,btn:!!document.querySelector(".legalnav [data-consent-open]")}));
   ok(r.v&&r.btn&&va().length===0,pg+" : bandeau, lien « Gérer les cookies », aucune requête analytics",r); await c2.close(); }
 // sombre : contraste du texte et des boutons
 { const c2=await b.newContext({colorScheme:"dark",viewport:{width:320,height:640}}); const q=await c2.newPage(); await q.goto(S.url+"/cookies.html"); await q.waitForTimeout(250);
   const r=await q.evaluate(()=>{ const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number); const Lm=c=>{ const f=v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }; return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]); }; const cr=(a,b)=>{ const x=Lm(a),y=Lm(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
     const bar=document.getElementById("ckBar"), bg=rgb(getComputedStyle(bar).backgroundColor); const t=cr(rgb(getComputedStyle(bar.querySelector(".ck-t")).color),bg), a=cr(rgb(getComputedStyle(bar.querySelector("a")).color),bg); const btn=bar.querySelector(".ck-btn"), k=cr(rgb(getComputedStyle(btn).color),rgb(getComputedStyle(btn).backgroundColor));
     return {t,a,k,ov:document.documentElement.scrollWidth-innerWidth}; });
   ok(r.t>=4.5&&r.a>=4.5&&r.k>=4.5&&r.ov===0,"sombre 320 px : contrastes AA, aucun débordement",r); await c2.close(); }

 ok(await p.evaluate(()=>window.__csp.length===0),"aucune violation CSP",await p.evaluate(()=>window.__csp)); ok(ext.length===0,"aucune requête vers un tiers",ext); ok(E.length===0,"console propre",E);
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); process.exit(fails?1:0); })();
