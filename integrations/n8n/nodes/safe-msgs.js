// Messages fixes de sécurité (serveur) : texte unique, partagé par les nœuds « Contrôle et limite » et « Réponse ». Ils ne contiennent aucun conseil d'entraînement ni d'alimentation.
const SAFE = {
  detresse: "Ce que tu écris me préoccupe, et je ne suis pas la bonne aide pour ça. Tu n'es pas seul(e) : en France, le 3114 (numéro national de prévention du suicide) répond 24 h sur 24, gratuitement. En cas de danger immédiat, appelle le 15 ou le 112. Tu peux aussi en parler à un proche ou à ton médecin.",
  urgence: "Ce que tu décris peut être sérieux. Arrête l'effort. Si la douleur est forte, si elle touche la poitrine, si tu as du mal à respirer ou si tu as eu un malaise, appelle le 15 ou le 112. Sinon, consulte un médecin avant de reprendre le sport.",
  tca: "Ce que tu décris peut toucher à ton rapport à l'alimentation. Je ne peux pas te conseiller là-dessus : parles-en à ton médecin traitant ou à un professionnel de santé, qui pourra t'aider sans jugement. Si tu es en détresse, le 3114 répond 24 h sur 24 ; en cas de danger immédiat, appelle le 15 ou le 112."
};
const FLAG2KIND = { crise: "detresse", urgence: "urgence", alimentation: "tca" };
const BLOCKED = "Je ne peux pas répondre à ce message. Si tu es en difficulté, le 3114 répond 24 h sur 24 ; en cas de danger immédiat, appelle le 15 ou le 112. Pour une question d'entraînement, reformule-la simplement.";
