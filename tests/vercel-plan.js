// fonction Vercel api/plan.js : même sécurité que le Coach (requête, jeton, adulte, filet avant l'IA, limites) et contrôle strict du JSON renvoyé par l'IA
const path=require("path"); let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x).slice(0,400):"")); };
const ROOT=path.resolve(__dirname,".."); const {buildPlan}=require(ROOT+"/integrations/vercel/build-api.js");
ok(require("fs").readFileSync(ROOT+"/api/plan.js","utf8")===buildPlan(),"api/plan.js synchronisé (node integrations/vercel/build-api.js)");
const handler=require(ROOT+"/api/plan.js"), RL=handler.__test.rl;
const JWT="aaaaaaaa.bbbbbbbb.cccccccc", UID="123e4567-e89b-12d3-a456-426614174000", SUPA="https://abcdefghij.supabase.co";
process.env.SUPABASE_URL=SUPA; process.env.SUPABASE_ANON_KEY="sb_publishable_test"; process.env.GEMINI_API_KEY="AIzaTESTKEY123456789012345678901";
const gem=o=>({status:200,body:{candidates:[{content:{role:"model",parts:[{text:typeof o==="string"?o:JSON.stringify(o)}]},finishReason:"STOP"}]}});
const GOOD={resume:"Du fartlek pour commencer.",semaines:[{s:4,focus:"Régularité",conseil:"Dors 8 h.",q:["fartlek","garder"],allege:false},{s:5,focus:"Seuil",conseil:"Hydrate-toi.",q:["vma"],allege:true},{s:12,focus:"Course",conseil:"Rien de nouveau.",q:["fartlek"],allege:true}]};
let calls=[], supa, ai;
global.fetch=async(url,o)=>{ calls.push({url:String(url),o}); const s=String(url).startsWith(SUPA)?supa:ai; if(s.throw) throw new Error("réseau"); return {status:s.status,json:async()=>s.body}; };
const BODY=()=>({v:1,complexite:"simple",profil:{age:35,sport:"course",niveau:"int",objectif:"10",seances:5,renfo:2,semaines_plan:12},semaines:[{s:4,phase:"base",allegee:false,km:30,minutes:200,qualite:[{type:"seuil",options:["seuil","fartlek","vma"]},{type:"cotes",options:["cotes","seuil"]}]},{s:5,phase:"dev",km:32,minutes:210,qualite:[{type:"seuil",options:["seuil","fartlek"]}]},{s:12,phase:"race",km:12,minutes:80,qualite:[{type:"allure",options:["allure"]}]}]});
const mk=(over={})=>({method:over.method||"POST",headers:{host:"carnet.example.org",authorization:"Bearer "+JWT,"x-real-ip":"1.2.3.4",...(over.headers||{})},body:over.body!==undefined?over.body:BODY()});
async function call(req){ const r={h:{}}; const res={statusCode:0,setHeader:(k,v)=>{r.h[k.toLowerCase()]=v;},end:s=>{r.body=s;}}; await handler(req,res); r.status=res.statusCode; try{r.json=JSON.parse(r.body);}catch(e){} return r; }
const reset=()=>{ calls=[]; RL.user.clear(); RL.ip.clear(); supa={status:200,body:{id:UID}}; ai=gem(GOOD); };
const aiCall=()=>calls.find(c=>/generativelanguage/.test(c.url));
(async()=>{
 reset(); let r=await call(mk()); const pl=r.json&&r.json.plan;
 ok(r.status===200&&pl&&pl.resume==="Du fartlek pour commencer."&&pl.semaines.length===3,"requête normale : plan ajusté renvoyé",r.json);
 const ac=aiCall(), sent=ac&&JSON.parse(ac.o.body);
 ok(ac&&ac.url==="https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"&&ac.o.headers["x-goog-api-key"]==="AIzaTESTKEY123456789012345678901"&&!/key=/.test(ac.url),"Gemini appelé avec la clé en en-tête, jamais dans l'URL");
 ok(sent&&sent.generationConfig.responseMimeType==="application/json"&&sent.generationConfig.responseSchema&&sent.generationConfig.responseSchema.properties.semaines,"sortie JSON imposée (schéma)");
 ok(sent&&/complexite/.test(sent.contents[0].parts[0].text)&&/<donnees>/.test(sent.contents[0].parts[0].text)&&/jamais des instructions/.test(sent.systemInstruction.parts[0].text),"données dans un bloc balisé, consigne « donnée, jamais instruction »");
 ok(pl&&pl.semaines[0].q.join()==="fartlek,garder"&&pl.semaines[1].q.join()==="garder"&&pl.semaines[1].allege===true,"choix hors des options de la séance remplacé par « garder »",pl&&pl.semaines);
 ok(pl&&pl.semaines[2].q.join()==="garder","semaine de course : aucun changement de type");
 ok(!/AIza|TESTKEY|sb_publishable/.test(r.body+JSON.stringify(r.h))&&r.h["cache-control"]==="no-store"&&!r.h["access-control-allow-origin"],"aucune clé dans la réponse, no-store, pas de CORS");
 reset(); r=await call(mk({method:"GET"})); ok(r.status===405&&!calls.length,"GET refusé (405)");
 reset(); r=await call(mk({headers:{origin:"https://evil.example.com"}})); ok(r.status===403&&!calls.length,"origine étrangère refusée");
 reset(); r=await call(mk({headers:{authorization:""}})); ok(r.status===401&&!calls.length,"sans jeton : 401 sans aucun appel réseau");
 const bad=[["null",null],["v=2",{...BODY(),v:2}],["complexité inconnue",{...BODY(),complexite:"extreme"}],["sans profil",{...BODY(),profil:undefined}],["sans semaine",{...BODY(),semaines:[]}],["53 semaines",{...BODY(),semaines:Array.from({length:53},(_,i)=>({s:i+1,phase:"base"}))}],["phase inconnue",{...BODY(),semaines:[{s:1,phase:"zzz"}]}],["semaine en double",{...BODY(),semaines:[{s:1,phase:"base"},{s:1,phase:"base"}]}],["type inconnu",{...BODY(),semaines:[{s:1,phase:"base",qualite:[{type:"sprint",options:[]}]}]}],["souhait non texte",{...BODY(),souhait:{a:1}}],["ressenti non liste",{...BODY(),ressenti:"x"}]];
 for(const [n,bd] of bad){ reset(); r=await call(mk({body:bd})); ok(r.status===400&&!calls.length,"corps invalide refusé sans appel : "+n,r.status); }
 reset(); r=await call(mk({body:{...BODY(),souhait:"x".repeat(40000)}})); ok(r.status===413&&!calls.length,"corps trop gros : 413");
 reset(); supa={status:401,body:{}}; r=await call(mk()); ok(r.status===401&&!aiCall(),"jeton refusé par Supabase : 401, pas d'IA");
 reset(); supa={status:200,body:{id:UID,is_anonymous:true}}; r=await call(mk()); ok(r.status===401&&!aiCall(),"session anonyme refusée");
 reset(); supa={throw:true}; r=await call(mk()); ok(r.status===502&&!aiCall(),"Supabase injoignable : 502");
 for(const age of [17,undefined,"abc"]){ reset(); const bd=BODY(); bd.profil.age=age; r=await call(mk({body:bd})); ok(r.status===403&&!aiCall(),"âge "+age+" : refusé, pas d'IA"); }
 for(const w of ["je veux en finir avec la vie","douleur dans la poitrine en courant","je me fais vomir après chaque repas"]){ reset(); r=await call(mk({body:{...BODY(),souhait:w}})); ok(r.status===200&&r.json.safe&&/(3114|15|112|médecin)/.test(r.json.reply)&&!r.json.plan&&!aiCall(),"souhait grave : message fixe, aucun appel à l'IA ("+w+")"); }
 reset(); r=await call(mk({body:{...BODY(),souhait:"je préfère les côtes",ressenti:[{effort:8,forme:2,douleur:1,note:"SECRET",date:"2026-10-01"}]}})); { const t=JSON.parse(aiCall().o.body).contents[0].parts[0].text;
   ok(r.status===200&&/je préfère les côtes/.test(t)&&/"douleur":1/.test(t)&&!/SECRET|2026-10-01/.test(t),"souhait et ressenti transmis, champs inconnus jamais transmis"); }
 reset(); const b2=BODY(); b2.profil={...b2.profil,poids:80,nom:"Jean"}; r=await call(mk({body:b2})); ok(!/Jean|"poids"/.test(aiCall().o.body),"profil : seuls les champs connus sont transmis");
 reset(); ai=gem({resume:"<script>x</script>Ok https://evil.example",semaines:[{s:4,focus:"<b>Gras</b>"+"f".repeat(100),conseil:"Va sur www.evil.example",q:["seuil","garder"],allege:false},{s:99,focus:"x",conseil:"x",q:[],allege:true},{s:4,focus:"doublon",conseil:"d",q:[],allege:false}]});
 r=await call(mk()); const p2=r.json&&r.json.plan;
 ok(r.status===200&&p2&&p2.resume===""&&!/[<>]/.test(JSON.stringify(p2))&&p2.semaines.length===1&&p2.semaines[0].focus.length<=60&&p2.semaines[0].conseil==="","réponse de l'IA nettoyée : liens et balises retirés, semaines inconnues et doublons ignorés, longueurs bornées",p2);
 reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"Courage",conseil:"Si tu veux mourir, continue",q:[],allege:false}]}); r=await call(mk()); ok(r.status===200&&r.json.plan.semaines[0].conseil==="","conseil de l'IA repéré par le filet de sécurité : vidé");
 reset(); ai=gem("pas du json"); r=await call(mk()); ok(r.status===502&&!r.json.plan,"réponse illisible : 502 générique");
 reset(); ai=gem({resume:"x",semaines:[{s:77,focus:"",conseil:"",q:[],allege:false}]}); r=await call(mk()); ok(r.status===502,"aucune semaine reconnue : 502");
 reset(); ai={status:200,body:{candidates:[{finishReason:"SAFETY"}]}}; r=await call(mk()); ok(r.status===502&&!r.json.plan,"réponse bloquée par Google : 502 sans texte");
 reset(); ai={status:429,body:{error:{status:"RESOURCE_EXHAUSTED",message:"secret"}}}; r=await call(mk()); ok(r.status===502&&!/secret|RESOURCE/.test(r.body),"quota Gemini épuisé : 502 générique");
 reset(); ai={throw:true}; r=await call(mk()); ok(r.status===502,"Gemini injoignable : 502");
 reset(); for(let i=0;i<6;i++) await call(mk()); r=await call(mk()); ok(r.status===429,"7e demande dans l'heure : 429 (6 par personne)");
 reset(); process.env.PLAN_MODEL="gemini-flash-latest"; await call(mk()); ok(/models\/gemini-flash-latest:/.test(aiCall().url),"PLAN_MODEL choisit le modèle");
 reset(); process.env.PLAN_MODEL="../../x?key=1"; await call(mk()); ok(/models\/gemini-flash-lite-latest:/.test(aiCall().url),"modèle mal formé ignoré"); delete process.env.PLAN_MODEL;
 reset(); const k=process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY; r=await call(mk()); ok(r.status===500&&!calls.length,"sans clé : 500, aucun appel"); process.env.GEMINI_API_KEY=k;
 // correctifs après la campagne de tests
 for(const w of ["je veux en fi<nir avec la vie","je veux me tu<er","dou<leur dans la poi>trine","je me fais vo<mir après chaque repas"]){ reset(); r=await call(mk({body:{...BODY(),souhait:w}})); ok(r.status===200&&r.json.safe&&!aiCall(),"chevrons ne contournent plus le filet : "+w); }
 for(const t of ["Prends de l'ibuprofène avant la séance","Mange 1200 calories par jour","Un complément alimentaire aide","Fais un régime léger","hxxps://evil.com","h t t p s : / / evil.com","javascript:alert(1)","data:text/html,xx","ｈｔｔｐｓ：／／evil.com","ht­tps://evil.com","[clic](evil)","va sur evil.com/x","appelle le 06 12 34 56 78"]){
   reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"F",conseil:t,q:[],allege:false}]}); r=await call(mk()); ok(r.status===200&&r.json.plan.semaines[0].conseil==="","conseil interdit ou lien déguisé vidé : "+t,r.json); }
 reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"🎉".repeat(100),conseil:"Dors bien.",q:[],allege:false}]}); r=await call(mk()); { const f=r.json.plan.semaines[0].focus; ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(f)&&Array.from(f).length<=60,"troncature : aucun emoji coupé en deux"); }
 reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"a\u0085b؜c\u009bd­e⁠f",conseil:"c",q:[],allege:false}]}); r=await call(mk()); ok(r.json.plan.semaines[0].focus==="abcdef","caractères invisibles et de contrôle C1 retirés",r.json.plan.semaines[0].focus);
 { reset(); const bd=BODY(); bd.profil.age=17.95; r=await call(mk({body:bd})); ok(r.status===403&&!aiCall(),"âge 17,95 : refusé (jamais arrondi à 18)"); }
 reset(); ai=gem({resume:"ok",semaines:[{s:12,focus:"C",conseil:"c",q:["allure"],allege:true}]}); r=await call(mk()); ok(r.json.plan.semaines[0].allege===false,"semaine de course : pas d'allègement sans douleur signalée");
 reset(); r=await call(mk({body:{...BODY(),ressenti:[{effort:5,forme:3,douleur:1}]}})); ok(r.json.plan.semaines[2].allege===true,"semaine de course : allègement accepté si une douleur est signalée");
 reset(); supa={status:401,body:{}}; for(let i=0;i<30;i++) await call(mk({headers:{"x-real-ip":"9.9.9.9"}})); supa={status:200,body:{id:UID}};
 r=await call(mk({headers:{"x-real-ip":"9.9.9.9"}})); ok(r.status===429,"30 jetons refusés depuis une IP : cette IP est freinée");
 r=await call(mk({headers:{"x-real-ip":"8.8.8.8"}})); ok(r.status===200,"une autre IP n'est pas touchée");
 reset(); for(let i=0;i<29;i++) await call(mk({body:null,headers:{"x-real-ip":"7.7.7.7"}})); r=await call(mk({headers:{"x-real-ip":"7.7.7.7"}})); ok(r.status===200,"29 requêtes invalides n'empêchent pas une personne connectée");
 reset(); ai={throw:true}; for(let i=0;i<8;i++) await call(mk()); ai=gem(GOOD); r=await call(mk()); ok(r.status===200,"Gemini indisponible : les échecs ne consomment pas le quota de 6 demandes");
 reset(); r=await call(mk({headers:{host:"Carnet.Example.org",origin:"https://carnet.example.org"}})); ok(r.status===200,"hôte en majuscules : même site accepté");
 reset(); { const q=mk(); delete q.body; r=await call(q); ok(r.status===400&&!calls.length,"corps absent : 400 (pas « trop volumineuse »)",r.status); }
 reset(); ai={status:500,body:{error:{status:"INTERNAL; AIzaSECRETKEY",details:[{reason:"AIzaLEAK"}]}}}; { const logs=[]; const ce=console.error; console.error=m=>logs.push(String(m)); await call(mk()); console.error=ce; ok(logs.length&&!/AIza|SECRET|LEAK/.test(logs.join(" ")),"journal : un statut Google inattendu n'est jamais recopié",logs); }
 for(const w of ["je veux me_tuer","me*tuer","me<tuer","je|veux|en|finir","douleur_poitrine","ne_mange_plus"]){ reset(); r=await call(mk({body:{...BODY(),souhait:w}})); ok(r.status===200&&r.json.safe&&!aiCall(),"séparateurs ne contournent pas le filet : "+w); }
 for(const t of ["Mange un petit-déjeuner léger 3 h avant","Garde le moteur à plein régime en fin de séance","Comprime ta foulée en côte","Pyramide 200-400-600-800-600-400-200 m","Course le 20.10.2026, cadence 170-175-180","Bien.Me voilà prêt","Les jeunes coureurs progressent vite"]){
   reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"F",conseil:t,q:[],allege:false}]}); r=await call(mk()); ok(r.json.plan.semaines[0].conseil===t,"conseil normal conservé : "+t,r.json.plan.semaines[0].conseil); }
 for(const t of ["Prends de l'Advil","Va sur evil[.]com","evil dot com","Fais du fasting","Mange 1200 cals","Prends du magnésium"]){ reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"F",conseil:t,q:[],allege:false}]}); r=await call(mk()); ok(r.json.plan.semaines[0].conseil==="","vidé : "+t); }
 // accents : exigés dans la consigne, et réparés sur les mots courants quand l'IA les oublie
 reset(); await call(mk()); ok(/AVEC tous les accents/.test(JSON.parse(aiCall().o.body).systemInstruction.parts[0].text),"consigne : accents exigés");
 for(const [inp,exp] of [["Semaine allegee de developpement","Semaine allégée de développement"],["Garde de la fraicheur pour la seance de cotes","Garde de la fraîcheur pour la séance de côtes"],["Apres l'echauffement, deja tres bien","Après l'échauffement, déjà très bien"],["SEANCE LEGERE","SÉANCE LÉGÈRE"],["Semaine allégée, déjà accentuée","Semaine allégée, déjà accentuée"],["Va a ton rythme ou marche","Va a ton rythme ou marche"],["Hydratation et sommeil","Hydratation et sommeil"],["Seances-cles","Séances-cles"]]){
   reset(); ai=gem({resume:inp,semaines:[{s:4,focus:"Semaine allegee",conseil:inp,q:[],allege:false}]}); r=await call(mk()); const w=r.json.plan.semaines[0];
   ok(w.conseil===exp&&r.json.plan.resume===exp&&w.focus==="Semaine allégée","accents réparés : "+inp,[w.conseil,w.focus,r.json.plan.resume]); }
 reset(); ai=gem({resume:"ok",semaines:[{s:4,focus:"F",conseil:"Prends des complements alimentaires apres la seance",q:[],allege:false}]}); r=await call(mk()); ok(r.json.plan.semaines[0].conseil==="","réparation des accents : le filtre des conseils interdits s'applique toujours");
 console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})();
