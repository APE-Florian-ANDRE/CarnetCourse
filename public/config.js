/* Configuration publique du site. AUCUN SECRET ICI : la clé « anon » de Supabase est faite pour être publique
   (la sécurité vient des règles RLS de supabase/schema.sql). N'écris JAMAIS la clé « service_role » dans ce dépôt. */
window.APP_CONFIG = Object.freeze({
  /* --- Connexion (Supabase). Laisse vide pour un site 100 % « invité » (tout reste sur l'appareil).
       Après avoir renseigné SUPABASE_URL : lance « node tools/set-csp.js » (ajoute l'URL exacte à la CSP). --- */
  SUPABASE_URL: "https://yunidhwvpusrsgxqdzpb.supabase.co",          // ex. https://abcdefghij.supabase.co
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bmlkaHd2cHVzcnNneHFkenBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NjU4MzgsImV4cCI6MjEwNzU0MTgzOH0.cAYQ-UUpdP_Tu29GxqyqhlMcc-cWP5SYAD8X3-y3ry0",     // clé « anon / publishable » du projet (Project Settings > API)
  PROVIDERS: ["google", "github"],   // google, azure (Microsoft), github, apple ; seuls ceux activés dans Supabase fonctionnent

  /* --- Coach (assistant IA, optionnel). Laisse vide : l'onglet « Coach » est caché et rien n'est envoyé.
       Adresse https du webhook n8n (voir integrations/n8n/README.md). Après l'avoir renseignée : lance « node tools/set-csp.js »
       (ajoute l'origine exacte à connect-src). JAMAIS de clé d'IA ni de secret ici : la clé reste dans n8n. --- */
  CHAT_WEBHOOK_URL: "",      // ex. https://n8n.example.org/webhook/carnet-coach
  CHAT_PROVIDER_NAME: "",    // fournisseur d'IA appelé par n8n, affiché dans la feuille de consentement (ex. "Google Gemini, États-Unis")

  /* --- Informations légales à compléter par l'éditeur (affichées dans les pages légales) --- */
  LEGAL: Object.freeze({
    EDITEUR_NOM: "Florian André",
    EDITEUR_STATUT: "Particulier (éditeur non professionnel)",
    EDITEUR_ADRESSE: "Non communiquée, conformément à l'article 6-III-2 de la LCEN (identité communiquée à l'hébergeur)",
    EDITEUR_EMAIL: "andreflorian83@gmail.com",
    EDITEUR_SIRET: "Sans objet (particulier)",
    DIRECTEUR_PUBLICATION: "Florian André",
    HEBERGEUR_NOM: "Vercel Inc.",
    HEBERGEUR_ADRESSE: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
    SUPABASE_REGION: "UE (Francfort)",
    DPO_EMAIL: "Sans objet (contact : andreflorian83@gmail.com)",
    MEDIATEUR: "Sans objet (service gratuit, sans vente)",
    INACTIVITE_MOIS: "24"
  })
});
