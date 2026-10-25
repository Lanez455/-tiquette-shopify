# Feuille de route : v1.0.0 (version finale)

Critères de validation : voir docs/SPEC.md. Tout est écrit et testé (tests automatiques et simulateur d'impression). Reste l'essai sur une boutique de développement et sur de vraies imprimantes.

## Formats et imprimantes
- [x] F1 Taille libre
- [x] F2 Formats prêts
- [x] F3 Case de départ
- [x] F4 Réglages fins

## Mise en page
- [x] F5 Éditeur visuel
- [x] F6 Champs, prix barré, métachamps
- [x] F7 Texte qui rétrécit
- [x] F8 Prix selon la devise
- [x] F9 Caractères spéciaux

## Codes-barres
- [x] F10 Codes uniques
- [x] F11 Codes existants protégés
- [x] F12 Scan sur la bonne variante

## Flux d'impression
- [x] F13 Quantité par défaut et sélection
- [x] F14 Bons de commande, transferts, CSV (champs de l'API vérifiés sur la référence 2026-10)
- [x] F15 Extensions d'impression et tuile de caisse (à essayer sur une boutique de test : adresse relative de fetch dans l'admin, jeton de la caisse)
- [x] F16 File et historique

## Impression directe et réception
- [x] F17 Impression directe Zebra et Dymo (ZPL testé au décodage ; noms de rouleaux Dymo et service local à essayer sur machine réelle)
- [x] F18 Réception par scan (mutation vérifiée sur la référence : clé d'idempotence obligatoire depuis 2026-04)

## Codes GS1, modèles et promotions
- [x] F19 Import GS1
- [x] F20 Modèle automatique par collection
- [x] F21 Réétiquetage des promotions
- [x] F22 Étiquettes de rayon et QR codes

## Lancement
- [x] Formules Gratuit, Pro, Magasin (API de facturation ; à essayer sur une boutique de développement)
- [x] Test de non-régression des PDF (simulateur : impression, scan et marges de chaque format)
- [ ] Dossier de revue Shopify

## Version 1.1.0 (prête, à publier après l'acceptation Shopify)
- [x] Gratuit à 250 étiquettes par mois, bons de commande et transferts compris
- [x] Nouveaux prix, paiement à l'année, 14 jours d'essai
- [x] Demande d'avis App Store après la 3e impression

Plan détaillé et sources : document « Etiqo : plan jusqu'à la 2.0 » (étude de ~110 avis négatifs sur 12 apps et du forum Shopify, 25/10/2026). Ordre validé par Yanis le 25/10/2026.

## Version 1.2.0 : réception parfaite
- [ ] Imprimer depuis un bon de commande les quantités reçues, pas commandées
- [ ] Livraison en plusieurs fois : reste à imprimer gardé pour plus tard
- [ ] Contrôle avant impression : variantes sans code-barres, sans prix ou en double, avec solution en un clic (créer le code ou imprimer le SKU)
- [ ] Alerte quand le prix d'achat du bon de commande diffère du coût dans Shopify
- [ ] Étiquettes de carton (ITF-14 ou Code 128 avec la quantité du carton)

## Version 1.3.0 : comptage du stock (formule Magasin)
- [ ] Compter un magasin entier ou par fournisseur, type ou tag ; téléphone, douchette ou caméra
- [ ] Comptage enregistré au fur et à mesure : rien n'est perdu si la page se ferme
- [ ] Écarts avec photos à valider avant de toucher au stock ; ventes pendant le comptage prises en compte
- [ ] Lecture en direct chez Shopify, sans copie qui diverge

## Version 1.4.0 : réassort
- [ ] Stock minimum et maximum, suggestions de commande
- [ ] Brouillon de commande à envoyer au fournisseur (PDF, CSV, e-mail) : l'API 2026-10 lit les bons de commande mais ne permet pas d'en créer
- [ ] Codes fournisseur ; import des données exportées de Stocky

## Version 1.5.0 : confiance
- [ ] Historique des modèles, retour à une version précédente, réimpression avec l'ancienne mise en page
- [ ] Droits par employé : remplacement de codes en masse réservé au propriétaire
- [ ] Enregistrement automatique des modèles en cours
- [ ] Aide dans l'app avec une vraie personne, réponse sous 24 h ; jamais de chat automatique insistant ni de demande d'avis répétée

## Version 1.6.0 : Europe et cas particuliers
- [ ] Allemand, espagnol, italien ; planches A4 européennes (Herma, Avery Zweckform)
- [ ] Codes à prix ou poids intégré (EAN-13 commençant par 2)
- [ ] Cyrillique et devises écrites de droite à gauche
- [ ] Masquer le numéro sous le code-barres, cacher le prix sur un modèle (vérifier l'existant)

## Version 2.0.0 : le magasin complet
- [ ] Prévisions simples : jours de stock restants, alerte hebdomadaire des ruptures
- [ ] Tableau de bord unique : à recevoir, à imprimer, à compter, à commander
- [ ] Liaison avec Shopify Flow
- [ ] Formule « Store Plus » possible ; formules existantes inchangées pour les abonnés
