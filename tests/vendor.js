// supabase-js hébergé : chargé depuis la même origine, seulement si une session existe ; aucune violation de CSP, aucun appel tiers
const {chromium}=require("playwright"); const L=require("./lib"); let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
(async()=>{ const S=await L.serve({"/config.js":L.cfgJs()}); const b=await chromium.launch(); const E=[], ext=[];
 const run=async(init)=>{ const ctx=await b.newContext(); const p=await ctx.newPage(); S.hits.length=0; p.on("console",m=>{ if(["error","warning"].includes(m.type())&&!/Failed to load resource|ERR_|Failed to fetch/.test(m.text())) E.push(m.text().slice(0,150)); }); p.on("pageerror",e=>E.push(e.message));
   p.on("request",r=>{ if(!r.url().startsWith(S.url)&&!r.url().startsWith("data:")&&!r.url().startsWith("https://abcdefghij.supabase.co/")) ext.push(r.url()); }); await p.route("https://abcdefghij.supabase.co/**",r=>r.abort());
   await p.addInitScript(()=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective+" "+e.blockedURI)); }); await p.addInitScript(init);
   await p.goto(S.url+"/"); await p.waitForTimeout(1500); const r={hits:[...S.hits],csp:await p.evaluate(()=>window.__csp),lib:await p.evaluate(()=>typeof (window.supabase&&window.supabase.createClient))}; await ctx.close(); return r; };
 let r=await run(()=>{ localStorage.setItem("carnet.hv","1"); });
 ok(!r.hits.some(h=>h.startsWith("/vendor/")),"visiteur sans session : la bibliothèque n'est même pas chargée",r.hits);
 r=await run(()=>{ localStorage.setItem("carnet.hv","1"); localStorage.setItem("sb-carnet-auth",JSON.stringify({access_token:"junk",refresh_token:"x",expires_at:1,user:{id:"u"}})); });
 ok(r.hits.includes("/vendor/supabase-2.45.4.js"),"avec une session : chargée depuis /vendor/ (même origine)",r.hits); ok(r.lib==="function","la vraie bibliothèque s'initialise (createClient)"); ok(r.csp.length===0,"la vraie bibliothèque ne provoque aucune violation de CSP",r.csp);
 ok(ext.length===0,"aucune requête vers un tiers (hors Supabase simulé)",ext); ok(E.length===0,"console propre avec la vraie bibliothèque",E);
 console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); process.exit(fails?1:0); })();
