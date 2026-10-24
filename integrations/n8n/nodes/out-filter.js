// Sortie du coach (source unique : copiée dans api/coach.js et dans le nœud n8n « Réponse ») : la réponse du modèle ne part JAMAIS telle quelle.
// 1. drapeau cherché partout dans le texte (le modèle l'écrit parfois après une phrase) ; une valeur inconnue est traitée avec prudence ;
// 2. filet guard() sur la réponse elle-même (détresse, trouble alimentaire) : message fixe ;
// 3. phrases retirées si elles contiennent un médicament, un complément, une posologie, un apport calorique très bas, un lien ou un numéro de téléphone ;
// 4. réponse coupée par la limite de longueur : la phrase inachevée est retirée et la coupure est signalée.
const OUT_BAN = /\b(\d+ ?(mg|milligrammes?|mcg)|ibuprofen\w*|paracetamol|doliprane|dafalgan|efferalgan|aspirine|advil|nurofen|spasfon|voltaren\w*|ains|anti ?inflammatoires?|anti ?douleurs?|antalgiques?|cortisone|corticoides?|somniferes?|anxiolytiques?|antidepresseurs?|benzodiazepines?|melatonine|laxatifs?|diuretiques?|coupe ?faims?|bruleurs? de graisse|creatine|bcaa|ordonnance|posologie|comprimes?|gelules?|cachets?)\b/;
const OUT_KCAL = /\b([1-9]\d{2}|1 ?[01]\d{2}) ?(kcal|k cal|kilocalories?|calories?)\b.{0,40}\b(par jour|jour|journee|quotidien\w*|regime|apport)|\b(regime|apport|manger|mange)\b.{0,40}\b([1-9]\d{2}|1 ?[01]\d{2}) ?(kcal|k cal|kilocalories?|calories?)\b/;
const OUT_SCHEME = /(\b(https?|hxxps?|ftp|javascript|data|mailto|tel|file|vbscript|blob):|\/\/|www\.|\]\()/i;
// nom de domaine collé à son extension (« evil.com », « evil[.]com », « evil point com ») ; « 10 min. de footing » n'en est pas un
const OUT_LINK = /(\b[A-Za-z0-9-]{2,}(\.|\[\.\]|\(\.\)|。| dot | point )(com|fr|net|org|io|ly|me|app|co|be|ch|eu|de|uk|ai|dev|info|biz|xyz|link|site|online|shop|gg|tv|to|ru|cn|c0m|COM|FR|NET|ORG|IO|ME|APP|DE)\b|(\+33|\b0)[1-9]([ .-]?\d{2}){4}\b)/;
const OUT_CUT = "\n\n(Réponse coupée : pose une question plus précise pour une réponse complète.)";
const OUT_DROP = "\n\n(Une partie de la réponse a été retirée : le coach ne donne ni médicament, ni complément, ni régime très bas en calories, ni lien. Pour ces sujets, demande à un médecin ou à un pharmacien.)";
function coachOut(raw, finish) {
  let text = String(raw || "");
  const flags = [...text.matchAll(/\[\[\s*drapeau\s*:\s*([^\]]{0,30})\]\]/gi)].map((m) => m[1].trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  for (const f of flags) if (f !== "aucun") return { status: 200, reply: FLAG2KIND[f] ? SAFE[FLAG2KIND[f]] : BLOCKED, flag: f.slice(0, 20) };
  text = text.replace(/\[\[\s*drapeau\s*:[^\]]{0,30}\]\]/gi, "").trim();
  const flag = flags.length ? "aucun" : "absent";
  if (!text) return { status: 502, reply: "Le coach n'a pas pu répondre. Réessaie dans un moment.", flag };
  // la réponse elle-même parle de détresse ou de privation alimentaire : message fixe (les rappels de prudence « urgence » restent permis)
  const k = guard(text);
  if (k === "detresse" || k === "tca") return { status: 200, reply: SAFE[k], flag: "sortie-" + k };
  // réponse coupée par la limite de jetons : la dernière phrase inachevée part
  let cut = false;
  if (String(finish || "") === "MAX_TOKENS") { const i = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"), text.lastIndexOf("!"), text.lastIndexOf("?"), text.lastIndexOf("\n")); if (i > 10) text = text.slice(0, i + 1).trim(); cut = true; }
  // phrase par phrase, ligne par ligne (les listes sont gardées) : les phrases interdites sont retirées
  let dropped = 0, kept = 0;
  const lines = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) { lines.push(""); continue; }
    const ok = line.split(/(?<=[.!?…])\s+/).filter((s) => { const n = norm(s); const bad = OUT_BAN.test(n) || OUT_KCAL.test(n) || OUT_SCHEME.test(s) || OUT_SCHEME.test(s.replace(/\s+/g, "")) || OUT_LINK.test(s); if (bad) dropped++; else kept++; return !bad; });
    const l = ok.join(" "); if (ok.length && !/^\s*([-*•]|\d{1,2}[.)])\s*$/.test(l)) lines.push(l);
  }
  text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (dropped && (!kept || text.replace(/[\s*_\-•.]/g, "").length < 20)) return { status: 200, reply: BLOCKED, flag: "sortie-vide" };
  return { status: 200, reply: (text + (dropped ? OUT_DROP : "") + (cut ? OUT_CUT : "")).slice(0, 4000), flag, dropped, cut };
}
