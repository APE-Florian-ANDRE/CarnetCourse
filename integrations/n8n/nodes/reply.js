// Nœud « Réponse » (Code) : extrait le texte de la réponse de Claude, nettoie et borne. Toute erreur devient un message générique (rien de technique n'est renvoyé au navigateur).
/*__MSGS__*/
const r = $input.first().json;
const parts = Array.isArray(r.content) ? r.content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text) : [];
let text = parts.join("\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 4000);
// drapeau de sécurité demandé au modèle en première ligne : crise / urgence / alimentation => message fixe, la réponse du modèle est jetée
const fm = /^\s*\[\[drapeau:\s*([a-zéèêàç]+)\s*\]\]\s*/i.exec(text), flag = fm ? fm[1].toLowerCase().replace(/é/g, "e") : "";
if (fm) text = text.slice(fm[0].length).trim();
if (FLAG2KIND[flag]) return [{ json: { status: 200, reply: SAFE[FLAG2KIND[flag]] } }];
text = text.replace(/\[\[drapeau:[^\]]{0,30}\]\]/gi, "").trim();
if (r.error || r.type === "error" || !text) return [{ json: { status: 502, reply: "Le coach n'a pas pu répondre. Réessaie dans un moment." } }];
return [{ json: { status: 200, reply: text } }];
