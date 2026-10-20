// Outils de test : serveur statique qui applique les en-têtes de vercel.json, faux client Supabase (aucun réseau réel).
const http=require("http"), fs=require("fs"), path=require("path");
const EXTRA={v:""};   // origine supplémentaire de connect-src (webhook du Coach, tests)
const REPO=path.resolve(__dirname,".."), ROOT=path.join(REPO,"public");
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png",".xml":"application/xml; charset=utf-8"};
function headersFor(){ const v=JSON.parse(fs.readFileSync(path.join(REPO,"vercel.json"),"utf8")); const h={}; for(const r of v.headers) if(r.source==="/(.*)") for(const x of r.headers) h[x.key]=x.value;
  // comme « node tools/set-csp.js » après avoir renseigné SUPABASE_URL : l'URL exacte du projet de test est ajoutée à connect-src
  h["Content-Security-Policy"]=h["Content-Security-Policy"].replace("connect-src 'self'","connect-src 'self' https://abcdefghij.supabase.co"+EXTRA.v); return h; }
function serve(over={},prefix=""){ const H=headersFor(), hits=[];
  const srv=http.createServer((req,res)=>{ let u=decodeURIComponent(req.url.split("?")[0]); hits.push(u);
    if(prefix){ if(u===prefix) u=prefix+"/"; if(!u.startsWith(prefix+"/")){ res.writeHead(404,{"Content-Type":"text/plain"}); return res.end("hors base"); } u=u.slice(prefix.length); }
    if(u==="/") u="/index.html"; let f=path.join(ROOT,u); if(!f.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
    if(!fs.existsSync(f)&&fs.existsSync(f+".html")) f+=".html";
    let body; if(over[u]) body=over[u](); else if(u==="/config.js") body=blankCfgJs(); else if(fs.existsSync(f)&&fs.statSync(f).isFile()) body=fs.readFileSync(f); else { f=path.join(ROOT,"404.html"); res.writeHead(404,{...H,"Content-Type":MIME[".html"]}); return res.end(fs.readFileSync(f)); }
    if(path.extname(f)===".html") body=Buffer.from(body.toString().replace("connect-src 'self'","connect-src 'self' https://abcdefghij.supabase.co"+EXTRA.v));   // idem pour la balise meta
    res.writeHead(200,{...H,"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}); res.end(body); });
  return new Promise(r=>srv.listen(0,"127.0.0.1",()=>r({srv,hits,url:"http://127.0.0.1:"+srv.address().port+prefix,close:()=>srv.close()}))); }
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const FAKE_KEY=b64({alg:"HS256",typ:"JWT"})+"."+b64({role:"anon",iss:"supabase",ref:"abcdefghij"})+"."+"signaturesignaturesig";
const SERVICE_KEY=b64({alg:"HS256",typ:"JWT"})+"."+b64({role:"service_role",iss:"supabase"})+"."+"signaturesignaturesig";
// config.js de test : valeurs valides (aucun réseau : le client est simulé)
const cfgJs=(extra={})=>()=>{ const c=fs.readFileSync(path.join(ROOT,"config.js"),"utf8");
  const o={SUPABASE_URL:"https://abcdefghij.supabase.co",SUPABASE_ANON_KEY:FAKE_KEY,PROVIDERS:["google","azure","github"],CHAT_WEBHOOK_URL:"",CHAT_PROVIDER_NAME:"",...extra};   // Coach coupé par défaut, quelle que soit la config de production
  let s=c; for(const [k,v] of Object.entries(o)) s=s.replace(new RegExp(k+':\\s*(?:"[^"]*"|\\[[^\\]]*\\])'),k+": "+JSON.stringify(v)); return s; };
// config.js de test « non configuré » (site 100 % invité), indépendant des valeurs de production
const blankCfgJs=()=>cfgJs({SUPABASE_URL:"",SUPABASE_ANON_KEY:""})();
// base de données simulée, partagée entre pages ; imite les règles RLS du schéma
function makeDb(){ const rows=new Map(), users=new Set(), log=[];
  const o={rows,users,log,failUpdate:false}; const fn=(op,a)=>{ log.push(op);
    if(op==="select"){ const r=rows.get(a.uid); return r? JSON.parse(JSON.stringify(r)) : null; }
    if(op==="upsert"){ const r=a.row; if(r.user_id!==a.uid) return {error:"rls"}; const cur=rows.get(a.uid);
      const next={user_id:r.user_id,doc:cur?cur.doc:{},consent:cur?cur.consent:null,...JSON.parse(JSON.stringify(r))};
      if(r.consent===undefined&&cur) next.consent=cur.consent; if(r.doc===undefined&&cur) next.doc=cur.doc;
      if(!cur&&!r.consent) return {error:"rls-consent"}; if(next.consent&&(next.consent.health!==true||next.consent.age15!==true||next.consent.terms!==true)) return {error:"check"};
      if(JSON.stringify(next.doc).length>1500000) return {error:"size"}; rows.set(a.uid,next); return {ok:1}; }
    if(op==="update"&&o.failUpdate) return {error:"net"};
    if(op==="update"){ const cur=rows.get(a.uid); if(!cur||!cur.consent) return {n:0}; if(JSON.stringify(a.vals.doc).length>1500000) return {error:"size"}; rows.set(a.uid,{...cur,doc:JSON.parse(JSON.stringify(a.vals.doc))}); return {n:1}; }
    if(op==="delete"){ rows.delete(a.uid); return {ok:1}; }
    if(op==="delete_account"){ rows.delete(a.uid); users.add("deleted:"+a.uid); return {ok:1}; }
    return {error:"op"}; };
  o.fn=fn; return o; }
// installe le faux supabase-js (avant tout script de la page) : session dans localStorage, base dans le processus Node
async function fake(page,db,{session,failRpc}={}){
  await page.exposeFunction("__sbRpc",(op,a)=>db.fn(op,a));
  await page.addInitScript(({session})=>{
    if(session&&!sessionStorage.__fs){ sessionStorage.__fs=1; localStorage.setItem("sb-carnet-auth",JSON.stringify(session)); }
    window.__oauth=[]; const cbs=[];
    window.supabase={createClient:(url,key,opts)=>{ const sk=opts.auth.storageKey; window.__sbOpts={url,key,opts};
      const cur=()=>{ try{ return JSON.parse(localStorage.getItem(sk)||"null"); }catch(e){ return null; } };
      const auth={ async getSession(){ return {data:{session:cur()},error:null}; }, onAuthStateChange(cb){ cbs.push(cb); return {data:{subscription:{unsubscribe(){}}}}; },
        async signInWithOAuth(o){ window.__oauth.push({provider:o.provider,redirectTo:o.options&&o.options.redirectTo}); return {data:{},error:null}; },
        async signOut(o){ window.__signOutScope=o&&o.scope; localStorage.removeItem(sk); cbs.forEach(f=>f("SIGNED_OUT")); return {error:null}; } };
      const from=t=>{ const q={cols:null,uid:null,mode:null,row:null};
        const b={ select(c){ q.mode="select"; q.cols=c; return b; }, eq(c,v){ q.uid=v; return b; },
          async maybeSingle(){ const s=cur(); const uid=s&&s.user&&s.user.id; if(!uid||q.uid!==uid) return {data:null,error:null}; const r=await window.__sbRpc("select",{uid}); if(!r) return {data:null,error:null}; const o={}; for(const c of q.cols.split(",")) o[c.trim()]=r[c.trim()]; return {data:o,error:null}; },
          async upsert(row){ const s=cur(); const uid=s&&s.user&&s.user.id; const r=await window.__sbRpc("upsert",{uid,row}); return {error:r&&r.error?{message:r.error}:null}; },
          update(vals){ q.mode="update"; q.vals=vals; return { eq(c,v){ q.uid=v; return { async select(){ const s=cur(); const uid=s&&s.user&&s.user.id; if(!uid||q.uid!==uid) return {data:[],error:null}; const r=await window.__sbRpc("update",{uid,vals:q.vals}); return r&&r.error? {data:null,error:{message:r.error}} : {data:r.n?[{user_id:uid}]:[],error:null}; } }; } }; },
          delete(){ q.mode="delete"; return { async eq(c,v){ const s=cur(); const uid=s&&s.user&&s.user.id; if(!uid||v!==uid) return {error:{message:"rls"}}; await window.__sbRpc("delete",{uid}); return {error:null}; } }; } };
        if(t!=="user_data") throw new Error("table"); return b; };
      return {auth,from,async rpc(n){ if(n!=="delete_my_account") return {error:{message:"fn"}}; if(window.__failRpc) return {error:{message:"boom"}}; const s=cur(); await window.__sbRpc("delete_account",{uid:s&&s.user&&s.user.id}); return {error:null}; }}; }};
  },{session});
}
const SESSION=(id="u-1",name="Zoé Martin",email="zoe@example.org")=>({user:{id,email,user_metadata:{full_name:name}},access_token:"x".repeat(20)});
module.exports={EXTRA,serve,cfgJs,makeDb,fake,SESSION,FAKE_KEY,SERVICE_KEY,ROOT};
