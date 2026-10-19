// contrôles statiques : CSP identique partout, aucun secret, aucun code inline, liens légaux présents, schéma SQL sans trou évident
const fs=require("fs"), path=require("path"); const REPO=path.resolve(__dirname,".."), R=path.join(REPO,"public"); let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
const v=JSON.parse(fs.readFileSync(REPO+"/vercel.json","utf8")); const H={}; for(const x of v.headers[0].headers) H[x.key]=x.value;
const csp=H["Content-Security-Policy"]; const strip=s=>s.split(";").map(x=>x.trim()).filter(x=>x&&!/^(frame-ancestors|upgrade-insecure-requests)/.test(x)).join("; ");
ok(!/unsafe-inline|unsafe-eval|\*\s*;|\bdata:[^;]*script/.test(csp.replace(/https:\/\/\*\.supabase\.co/g,"").replace(/wss:\/\/\*\.supabase\.co/g,"")),"CSP : ni unsafe-inline, ni unsafe-eval, ni joker global");
for(const k of ["Strict-Transport-Security","X-Content-Type-Options","Referrer-Policy","Permissions-Policy","Cross-Origin-Opener-Policy"]) ok(!!H[k],"en-tête "+k);
ok(/frame-ancestors 'none'/.test(csp),"frame-ancestors 'none'");
const htmls=fs.readdirSync(R).filter(f=>f.endsWith(".html")); ok(htmls.length===7,"7 pages HTML (app, 5 légales, 404)",htmls);
for(const f of htmls){ const s=fs.readFileSync(R+"/"+f,"utf8"); const m=s.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/); ok(m&&strip(m[1])===strip(csp),f+" : CSP meta identique à vercel.json");
  ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(s)&&!/\son\w+\s*=/i.test(s)&&!/\sstyle\s*=/i.test(s)&&!/<style/i.test(s),f+" : aucun script, style ou gestionnaire en ligne");
  if(f!=="index.html") ok(/cgu\.html/.test(s)&&/confidentialite\.html/.test(s)&&/mentions-legales\.html/.test(s)&&/cookies\.html/.test(s)&&/contact\.html/.test(s),f+" : pied de page légal"); }
