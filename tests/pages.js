const {chromium}=require("playwright"); const L=require("./lib"); const fs=require("fs");
const PAGES=["mentions-legales","confidentialite","cgu","cookies","contact","definitely-missing"]; let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
const lum=([r,g,b])=>{ const f=v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
(async()=>{ const S=await L.serve(); const b=await chromium.launch(); const E=[], CSPV=[], OV=[], CON=[];
 for(const cs of ["light","dark"]) for(const w of [320,375,768,1280,1440]){ const ctx=await b.newContext({viewport:{width:w,height:800},colorScheme:cs}); const p=await ctx.newPage();
  p.on("pageerror",e=>E.push(e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/404/.test(m.text())) E.push(m.text().slice(0,150)); });
  await p.addInitScript(()=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI)); });
  for(const n of PAGES){ const resp=await p.goto(S.url+"/"+n); await p.waitForTimeout(150);
   const r=await p.evaluate(()=>{ const ov=document.documentElement.scrollWidth-innerWidth;
     const px=(c)=>{ const m=c.match(/[\d.]+/g).map(Number); return {rgb:m.slice(0,3),a:m.length>3?m[3]:1}; };
     const bgOf=el=>{ let layers=[]; for(let e=el;e;e=e.parentElement){ const c=px(getComputedStyle(e).backgroundColor); if(c.a>0) layers.push(c); if(c.a>=1) break; } let base=[255,255,255]; for(const l of layers.reverse()) base=base.map((v,i)=>l.rgb[i]*l.a+v*(1-l.a)); return base; };
     const worst=[]; for(const el of document.querySelectorAll("h1,h2,p,li,a,td,th,.ph,.banner,.lf p,.back,.btn,code")){ if(!el.getClientRects().length||!el.textContent.trim()) continue; const cs=getComputedStyle(el); const bg=bgOf(el), t=px(cs.color); const fg=t.rgb.map((v,i)=>v*t.a+bg[i]*(1-t.a));
       const L=c=>{ const f=v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }; return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]); }; const a=L(fg), b2=L(bg), ratio=(Math.max(a,b2)+.05)/(Math.min(a,b2)+.05); worst.push([ratio,el.tagName+"."+el.className]); }
     worst.sort((x,y)=>x[0]-y[0]);
     return {ov,h1:(document.querySelector("h1")||{}).textContent,nav:document.querySelectorAll(".legalnav a").length,ph:document.querySelectorAll(".ph:not(.done)").length,title:document.title,worst:worst[0],csp:window.__csp,noscript:document.querySelectorAll("script:not([src])").length,inl:document.querySelectorAll("[style],[onclick],[onerror]").length}; });
   if(r.ov!==0) OV.push([n,w,cs,r.ov]); if(r.csp.length) CSPV.push(...r.csp); if(r.worst&&r.worst[0]<4.5) CON.push([n,w,cs,r.worst]);
   if(w===1280&&cs==="light"){ ok(!!r.h1&&r.nav===(n==="definitely-missing"?5:5)&&!r.noscript&&!r.inl,"page "+n+" : h1, 5 liens légaux, aucun script/style en ligne",r); if(n!=="definitely-missing") ok((r.ph>0||n==="cookies")&&r.title.length>3,"   "+n+" : "+r.ph+" champ(s) à compléter visibles"); else ok(resp.status()===404,"   404 : statut 404"); }
   if(w===375&&n==="confidentialite") await p.screenshot({path:`/tmp/priv-${cs}.png`,fullPage:false}); }
  await ctx.close(); }
 ok(OV.length===0,"aucun débordement horizontal 320-1440, clair et sombre",OV); ok(CSPV.length===0,"CSP : aucune violation",CSPV); ok(CON.length===0,"contrastes AA (>= 4,5) sur tous les textes",CON.slice(0,5)); ok(E.length===0,"console propre",E.slice(0,5));
 // champs remplis : plus de surlignage
 { const S2=await L.serve({"/config.js":()=>fs.readFileSync(L.ROOT+"/config.js","utf8").replace(/EDITEUR_NOM: "[^"]*"/,'EDITEUR_NOM: "Flo Test <b>x</b>"').replace(/EDITEUR_EMAIL: "[^"]*"/,'EDITEUR_EMAIL: "contact@example.org"')}); const ctx=await b.newContext(); const p=await ctx.newPage(); await p.goto(S2.url+"/mentions-legales"); await p.waitForTimeout(200);
   const r=await p.evaluate(()=>({t:document.querySelector('[data-ph=EDITEUR_NOM]').textContent,html:!!document.querySelector("[data-ph=EDITEUR_NOM] b")}));
   ok(r.t==="Flo Test <b>x</b>"&&!r.html,"legal.js : valeurs insérées en texte (aucun HTML interprété)",r);
   await p.goto(S2.url+"/contact"); ok(await p.evaluate(()=>document.getElementById("mailLink").getAttribute("href")==="mailto:contact@example.org"),"lien mailto construit depuis la config"); await ctx.close(); S2.close(); }
 // GitHub Pages « projet » : le site vit sous /repo/ ; tout doit rester sous cette base (aucune requête vers /app.js, /vendor/… à la racine)
 { const SP=await L.serve({"/config.js":L.cfgJs()},"/repo"); const ctx=await b.newContext(); const p=await ctx.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e))); p.on("securitypolicyviolation",()=>errs.push("csp"));
   await p.addInitScript(()=>{ try{ localStorage.setItem("sb-carnet-auth",JSON.stringify({access_token:"a.b.c",refresh_token:"x",expires_at:1,user:{id:"u"}})); }catch(e){} });
   await p.goto(SP.url+"/"); await p.waitForTimeout(1500);
   const css=await p.evaluate(()=>[...document.styleSheets].length); ok(css>=1&&(await p.title()).length>0,"base /repo/ : la page d'accueil et sa feuille de style sont chargées");
   ok(SP.hits.some(h=>h==="/repo/vendor/supabase-2.45.4.js"),"base /repo/ : la bibliothèque est chargée depuis /repo/vendor/",SP.hits);
   ok(SP.hits.every(h=>h.startsWith("/repo/")||h==="/repo"||h==="/favicon.ico"),"base /repo/ : aucune requête hors de la base",SP.hits.filter(h=>!h.startsWith("/repo/")));
   for(const pg of ["cgu","confidentialite","cookies","mentions-legales","contact"]){ const r=await p.goto(SP.url+"/"+pg+".html"); ok(r.status()===200,"base /repo/ : "+pg+".html répond 200"); await p.waitForTimeout(150); const back=await p.evaluate(()=>[...document.querySelectorAll("a[href]")].filter(a=>/^\/(?!\/)/.test(a.getAttribute("href"))).length); ok(back===0,"base /repo/ : "+pg+" n'a aucun lien absolu depuis la racine"); }
   ok(errs.length===0,"base /repo/ : aucune erreur ni violation CSP",errs); await ctx.close(); SP.close(); }
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); })();
