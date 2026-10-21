/* Couche « compte » : adaptateur Supabase (OAuth PKCE + une ligne par utilisateur protégée par RLS).
   Pacebook reste local-first : sans configuration valide, ou sans session, tout fonctionne en mode invité.
   supabase-js est HÉBERGÉ SUR CE SITE (vendor/, version exacte, empreinte vérifiée à la mise à jour) : aucun script de tiers,
   et il n'est chargé que si une session existe, ou au retour d'une connexion. Aucun secret ici. */
(function(){
"use strict";
const CFG = window.APP_CONFIG || {};
const VERSION = "2.45.4";
const BASE = (document.currentScript&&document.currentScript.src||location.href).replace(/[?#].*$/,"").replace(/[^/]*$/,"");
const LIB_URL = BASE+"vendor/supabase-"+VERSION+".js";
const CONSENT_V = "2026-10-10";   // version des CGU / de la politique de confidentialité : à changer ensemble pour redemander l'accord
const CONSENT_TTL = 10*60*1000;   // un accord « en attente » (avant la redirection OAuth) expire en 10 minutes
const LABELS = {google:"Google", azure:"Microsoft", github:"GitHub", apple:"Apple"};
const CONSENT_KEY = "carnet.consent", STORAGE_KEY = "sb-carnet-auth";
const isLocal = ["localhost","127.0.0.1"].includes(location.hostname);

// ---- configuration : tout est validé ; seule une clé « anon » (ou « publishable ») est acceptée
function b64json(s){ try{ s=s.replace(/-/g,"+").replace(/_/g,"/"); return JSON.parse(atob(s+"=".repeat((4-s.length%4)%4))); }catch(e){ return null; } }
function validConfig(){
  const u=String(CFG.SUPABASE_URL||""), k=String(CFG.SUPABASE_ANON_KEY||"");
  if(!(/^https:\/\/[a-z0-9][a-z0-9.-]{2,80}$/i.test(u)||(isLocal&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(u)))) return false;
  if(/^sb_publishable_[\w-]{10,}$/.test(k)) return true;
  if(!/^[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/.test(k)) return false;
  const p=b64json(k.split(".")[1]); return !!p&&p.role==="anon";
}
const provs = (Array.isArray(CFG.PROVIDERS)?CFG.PROVIDERS:[]).filter(p=>Object.hasOwn(LABELS,p)).map(p=>({id:p,label:LABELS[p]}));
// compte par e-mail et mot de passe (fournisseur « Email » de Supabase) : seulement si EMAIL_LOGIN vaut true dans config.js
const emailLogin = validConfig() && CFG.EMAIL_LOGIN===true;
const canLogin = validConfig() && (provs.length>0 || emailLogin);
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,253}\.[a-z]{2,24}$/i, PW_MIN = 8, PW_MAX = 72;
// erreurs Supabase -> codes stables (le texte reçu n'est jamais affiché)
function mailErr(e){ const m=String(e&&(e.code||e.message)||"").toLowerCase(), st=+(e&&e.status)||0, x=new Error("mail");
  x.code= /invalid.?(login|credentials)|invalid_credentials/.test(m)? "creds" : /not.?confirmed|email_not_confirmed/.test(m)? "unconfirmed"
    : /already|registered|exists/.test(m)? "exists" : /weak|password.*(short|length|characters)|weak_password/.test(m)? "weak"
    : st===429||/rate|too many|over_email_send_rate/.test(m)? "rate" : /signup.*(disabled|not allowed)|provider.*disabled|email_provider_disabled/.test(m)? "disabled"
    : /same.?password|should be different/.test(m)? "same" : "other"; return x; }
function checkMail(email,pw){ const e=String(email||"").trim().toLowerCase(), p=String(pw||"");
  if(!EMAIL_RE.test(e)){ const x=new Error("mail"); x.code="email"; throw x; }
  if(pw!==undefined&&(p.length<PW_MIN||p.length>PW_MAX)){ const x=new Error("mail"); x.code="weak"; throw x; }
  return e; }

// ---- chargement de la bibliothèque (même origine)
let libP=null;
function loadLib(){
  if(window.supabase&&window.supabase.createClient) return Promise.resolve(window.supabase);
  if(libP) return libP;
  libP=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=LIB_URL; s.async=true;
    s.onload=()=> window.supabase&&window.supabase.createClient? res(window.supabase) : rej(new Error("lib"));
    s.onerror=()=>rej(new Error("load")); document.head.appendChild(s); });
  libP.catch(()=>{ libP=null; });
  return libP;
}

// ---- URL de retour OAuth : toujours la racine de ce site (même origine), jamais un paramètre venu de l'URL
function redirectUrl(){ const u=new URL(".",location.href); if(u.origin!==location.origin) throw new Error("redirect"); u.search=""; u.hash=""; return u.href; }
// retour OAuth en erreur : on n'affiche jamais le texte reçu ; l'URL est nettoyée
// seul le code d'erreur est gardé, et seulement s'il a la forme d'un identifiant (otp_expired, bad_oauth_state…) : il sert à choisir un message
let oauthError=false, oauthReturn=false, oauthCode="", oauthCause="", returnFailed=false;
(function(){ try{ const p=new URLSearchParams(location.search+"&"+location.hash.replace(/^#/,"")); oauthReturn=p.has("code");
  if(p.has("error")||p.has("error_description")||p.has("error_code")){ oauthError=true; const c=String(p.get("error_code")||p.get("error")||""); oauthCode=/^[a-z_]{2,40}$/.test(c)? c : "";
    // la description reçue n'est JAMAIS affichée : on y reconnaît seulement des messages connus de Supabase, traduits par une clé fixe
    const d=String(p.get("error_description")||"").toLowerCase();
    oauthCause= /exchange external code/.test(d)? "exchange" : /database error saving new user/.test(d)? "db" : /getting user email|email.*(not|no).*(found|provided)/.test(d)? "email"
      : /multiple accounts|already (registered|exists)|identity.*already/.test(d)? "exists" : /unverified email/.test(d)? "unverified" : /provider.*(not enabled|disabled)/.test(d)? "disabled" : ""; history.replaceState(null,"",new URL(".",location.href).pathname); } }catch(e){} })();

// ---- consentement : trois accords distincts (âge, CGU + confidentialité, données de santé), horodatés
function cleanConsent(c){
  if(!c||typeof c!=="object"||Array.isArray(c)) return null;
  const v=x=> typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)? x : null, at=typeof c.at==="string"&&!isNaN(Date.parse(c.at))? new Date(c.at).toISOString() : null;
  if(c.health!==true||c.terms!==true||c.age15!==true||!v(c.cgu)||!v(c.privacy)||!at) return null;
  return {cgu:c.cgu,privacy:c.privacy,terms:true,health:true,age15:true,at};
}
const ls={ get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} } };

let client=null, uid=null, consent=null, signedOutCbs=[], recovery=false, recoveryCbs=[];
async function getClient(){
  if(client) return client;
  if(!validConfig()) throw new Error("config");
  const lib=await loadLib();
  client=lib.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{flowType:"pkce",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:STORAGE_KEY}});
  client.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_OUT"){ uid=null; consent=null; recovery=false; signedOutCbs.slice().forEach(f=>{ try{ f(); }catch(e){} }); }
    // retour du lien « mot de passe oublié » : la page doit proposer un nouveau mot de passe
    if(ev==="PASSWORD_RECOVERY"){ recovery=true; recoveryCbs.slice().forEach(f=>{ try{ f(); }catch(e){} }); } });
  return client;
}
// la ligne de l'utilisateur : lecture / mise à jour bornées par RLS (user_id = auth.uid()). Écrire ne CRÉE jamais la ligne :
// si elle n'existe plus (consentement retiré, compte supprimé ailleurs), l'écriture échoue avec le code NOROW.
function docRef(){
  return { async get(){ const {data,error}=await client.from("user_data").select("doc").eq("user_id",uid).maybeSingle(); if(error) throw error; return data? {exists:true,data:()=>data.doc} : {exists:false}; },
    async set(d){ const {data,error}=await client.from("user_data").update({doc:d}).eq("user_id",uid).select("user_id"); if(error) throw error;
      if(!Array.isArray(data)||data.length===0){ const e=new Error("norow"); e.code="NOROW"; throw e; } } };
}
const api={
  canLogin, providers:provs, emailLogin, PW_MIN, CONSENT_V, get oauthError(){ return oauthError; }, get oauthCode(){ return oauthCode; }, get oauthCause(){ return oauthCause; }, get inRecovery(){ return recovery; },
  // retour d'une connexion (?code=…) qui n'a pas ouvert de session : lien ouvert dans un autre navigateur, lien expiré ou déjà utilisé
  get returnFailed(){ return returnFailed; },
  // session existante → {db,user,consent}, sinon null (invité). Sans session enregistrée, la bibliothèque n'est même pas chargée.
  async connect(){
    if(!client&&!ls.get(STORAGE_KEY)&&!oauthReturn) return null;
    const c=await getClient(); const {data,error}=await c.auth.getSession();
    if(error){ if(oauthReturn){ returnFailed=true; try{ history.replaceState(null,"",new URL(".",location.href).pathname); }catch(e){} return null; } throw error; }
    const s=data&&data.session; if(!s||!s.user||!s.user.id){ uid=null; if(oauthReturn){ returnFailed=true; try{ history.replaceState(null,"",new URL(".",location.href).pathname); }catch(e){} } return null; }
    uid=String(s.user.id); const u=s.user, md=u.user_metadata||{};
    const {data:row,error:e2}=await c.from("user_data").select("consent").eq("user_id",uid).maybeSingle(); if(e2) throw e2;
    consent=cleanConsent(row&&row.consent);
    if(consent&&(consent.cgu!==CONSENT_V||consent.privacy!==CONSENT_V)) consent=null;   // textes modifiés : nouvel accord demandé
    return { db:{doc:()=>docRef()}, user:{id:async()=>uid, me:async()=>({name:md.full_name||md.name||md.preferred_username||"", email:u.email||""})}, consent };
  },
  async signIn(provider,cons){
    if(!provs.some(p=>p.id===provider)) throw new Error("provider");
    // l'accord est facultatif ici : sans lui, l'écran « Dernière étape » le demande au retour, avant toute écriture dans le compte
    const cc=cleanConsent(cons); const c=await getClient(); if(cc) ls.set(CONSENT_KEY,JSON.stringify(cc)); else ls.del(CONSENT_KEY);
    const {error}=await c.auth.signInWithOAuth({provider,options:{redirectTo:redirectUrl()}}); if(error){ ls.del(CONSENT_KEY); throw error; }
  },
  // création de compte par e-mail : l'accord est gardé comme pour OAuth (repris après la confirmation de l'adresse, si elle arrive dans les 10 minutes)
  // -> {confirm:true} quand Supabase envoie un e-mail de confirmation (cas normal), {confirm:false} si la session est ouverte tout de suite
  async signUpEmail(email,pw,cons){
    if(!emailLogin) throw new Error("provider"); const e=checkMail(email,pw), cc=cleanConsent(cons);
    const c=await getClient(); if(cc) ls.set(CONSENT_KEY,JSON.stringify(cc)); else ls.del(CONSENT_KEY);
    const {data,error}=await c.auth.signUp({email:e,password:String(pw),options:{emailRedirectTo:redirectUrl()}}); if(error){ ls.del(CONSENT_KEY); throw mailErr(error); }
    return {confirm:!(data&&data.session)}; },
  async signInEmail(email,pw,cons){
    if(!emailLogin) throw new Error("provider"); const e=checkMail(email), cc=cleanConsent(cons);
    const c=await getClient(); if(cc) ls.set(CONSENT_KEY,JSON.stringify(cc)); else ls.del(CONSENT_KEY);
    const {error}=await c.auth.signInWithPassword({email:e,password:String(pw||"")}); if(error){ ls.del(CONSENT_KEY); throw mailErr(error); } },
  // e-mail de réinitialisation : même réponse que l'adresse existe ou non (on ne révèle pas qui a un compte)
  async resetPassword(email){ if(!emailLogin) throw new Error("provider"); const e=checkMail(email); const c=await getClient();
    const {error}=await c.auth.resetPasswordForEmail(e,{redirectTo:redirectUrl()}); if(error){ const x=mailErr(error); if(x.code==="rate") throw x; } },
  async updatePassword(pw){ if(!uid||!client) throw new Error("session"); const p=String(pw||""); if(p.length<PW_MIN||p.length>PW_MAX){ const x=new Error("mail"); x.code="weak"; throw x; }
    const {error}=await client.auth.updateUser({password:p}); if(error) throw mailErr(error); recovery=false; },
  onRecovery(f){ if(typeof f==="function") recoveryCbs.push(f); },
  // accord donné juste avant la redirection : valable 10 minutes, versions courantes seulement
  takePendingConsent(){ let c=null; try{ c=cleanConsent(JSON.parse(ls.get(CONSENT_KEY)||"null")); }catch(e){} ls.del(CONSENT_KEY);
    if(c){ const age=Date.now()-Date.parse(c.at); if(!(age>=-60000&&age<=CONSENT_TTL)||c.cgu!==CONSENT_V||c.privacy!==CONSENT_V) c=null; } return c; },
  // seul point qui CRÉE la ligne (avec l'accord) ; une ligne existante voit seulement son accord mis à jour
  async saveConsent(cons){
    const cc=cleanConsent(cons); if(!cc||!uid) throw new Error("consent");
    if(cc.cgu!==CONSENT_V||cc.privacy!==CONSENT_V) throw new Error("version");
    const {error}=await client.from("user_data").upsert({user_id:uid,consent:cc},{onConflict:"user_id"}); if(error) throw error; consent=cc; return true; },
  // retrait du consentement : la ligne (données de santé comprises) est supprimée ; le compte reste
  async withdrawConsent(){ if(!uid) throw new Error("session"); const {error}=await client.from("user_data").delete().eq("user_id",uid); if(error) throw error; consent=null; },
  // droit à l'effacement : fonction SQL « delete_my_account » (supabase/schema.sql), puis fin de session locale
  async deleteAccount(){ if(!uid) throw new Error("session"); const {error}=await client.rpc("delete_my_account"); if(error) throw error; try{ await client.auth.signOut({scope:"local"}); }catch(e){} uid=null; consent=null; },
  // déconnexion de CE navigateur seulement (les autres appareils restent connectés)
  async signOut(){ if(!client) { ls.del(STORAGE_KEY); return; } try{ await client.auth.signOut({scope:"local"}); }catch(e){} ls.del(STORAGE_KEY); uid=null; consent=null; },
  // jeton d'accès de la session (rafraîchi par la bibliothèque) : envoyé seulement au webhook du Coach, après accord, pour que n8n vérifie l'utilisateur
  async accessToken(){ if(!uid||!client) return null; const {data}=await client.auth.getSession(); const s=data&&data.session; return s&&s.user&&String(s.user.id)===uid&&typeof s.access_token==="string"? s.access_token : null; },
  onSignedOut(f){ if(typeof f==="function") signedOutCbs.push(f); }
};
window.CarnetAuth=Object.freeze(api);
})();
