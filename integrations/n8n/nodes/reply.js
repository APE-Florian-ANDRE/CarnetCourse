// Nœud « Réponse » (Code) : extrait le texte de la réponse de Gemini, nettoie et borne. Toute erreur devient un message générique (rien de technique n'est renvoyé au navigateur).
/*__MSGS__*/
const r = $input.first().json;
const cand = Array.isArray(r.candidates) && r.candidates[0] && typeof r.candidates[0] === "object" ? r.candidates[0] : {};
// requête ou réponse bloquée par les filtres de Google (sécurité, contenu interdit) : message fixe prudent, jamais le texte partiel
if ((r.promptFeedback && r.promptFeedback.blockReason) || /^(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|RECITATION)$/.test(String(cand.finishReason || ""))) return [{ json: { status: 200, reply: BLOCKED } }];
// parties de texte seulement (les « pensées » des modèles qui raisonnent sont ignorées)
const parts = cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter((p) => p && typeof p.text === "string" && !p.thought).map((p) => p.text) : [];
let text = parts.join("\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 4000);
// drapeau de sécurité demandé au modèle en première ligne : crise / urgence / alimentation => message fixe, la réponse du modèle est jetée
const fm = /^\s*\[\[drapeau:\s*([a-zéèêàç]+)\s*\]\]\s*/i.exec(text), flag = fm ? fm[1].toLowerCase().replace(/é/g, "e") : "";
if (fm) text = text.slice(fm[0].length).trim();
if (FLAG2KIND[flag]) return [{ json: { status: 200, reply: SAFE[FLAG2KIND[flag]] } }];
text = text.replace(/\[\[drapeau:[^\]]{0,30}\]\]/gi, "").trim();
if (r.error || !text) return [{ json: { status: 502, reply: "Le coach n'a pas pu répondre. Réessaie dans un moment." } }];
return [{ json: { status: 200, reply: text } }];
