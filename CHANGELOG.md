# Journal des versions

## Non publié
- Formats prêts : le titre est suivi de la variante (« Bague Lune · 52 »), champ « Titre et variante » aussi proposé dans l'éditeur. Les modèles personnalisés existants ne changent pas.
- Accueil : premiers pas cochés automatiquement, chiffres clés (étiquettes du mois, formule, variantes sans code-barres, prix changés), raccourcis, historique en tableau.
- Impression : recherche dans la file, pages de 50 lignes, bouton pour retirer une ligne, zone de dépôt pour le CSV, pluriels corrigés.
- Modèles : modèles personnalisés et formats prêts séparés, bouton « Personnaliser », badge « Par défaut ».
- Mise en ligne sur Fly.io : formulaires acceptés derrière le proxy, accès read_locales (format des prix), page de validation des abonnements, PDF du bouton Imprimer de l'admin autorisé (CORS).
- Nom de l'app : « Etiqo Barcode Labels » (le nom doit commencer par une marque, règle 4.1 de l'App Store).
- Version anglaise : l'app, le bouton Imprimer de l'admin et la caisse suivent la langue de l'admin Shopify (français ou anglais). La phrase de confirmation « REPLACE n » est acceptée comme « REMPLACER n ».
- Mise en ligne : image Docker, configuration Fly.io, contrôle de santé /healthz, politique de confidentialité publique (/confidentialite) et guide pas à pas (docs/DEPLOIEMENT.md).
- Audit avant mise en production : requêtes sous la limite de coût de Shopify (la lecture des étiquettes était refusée), produits de plus de 250 variantes, relance automatique en cas de débit limité, effacement complet des données au shop/redact, bouton Imprimer qui ne reste plus bloqué, éditeur adapté au téléphone, confirmation avant suppression d'un modèle, lint et essai de bout en bout.
- Écran d'impression : sélection, filtres, quantité par défaut (F13), case de départ, aperçu, file vidée après impression et historique avec réimpression en 1 clic (F16), modèle automatique par collection (F20).
- Éditeur visuel de modèles (F5), métachamps (F6), réglages fins et fiches d'aide par imprimante.
- Bouton « Imprimer » dans l'admin (fiche et liste des produits) et étiquettes depuis la caisse (F15), par liens signés.
- Impression depuis un bon de commande, un transfert ou un fichier CSV (F14).
- Impression directe Zebra (ZPL) et Dymo (DYMO Connect), repli automatique sur le PDF (F17).
- Réception par scan : +1 en stock et étiquette en file (F18).
- Import des GTIN GS1 avec contrôle de la clé (F19).
- Prix changés : réétiquetage des promotions avec prix barré proposé (F21).
- Étiquettes de rayon et QR code vers la fiche produit (F22).
- Formules Gratuit, Pro et Magasin avec l'API de facturation de Shopify.
- Simulateur d'impression thermique utilisé par les tests : chaque format est imprimé, scanné et mesuré.
- Squelette de l'app Shopify (React Router, Polaris, Prisma), scopes et webhooks RGPD.
- Codes-barres : génération unique (F10) et protection des codes existants (F11), avec tests.
- Étiquettes : formats prêts et taille libre (F1, F2), case de départ (F3), décalages et rotation (F4), texte qui rétrécit (F7), prix selon la devise (F8), caractères spéciaux (F9), rendu PDF.
