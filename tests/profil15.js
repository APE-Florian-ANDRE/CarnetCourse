// v15 : profil en sections repliables ; l'écran Semaine ne garde que le quotidien ; aucune perte de champ
const {chromium}=require("playwright"); const L=require("./lib");
const prof={sexe:"H",age:35,taille:178,poids:80,cible:"75",niveau:"int",objectif:"10",volume:25,longest:10,seances:"4",renfo:"2",longDay:"6",start:"2026-09-28",deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma"],cross:"non",raceDate:"2026-12-13"};
const seed=JSON.stringify({profile:prof,isExample:false,log:[],week:2,seen:15});
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,300):"")); };
const IDS=["sexe","age","taille","poids","cible","mg","activite","sport","sObj","hSem","niveau","objectif","raceDate","volume","longest","ref","refVal","fcmax","lieu","types","cross","equip","seances","renfo","longDay","start","deficit","bonus","adj"];
(async()=>{ const S=await L.serve({"/config.js":L.cfgJs()}); const b=await chromium.launch(); const E=[], CSPV=[];
 const mk=async(w,cs="light",sd=seed)=>{ const ctx=await b.newContext({viewport:{width:w,height:800},colorScheme:cs,locale:"fr-FR"}); const p=await ctx.newPage(); p.on("pageerror",e=>E.push(e.message)); p.on("console",m=>{ if(["error","warning"].includes(m.type())) E.push(m.text().slice(0,150)); });
  await L.fake(p,L.makeDb(),{}); await p.addInitScript(({sd})=>{ window.__csp=[]; document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective)); if(!sessionStorage.s){ sessionStorage.s=1; localStorage.setItem("carnet-course.v1",sd); localStorage.setItem("carnet.hv","1"); localStorage.setItem("carnet.vu","15"); } },{sd}); await p.goto(S.url+"/"); await p.waitForTimeout(900); p.ctx=ctx; return p; };
 { const p=await mk(1280);
   ok(await p.evaluate(()=>!document.querySelector(".wrap > #summary, header ~ #summary:not(#p-profil *)")&&!!document.querySelector("#p-profil #summary")),"P1 le bilan chiffré a quitté le haut de l'écran : il est dans Profil");
   ok(await p.evaluate(ids=>ids.every(i=>document.querySelector("#p-profil [id='"+i+"'],#p-profil [name='"+i+"']")&&!document.querySelector("#p-semaine [id='"+i+"']")),IDS),"P1 les 29 champs d'objectif et de données sont tous dans Profil, aucun dans Semaine");
   ok(await p.evaluate(()=>[...document.querySelectorAll("#p-semaine > *")].map(e=>e.id||e.className).join(",")),"P1 Semaine : "+await p.evaluate(()=>[...document.querySelectorAll("#p-semaine > *")].map(e=>e.id||e.className).join(",")));
   await p.click("#tab-profil"); const sec=await p.evaluate(()=>[...document.querySelectorAll("#profileForm details.psec")].map(d=>({id:d.id,open:d.open,t:d.querySelector(".pt").textContent,s:d.querySelector(".ps").textContent})));
   ok(sec.length===5&&["ps-sum","ps-obj","ps-me","ps-trn","ps-nut"].every((x,i)=>sec[i].id===x),"P2 cinq sections : bilan, objectif, données, entraînements, nutrition",sec);
   ok(sec.every(s=>s.t&&s.s.length>5),"P2 chaque section a un titre et un résumé",sec);
   ok(/Course à pied/.test(sec[1].s)&&/10 km/.test(sec[1].s)&&/13/.test(sec[1].s)&&/75/.test(sec[1].s),"P2 résumé objectif : sport, course, date, poids visé",sec[1].s);
   ok(/35 ans/.test(sec[2].s)&&/178 cm/.test(sec[2].s)&&/80/.test(sec[2].s),"P2 résumé données",sec[2].s); ok(/4 séances/.test(sec[3].s)&&/déficit 300/.test(sec[4].s),"P2 résumés entraînements et nutrition",[sec[3].s,sec[4].s]);
   ok(sec[1].open&&sec[2].open&&!sec[3].open&&!sec[4].open,"P2 objectif et données ouverts, le reste replié");
   // clavier : Tab jusqu'au résumé, Entrée ouvre
   await p.focus("#ps-trn > summary"); await p.keyboard.press("Enter"); ok(await p.evaluate(()=>document.querySelector("#ps-trn").open),"P3 clavier : Entrée déplie une section");
   await p.keyboard.press("Space"); ok(await p.evaluate(()=>!document.querySelector("#ps-trn").open),"P3 clavier : Espace la replie");
   ok(await p.evaluate(()=>{ const s=document.querySelector("#ps-trn > summary"); s.focus(); const o=getComputedStyle(s).outlineStyle; return o!=="none"; }),"P3 focus visible sur le résumé");
   // le résumé suit les modifications
   await p.selectOption("#sport","vtt"); await p.waitForTimeout(200); ok(await p.evaluate(()=>/VTT/.test(document.querySelector("#psl-obj").textContent)),"P4 résumé mis à jour en direct (sport = VTT)");
   await p.selectOption("#sport","course"); await p.fill("#age","41"); await p.waitForTimeout(200); ok(await p.evaluate(()=>/41 ans/.test(document.querySelector("#psl-me").textContent)),"P4 résumé « données » mis à jour");
   // mémorisation de l'état
   await p.click("#ps-nut > summary"); await p.click("#ps-obj > summary"); await p.waitForTimeout(200); await p.reload(); await p.waitForTimeout(700); await p.click("#tab-profil");
   ok(await p.evaluate(()=>document.querySelector("#ps-nut").open&&!document.querySelector("#ps-obj").open),"P5 sections ouvertes/repliées mémorisées");
   await p.evaluate(()=>localStorage.setItem("carnet.psec",'{"ps-me":"x","__proto__":1,"zz":1,"ps-trn":1}')); await p.reload(); await p.waitForTimeout(700); await p.click("#tab-profil"); ok(await p.evaluate(()=>document.querySelector("#ps-trn").open&&!!document.querySelector("#ps-me")),"P5 stockage piégé : ignoré proprement");
   // « Remplir mon profil » (exemple) ouvre la section qui contient le focus
   await p.evaluate(()=>{ localStorage.setItem("carnet.psec",'{"ps-me":0}'); }); await p.reload(); await p.waitForTimeout(700); await p.evaluate(()=>{ document.querySelector("#exampleBanner").hidden=false; }); await p.click("#goProfile"); await p.waitForTimeout(200);
   ok(await p.evaluate(()=>!document.querySelector("#wiz").hidden&&document.activeElement&&!!document.activeElement.closest("#wiz")),"P6 « Remplir mon profil » ouvre l'assistant (audit UX-03 : jamais les valeurs de l'exemple gardées sans les voir)");
   await p.ctx.close(); }
 // exemple : aucune perte, bannière ; assistant et « Refaire mon profil »
 { const p=await mk(390,"light",JSON.stringify({profile:prof,isExample:true,log:[],week:1,seen:15})); await p.evaluate(()=>document.querySelector("[data-act=home]")&&document.querySelector("[data-act=home]").click()); await p.waitForTimeout(300);
   ok(await p.evaluate(()=>!!document.querySelector("[data-act=wizard]")||!!document.querySelector("[data-act=open]")),"P7 l'accueil propose toujours l'assistant / « Refaire mon profil »");
   await p.evaluate(()=>document.querySelector("[data-act=wizard]").click()); await p.waitForTimeout(300); ok(await p.evaluate(()=>!document.querySelector("#wiz").hidden),"P7 l'assistant s'ouvre"); await p.ctx.close(); }
 // 320 à 1440, clair et sombre : pas de débordement, contraste AA du résumé
 const lum=([r,g,bb])=>{ const f=v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(bb); };
 for(const cs of ["light","dark"]) for(const w of [320,375,768,1280,1440]){ const p=await mk(w,cs); await p.click("#tab-profil"); await p.evaluate(()=>document.querySelectorAll("details.psec").forEach(d=>d.open=true)); await p.waitForTimeout(150);
   const r=await p.evaluate(()=>{ const ov=document.documentElement.scrollWidth>window.innerWidth; const bad=[...document.querySelectorAll("#p-profil details.psec *")].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1&&e.getClientRects().length).length;
     const s=document.querySelector("#ps-obj .ps"), d=document.querySelector("#ps-obj"); const col=getComputedStyle(s).color, bg=getComputedStyle(d).backgroundColor, page=getComputedStyle(document.body).backgroundColor; return {ov,bad,col,bg,page,sh:document.querySelector("#ps-me > summary").getBoundingClientRect().height}; });
   const pc=c=>{ const m=c.match(/[\d.]+/g).map(Number); return m; }, over=(f,g)=>{ const a=f[3]==null?1:f[3]; return [0,1,2].map(i=>f[i]*a+g[i]*(1-a)); };
   const page=pc(r.page).slice(0,3), bg=over(pc(r.bg),page), fg=over(pc(r.col),bg), L1=lum(fg), L2=lum(bg), cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
   ok(!r.ov&&r.bad===0,"P8 "+cs+" "+w+" px : aucun débordement",r); ok(cr>=4.5&&r.sh>=44,"P8 "+cs+" "+w+" px : contraste du résumé "+cr.toFixed(1)+":1, cible tactile "+Math.round(r.sh)+" px");
   await p.evaluate(()=>0); const v=await p.evaluate(()=>window.__csp||[]); CSPV.push(...v); await p.ctx.close(); }

 // v15.1 : texte jamais rogné (Plan, Repères, tous les sports, 320 à 360 px) ; valeurs saisies hors limites ; bilan en direct ; onglets 44 px
 for(const sp of ["course","trail","vtt","force","forme"]) for(const w of [320,340,360]){ const sd=JSON.stringify({profile:{...prof,sport:sp,sObj:sp==="vtt"?"long":sp==="force"?"ppl":"",hSem:"6",raceDate:""},isExample:false,log:[],week:2,seen:15}); const p=await mk(w,"light",sd);
   for(const tab of ["plan","reperes","semaine","suivi"]){ await p.click("#tab-"+tab); await p.waitForTimeout(150);
     const bad=await p.evaluate(tab=>[...document.querySelectorAll("#p-"+tab+" *")].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=="none"&&(e.getBoundingClientRect().right>window.innerWidth+1||(e.scrollWidth>e.clientWidth+1&&/hidden|clip/.test(getComputedStyle(e).overflowX)&&!e.closest("svg")&&e.clientWidth>0))).slice(0,3).map(e=>e.tagName+"."+e.className+" "+e.scrollWidth+">"+e.clientWidth),tab);
     if(bad.length) ok(false,"U1 "+sp+" "+w+" px onglet "+tab+" : texte rogné ou débordant",bad); }
   ok(true,"U1 "+sp+" "+w+" px : Plan, Repères, Semaine, Suivi sans texte rogné"); await p.ctx.close(); }
 { const p=await mk(375); await p.click("#tab-profil");
   // saisie en cours hors limites : valeur précédente gardée (jamais enregistrée telle quelle), aria-invalid, message sous le champ, avertissement dans le bilan
   await p.fill("#age","5"); await p.waitForTimeout(300);
   const o=await p.evaluate(()=>({inv:document.querySelector("#age").getAttribute("aria-invalid"),msg:(document.querySelector("#ageFix")||{}).textContent||"",desc:document.querySelector("#age").getAttribute("aria-describedby")||"",saved:JSON.parse(localStorage.getItem("carnet-course.v1")).profile.age,bil:document.querySelector("#summary").textContent}));
   ok(o.inv==="true"&&/Hors limites : de 15 à 90 ans/.test(o.msg)&&/ageFix/.test(o.desc),"U2 âge 5 : aria-invalid + message sous le champ",o);
   ok(String(o.saved)==="35"&&/Corrige ta saisie/.test(o.bil),"U2 âge 5 : la valeur invalide n'est pas enregistrée, le bilan prévient",o);
   ok(/15 à 90|hors limites/.test(await p.textContent("#psl-sum")),"U2 résumé du bilan : saisie hors limites signalée");
   await p.fill("#poids","9999"); await p.waitForTimeout(250);   // valide l'âge (change) puis saisit le poids
   const t=await p.textContent("#psl-me"); ok(/15 ans \(saisi : 5, ramené au minimum\)/.test(t),"U2 « Mes données » : âge ramené, dit avec la valeur saisie",t);
   await p.press("#poids","Tab"); await p.waitForTimeout(300);
   const t1=await p.textContent("#psl-me"); ok(/saisi : 9999, ramené au maximum/.test(t1),"U2 « Mes données » montre la valeur saisie avec l'avertissement, jamais une valeur écrêtée",t1);
   const bl=await p.textContent("#summary"); ok(/Valeur corrigée/.test(bl)&&/9999/.test(bl)&&/ramené à 250/.test(bl),"U2 le bilan (kcal) ne présente pas une valeur écrêtée sans avertissement",bl.slice(0,200));
   await p.fill("#poids","81,5"); await p.fill("#age","35"); await p.waitForTimeout(250); const t2=await p.textContent("#psl-me"); ok(/81,5 kg/.test(t2)&&!/hors|saisi/.test(t2)&&await p.evaluate(()=>!/Valeur corrigée|Corrige ta saisie/.test(document.querySelector("#summary").textContent)&&!document.querySelector("#age").hasAttribute("aria-invalid")),"U2 valeur valide : affichée normalement, avertissements retirés",t2);
   const bil=await p.textContent("#psl-sum"); ok(/kcal\/j en moyenne/.test(bil)&&/déficit|surplus/.test(bil)&&/\d/.test(bil),"U3 « Mon bilan » : chiffres en direct",bil);
   const h=await p.evaluate(()=>[...document.querySelectorAll("nav.tabs [role=tab]")].map(b=>Math.round(b.getBoundingClientRect().height))); ok(h.every(x=>x>=44),"U4 onglets : cible tactile ≥ 44 px",h); await p.ctx.close(); }
 // onglets : au moins 44 px de large à 320, 340 et 375 px
 for(const w of [320,340,375]){ const p=await mk(w); const r=await p.evaluate(()=>[...document.querySelectorAll("nav.tabs [role=tab]")].filter(b=>b.getClientRects().length).map(b=>Math.round(b.getBoundingClientRect().width))); ok(r.length>=4&&r.every(x=>x>=44),"U4 onglets "+w+" px : largeur ≥ 44 px",r); await p.ctx.close(); }
 console.log("erreurs",E,"CSP",CSPV); fails+=E.length+CSPV.length; console.log(fails?"ECHECS "+fails:"TOUT OK"); await b.close(); S.close(); process.exit(fails?1:0); })();
