if(top!==self){document.documentElement.hidden=true}
/* Pages légales : remplace les champs « à compléter » par les valeurs de config.js (textContent seulement, jamais de HTML). */
(function(){
"use strict";
const L=(window.APP_CONFIG&&window.APP_CONFIG.LEGAL)||{};
let todo=0;
document.querySelectorAll("[data-ph]").forEach(el=>{
  const k=el.getAttribute("data-ph"), v=Object.hasOwn(L,k)&&typeof L[k]==="string"? L[k].trim() : "";
  if(v) el.textContent=v;
  if(!v||v.startsWith("[À COMPLÉTER")) todo++; else el.classList.add("done");
});
const c=document.getElementById("phCount");
if(c&&todo) c.textContent=todo+" champ"+(todo>1?"s":"")+" à compléter dans config.js (surlignés en jaune).";
const m=document.getElementById("mailLink"), e=typeof L.EDITEUR_EMAIL==="string"? L.EDITEUR_EMAIL.trim() : "";
const mailOk=/^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(e), href="mailto:"+encodeURIComponent(e).replace(/%40/g,"@");
for(const x of [m,...document.querySelectorAll("[data-mail]")]){ if(!x) continue; if(mailOk) x.href=href+(x.hasAttribute("data-mail")?"?subject="+encodeURIComponent("Pacebook"):""); else x.removeAttribute("href"); }
})();
