/* Consentement (CNIL) : bandeau Accepter / Refuser ; la mesure d'audience Vercel n'est chargée qu'après un accord, mémorisé 6 mois. */
(function(){
"use strict";
const KEY="carnet.cookies", V=1, MONTHS=6, SRC="/_vercel/insights/script.js";
let bar=null, back=null;
const now=()=>Date.now();
// choix valide et non expiré, sinon null (un choix expiré est effacé : on redemande)
function read(){ let o=null; try{ o=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){ return null; }
  if(!o||o.v!==V||typeof o.analytics!=="boolean") return null; const t=Date.parse(o.at); if(!(t>0)||t>now()+864e5) return null;
  const exp=new Date(t); exp.setMonth(exp.getMonth()+MONTHS); if(now()>=exp.getTime()){ try{ localStorage.removeItem(KEY); }catch(e){} return null; }
  return {v:V,analytics:o.analytics,at:o.at}; }
function write(a){ const o={v:V,analytics:!!a,at:new Date().toISOString()}; try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){} return o; }
// chargement du script Vercel Web Analytics (même origine) ; s'il répond 404 (non activé), on retire la balise sans bruit
function load(){ if(document.querySelector("script[data-ck-va]")) return; try{ localStorage.removeItem("va-disable"); }catch(e){}
  window.va=window.va||function(){ (window.vaq=window.vaq||[]).push(arguments); };
  const s=document.createElement("script"); s.src=SRC; s.defer=true; s.setAttribute("data-ck-va",""); s.addEventListener("error",()=>{ s.remove(); }); document.head.appendChild(s); }
// retrait : plus rien n'est chargé ; si le script tourne déjà sur cette page, on lui demande de ne plus rien envoyer
function unload(){ const s=document.querySelector("script[data-ck-va]"); if(s){ s.remove(); try{ localStorage.setItem("va-disable","1"); }catch(e){} }
  else try{ localStorage.removeItem("va-disable"); }catch(e){}
  try{ delete window.va; delete window.vaq; }catch(e){} }
function apply(c){ if(c&&c.analytics) load(); else unload(); }

function cookiesHref(){ const a=document.querySelector('a[href$="cookies"],a[href$="cookies.html"]'); return a? a.getAttribute("href") : "cookies"; }
function build(){
  bar=document.createElement("section"); bar.id="ckBar"; bar.className="ck"; bar.hidden=true;
  bar.setAttribute("role","region"); bar.setAttribute("aria-label","Mesure d'audience et cookies");
  const t=document.createElement("p"); t.className="ck-t"; t.id="ckT";
  const b=document.createElement("b"); b.textContent="Mesure d'audience. ";
  const a=document.createElement("a"); a.href=cookiesHref()+"#audience"; a.textContent="En savoir plus";
  t.append(b,"On compte les visites, anonymement et sans cookie (Vercel), si tu es d'accord. Choix gardé 6 mois. ",a);
  const p=document.createElement("div"); p.className="ck-p"; p.hidden=true; p.id="ckP";
  const l=document.createElement("label"); l.className="ck-chk"; const cb=document.createElement("input"); cb.type="checkbox"; cb.id="ckA";
  const ls=document.createElement("span"); ls.textContent="Mesure d'audience anonyme (pages vues, sans cookie, sans identifiant)"; l.append(cb,ls);
  const sv=mk("Enregistrer mon choix","save","ck-btn ck-save"); p.append(l,sv);
  const r=document.createElement("div"); r.className="ck-b";
  const cu=mk("Personnaliser","custom","ck-lnk"); cu.setAttribute("aria-expanded","false"); cu.setAttribute("aria-controls","ckP");
  r.append(mk("Refuser","no","ck-btn"),mk("Accepter","yes","ck-btn"),cu);
  const w=document.createElement("div"); w.className="ck-in"; w.append(t,p,r); bar.append(w);
  bar.addEventListener("click",e=>{ const x=e.target.closest("[data-ck]"); if(!x) return; const k=x.getAttribute("data-ck");
    if(k==="yes") decide(true); else if(k==="no") decide(false); else if(k==="save") decide(cb.checked);
    else if(k==="custom"){ const o=p.hidden; p.hidden=!o; x.setAttribute("aria-expanded",String(o)); if(o){ const c=read(); cb.checked=!!(c&&c.analytics); cb.focus(); } } });
  // Échap ne ferme que si un choix existe déjà (sinon il faut répondre, sans piège : Tab sort librement)
  bar.addEventListener("keydown",e=>{ if(e.key==="Escape"&&read()){ e.preventDefault(); hide(); } });
  document.body.prepend(bar); }
function mk(txt,k,cls){ const x=document.createElement("button"); x.type="button"; x.className=cls; x.setAttribute("data-ck",k); x.textContent=txt; return x; }
function show(focus){ if(!bar) build(); bar.hidden=false; document.documentElement.classList.add("ck-on");
  if(focus){ back=document.activeElement; const f=bar.querySelector("[data-ck=no]"); if(f) f.focus(); } }
function hide(){ if(!bar) return; bar.hidden=true; document.documentElement.classList.remove("ck-on"); const p=bar.querySelector(".ck-p"); if(p) p.hidden=true;
  const cu=bar.querySelector("[data-ck=custom]"); if(cu) cu.setAttribute("aria-expanded","false");
  if(back&&back.isConnected&&typeof back.focus==="function") back.focus(); back=null; }
function decide(a){ const c=write(a); apply(c); hide(); state(); }
// état affiché sur la page cookies.html (texte seulement)
function state(){ const el=document.getElementById("ckState"); if(!el) return; const c=read();
  el.textContent=!c? "Ton choix : pas encore donné." : "Ton choix : mesure d'audience "+(c.analytics?"acceptée":"refusée")+" le "+new Date(c.at).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})+"."; }
function open(){ show(true); }

document.addEventListener("click",e=>{ const x=e.target.closest&&e.target.closest("[data-consent-open]"); if(x){ e.preventDefault(); open(); } });
const c=read(); apply(c); state(); if(!c) show(false);
window.CarnetConsent=Object.freeze({get:read,open});
})();
