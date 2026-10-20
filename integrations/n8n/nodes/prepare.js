// Nœud « Préparer » (Code, une fois pour tous les éléments) : valide la forme de la requête et extrait le jeton. Aucune donnée n'est conservée.
const item = $input.first().json;
const h = item.headers || {};
const auth = String(h.authorization || h.Authorization || "");
const m = /^Bearer ([\w-]{8,}\.[\w-]{8,}\.[\w-]{8,})$/.exec(auth);
const b = item.body;
const bad = (status, reply) => [{ json: { status, reply } }];
if (!m) return bad(401, "Connexion requise : reconnecte-toi puis réessaie.");   // sans jeton : rejet immédiat, aucun appel à Supabase ni à l'IA
if (!b || typeof b !== "object" || Array.isArray(b) || b.v !== 1 || !Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > 8) return bad(400, "Requête invalide.");
const messages = [];
for (const x of b.messages) {
  if (!x || typeof x !== "object" || (x.role !== "user" && x.role !== "assistant") || typeof x.content !== "string") return bad(400, "Requête invalide.");
  const c = x.content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, x.role === "user" ? 1000 : 1500);
  if (!c) return bad(400, "Requête invalide.");
  messages.push({ role: x.role, content: c });
}
while (messages.length && messages[0].role !== "user") messages.shift();
if (!messages.length || messages[messages.length - 1].role !== "user") return bad(400, "Requête invalide.");
// deux rôles identiques de suite (réponse en échec entre les deux) : réunis, pour ne pas perdre la question (l'API exige l'alternance)
const alt = [];
for (const x of messages) { const last = alt[alt.length - 1]; if (last && last.role === x.role) last.content = (last.content + "\n\n" + x.content).slice(-2000); else alt.push({ role: x.role, content: x.content }); }
let context = "";
if (b.context && typeof b.context === "object" && !Array.isArray(b.context)) {
  const s = JSON.stringify(b.context);
  if (s.length <= 4000) context = s;
}
return [{ json: { status: 200, token: m ? m[1] : "", messages: alt, context } }];
