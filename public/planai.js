/* Ajustement du plan par l'IA : le seul appel réseau de cette fonction (app.js n'ouvre aucune connexion). Aucun secret ici, aucune clé d'IA dans le navigateur.
   app.js construit la demande (après l'accord de l'utilisateur) et vérifie la réponse ; ce fichier envoie le JSON et rend le texte reçu, borné en taille. */
(function(){
"use strict";
const MAX_BODY=200000, TIMEOUT=65000;
async function send(url,body,token){
  const headers={"Content-Type":"application/json","Accept":"application/json","Authorization":"Bearer "+token};
  const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),TIMEOUT);
  try{
    let res; try{ res=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:ctl.signal,credentials:"omit",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer"}); }
    catch(e){ return {status:0,slow:ctl.signal.aborted,text:""}; }
    let text=""; try{ text=await res.text(); }catch(e){ return {status:0,slow:ctl.signal.aborted,text:""}; }
    return {status:res.status,text:text.length>MAX_BODY? "" : text};
  } finally { clearTimeout(tm); }
}
window.CarnetPlanAI=Object.freeze({send});
})();