const idx=fs.readFileSync(R+"/index.html","utf8"); ok(/cgu\.html/.test(idx)&&/confidentialite\.html/.test(idx),"index.html : liens légaux (accueil, pied de page)");
const hd=fs.readFileSync(R+"/_headers","utf8"); ok(hd.includes(csp)&&hd.includes(H["Strict-Transport-Security"]),"_headers cohérent avec vercel.json");
const auth=fs.readFileSync(R+"/auth.js","utf8"); const ver=auth.match(/const VERSION = "([\d.]+)"/)[1];
ok(/script-src 'self'(;|$)/.test(csp)&&!/script-src[^;]*https?:/.test(csp),"CSP : script-src 'self' seul (aucun script de tiers)");
ok(fs.existsSync(R+"/vendor/supabase-"+ver+".js"),"supabase-js "+ver+" hébergé dans vendor/");
{ const hs=fs.readFileSync(R+"/vendor/HASHES.txt","utf8"), crypto=require("crypto"); for(const f of ["supabase-"+ver+".js","591.supabase.js"]){ const h=crypto.createHash("sha256").update(fs.readFileSync(R+"/vendor/"+f)).digest("hex"); ok(hs.includes(f+" sha256: "+h),"vendor/"+f+" conforme à HASHES.txt"); } }
{ const vj=fs.readFileSync(R+"/vendor/supabase-"+ver+".js","utf8"); ok(!/\beval\(/.test(vj),"supabase-js : pas d'eval"); }
// connect-src : URL exacte du projet quand SUPABASE_URL est renseignée (node tools/set-csp.js)
const cfg0=fs.readFileSync(R+"/config.js","utf8"), su=(cfg0.match(/SUPABASE_URL:\s*"([^"]*)"/)||[])[1]||"";
const conn=(csp.match(/connect-src ([^;]*)/)||[])[1]; let want="'self'"; if(su){ try{ want+=" "+new URL(su).origin; }catch(e){} }
const chat=(cfg0.match(/CHAT_WEBHOOK_URL:\s*"([^"]*)"/)||[])[1]||""; if(chat){ try{ const o=new URL(chat).origin; if(!want.includes(o)) want+=" "+o; }catch(e){} }
ok(!chat||/^https:\/\//i.test(chat),"CHAT_WEBHOOK_URL : https obligatoire",chat);
ok(conn===want,"CSP connect-src = "+want+" (lance node tools/set-csp.js si besoin)",conn);
ok(!/\*/.test(conn||""),"CSP connect-src sans joker");
// déploiement bloqué si des champs légaux restent à compléter alors que la connexion est configurée
if(su){ const left=(cfg0.match(/À COMPLÉTER/g)||[]).length; ok(left===0,"SUPABASE_URL renseignée : plus aucun champ « À COMPLÉTER » dans config.js",left); } else console.log("OK   (SUPABASE_URL vide : mode invité, contrôle des champs légaux non bloquant)");
// fonction Vercel du Coach (option) : générée, synchronisée avec public/coach.js, aucune clé en dur
{ const af=REPO+"/api/coach.js"; ok(fs.existsSync(af)&&fs.readFileSync(af,"utf8")===require(REPO+"/integrations/vercel/build-api.js").build(),"api/coach.js synchronisé (node integrations/vercel/build-api.js)");
  ok(fs.existsSync(af)&&!/sk-ant-|AIza[\w-]{20,}|eyJ[A-Za-z0-9_-]{20,}/.test(fs.readFileSync(af,"utf8"))&&/process\.env\.GEMINI_API_KEY/.test(fs.readFileSync(af,"utf8")),"api/coach.js : clé d'IA lue dans l'environnement, jamais en dur"); }
// aucun secret
const all=[]; (function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(["node_modules",".git"].includes(e.name)) continue; const p=path.join(d,e.name); e.isDirectory()? walk(p) : all.push(p); } })(REPO);
// un JWT "anon" (rôle public, fait pour être publié - cf. auth.js validConfig()) n'est pas une fuite ; tout le reste (service_role, sb_secret_, clé privée, JWT d'un autre rôle) l'est
function jwtAnonOnly(s){ const re=/eyJ[A-Za-z0-9_-]{20,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{10,}/g; let m, any=false;
  while((m=re.exec(s))){ any=true; let role; try{ role=JSON.parse(Buffer.from(m[1].replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8")).role; }catch(e){ return false; } if(role!=="anon") return false; }
  return any; }
const leak=all.filter(p=>!/\.(png|jpg)$/.test(p)).filter(p=>{ const s=fs.readFileSync(p,"utf8"); if(p.endsWith("lib.js")||p.endsWith("static-checks.js")) return false;
  if(/service_role["']?\s*[:=]\s*["'][\w-]{20,}|sb_secret_|-----BEGIN/.test(s)) return true;
  if(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(s)) return !jwtAnonOnly(s);
  return false; }); ok(leak.length===0,"aucun secret ni jeton dans le dépôt",leak);
const cfg=fs.readFileSync(R+"/config.js","utf8"); ok(!su||/^https:\/\/[a-z0-9.-]+$/i.test(su),"SUPABASE_URL : https, sans chemin"); ok(!/service_role["']?\s*[:=]/i.test(cfg)&&!/SUPABASE_JS_SRI/.test(cfg),"config.js : pas de clé service_role");
ok(!/eval\(|new Function|document\.write|innerHTML\s*=\s*[^`'"]*location/.test(fs.readFileSync(R+"/app.js","utf8")+auth),"pas d'eval / new Function / document.write");
ok(/target="_blank"(?![^>]*noopener)/.test(fs.readFileSync(R+"/app.js","utf8")+idx)===false,"liens target=_blank avec rel=noopener");
const sql=fs.readFileSync(REPO+"/supabase/schema.sql","utf8"); for(const k of ["enable row level security","force row level security","on delete cascade","delete_my_account","octet_length(doc::text)","revoke all on public.user_data from anon","consent ->> 'terms' = 'true'","consent ->> 'health' = 'true'","is_anonymous","purge_inactive_accounts","greatest("]) ok(sql.includes(k),"schema.sql : "+k);
ok(!/to anon|to public/i.test(sql.replace(/revoke[^;]*;/gi,"")),"schema.sql : aucune politique pour anon/public");
// set-csp.js : refuse toute SUPABASE_URL qui n'est pas https://domaine (copie jetable du dépôt, fichiers jamais modifiés en cas de refus)
{ const cp=require("child_process"), os=require("os"); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"csp-"));
  const cpy=(a,b)=>fs.cpSync(a,b,{recursive:true,filter:x=>!/node_modules|\.git$/.test(x)}); cpy(R,tmp+"/public"); cpy(REPO+"/tools",tmp+"/tools"); fs.copyFileSync(REPO+"/vercel.json",tmp+"/vercel.json");
  const cfgP=tmp+"/public/config.js", orig=fs.readFileSync(cfgP,"utf8"); const run=u=>{ fs.writeFileSync(cfgP,orig.replace(/SUPABASE_URL:\s*"[^"]*"/,'SUPABASE_URL: "'+u+'"')); const before=fs.readFileSync(tmp+"/vercel.json","utf8"); const r=cp.spawnSync("node",[tmp+"/tools/set-csp.js"],{encoding:"utf8"}); return {st:r.status,same:before===fs.readFileSync(tmp+"/vercel.json","utf8"),out:fs.readFileSync(tmp+"/vercel.json","utf8")}; };
  const bad=["http://abc.supabase.co","https://*.supabase.co","https://abc.supabase.co;script-src *","https://abc.supabase.co/","https://abc.supabase.co/rest","https://abc.supabase.co:8443","https://abc.supabase.co evil.com","https://localhost","//abc.supabase.co","javascript:alert(1)","https://abc.supabase.co'"];
  const badBad=bad.filter(u=>{ const r=run(u); return r.st===0||!r.same; }); ok(badBad.length===0,"set-csp.js refuse les SUPABASE_URL invalides (http, joker, ;, chemin, port, espace) sans rien modifier",badBad);
  const g=run("https://abcdefghij.supabase.co"); ok(g.st===0&&/connect-src 'self' https:\/\/abcdefghij\.supabase\.co(;|")/.test(g.out),"set-csp.js accepte https://xxxx.supabase.co et l'écrit dans connect-src");
  fs.rmSync(tmp,{recursive:true,force:true}); }
ok(v.buildCommand==="node tests/static-checks.js"&&v.outputDirectory==="public","vercel.json : buildCommand = static-checks, outputDirectory = public");
ok(/auth\.sessions/.test(sql)&&/refreshed_at/.test(sql),"purge : tient compte de auth.sessions.refreshed_at");
ok(/sb-carnet-auth-code-verifier/.test(fs.readFileSync(R+"/cookies.html","utf8")),"cookies.html liste sb-carnet-auth-code-verifier");
// v14 : les nouvelles données de santé sont déclarées dans les pages légales ; l'import reste local
{ const pr=fs.readFileSync(R+"/confidentialite.html","utf8"), cg=fs.readFileSync(R+"/cgu.html","utf8"), ck=fs.readFileSync(R+"/cookies.html","utf8"), js=fs.readFileSync(R+"/app.js","utf8");
  ok(/Ressenti après séance/.test(pr)&&/Activités et mesures importées/.test(pr)&&/Apple Santé/.test(pr)&&/Polar Flow/.test(pr),"v14 confidentialité : ressenti, activités importées, Apple Santé et Polar Flow déclarés");
  ok(/dans ton navigateur, sur ton appareil/.test(pr)&&/jamais/.test(pr),"v14 confidentialité : le fichier importé est lu sur l'appareil et ne modifie jamais les calories");
  ok(/trail, VTT, haltérophilie/.test(cg)&&/Apple Santé ou Polar Flow/.test(cg)&&/jamais un diagnostic/.test(cg),"v14 CGU : sports, import, ressenti sans diagnostic");
  ok(/ressenti après séance/.test(ck),"v14 stockage local : ressenti et activités importées dans carnet-course.v1");
  ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(js.slice(js.indexOf("/*PURE14:start*/"),js.indexOf("/*PURE14:end*/"))),"v14 import : le module de lecture n'a aucun accès réseau");
  ok(!/innerHTML\s*=\s*[^;]*(\.note|\.src|\.name)\b/.test(js.slice(js.indexOf("/*PURE14:start*/"),js.indexOf("/*PURE14:end*/"))),"v14 import : pas d'innerHTML dans le module de lecture"); }
// v15 Coach : aucun secret ni clé d'IA, texte seulement, réseau limité au webhook configuré, consentement avant tout envoi
{ const co=fs.readFileSync(R+"/coach.js","utf8"), pr=fs.readFileSync(R+"/confidentialite.html","utf8"), cg=fs.readFileSync(R+"/cgu.html","utf8"), ck=fs.readFileSync(R+"/cookies.html","utf8"), app=fs.readFileSync(R+"/app.js","utf8");
  ok(!/sk-ant-|AIza[\w-]{20,}|api[_-]?key\s*[:=]\s*["'][\w-]{16,}|x-api-key|anthropic-version/i.test(co+app+fs.readFileSync(R+"/config.js","utf8")),"v15 coach : aucune clé d'IA ni secret dans le navigateur");
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(co),"v15 coach : jamais de HTML ni d'exécution (textContent seulement)");
  ok((co.match(/\bfetch\s*\(/g)||[]).length===1&&/credentials:"omit"/.test(co)&&/referrerPolicy:"no-referrer"/.test(co),"v15 coach : un seul appel réseau, sans cookies ni référent");
  ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(app.replace(/\/\*PURE14:start\*\/[\s\S]*?\/\*PURE14:end\*\//,"")),"v15 : app.js n'ouvre aucune connexion (le Coach est seul dans coach.js)");
  ok(/Coach/.test(pr)&&/n8n/.test(pr)&&/consentement/i.test(pr)&&/Coach/.test(cg)&&/avis médical/.test(cg)&&/carnet\.coach\.hist/.test(ck)&&/carnet\.coach\.consent/.test(ck),"v15 pages légales : Coach, n8n, consentement séparé, historique local");
  ok(!chat||/CHAT_PROVIDER_NAME:\s*"[^"]{2,}"/.test(cfg0),"v15 : CHAT_WEBHOOK_URL renseignée => CHAT_PROVIDER_NAME aussi (nommé dans la feuille de consentement)");
  ok(/données de santé/.test(pr.slice(pr.indexOf("Échanges avec le Coach")))&&/6\.1\.a et 9\.2\.a[^<]*<\/td>/.test(pr)&&/Google/.test(pr)&&/améliorer ses produits/.test(pr)&&/clauses contractuelles types[^]*?DPA/.test(pr.slice(pr.indexOf('id="transferts"')))&&/sauf, si l'éditeur active le Coach/.test(pr)&&/accès à ton compte pendant environ une heure/.test(pr),"v15 confidentialité : catégories, bases 6.1.a/9.2.a, destinataires, transferts hors UE, droits, jeton (accès au compte ~1 h)");
  const cp=require("child_process"), os=require("os"); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"csp2-")); const cpy=(a,b)=>fs.cpSync(a,b,{recursive:true,filter:x=>!/node_modules|\.git$/.test(x)}); cpy(R,tmp+"/public"); cpy(REPO+"/tools",tmp+"/tools"); fs.copyFileSync(REPO+"/vercel.json",tmp+"/vercel.json");
  const cfgP=tmp+"/public/config.js", orig=fs.readFileSync(cfgP,"utf8"); const run=u=>{ fs.writeFileSync(cfgP,orig.replace(/CHAT_WEBHOOK_URL:\s*"[^"]*"/,'CHAT_WEBHOOK_URL: "'+u+'"')); const before=fs.readFileSync(tmp+"/vercel.json","utf8"); const r=cp.spawnSync("node",[tmp+"/tools/set-csp.js"],{encoding:"utf8"}); return {st:r.status,same:fs.readFileSync(tmp+"/vercel.json","utf8")===before,v:fs.readFileSync(tmp+"/vercel.json","utf8")}; };
  const bad=["http://n8n.example.org/webhook/x","https://*.example.org/x","https://n8n.example.org/x?a=b","https://n8n.example.org/x;script-src *","https://user:pw@n8n.example.org/x","javascript:alert(1)","https://n8n.example.org/x y"]; const bb=bad.filter(u=>{ const r=run(u); return r.st===0||!r.same; });
  ok(bb.length===0,"v15 set-csp.js refuse un CHAT_WEBHOOK_URL non https ou piégé",bb);
  const g=run("https://n8n.example.org/webhook/carnet-coach"); ok(g.st===0&&/connect-src 'self'(?: https:\/\/[a-z0-9]+\.supabase\.co)? https:\/\/n8n\.example\.org(;|")/.test(g.v)&&!/n8n\.example\.org\/webhook/.test(g.v),"v15 set-csp.js : seule l'origine du webhook entre dans connect-src");
  fs.rmSync(tmp,{recursive:true,force:true}); }
console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
