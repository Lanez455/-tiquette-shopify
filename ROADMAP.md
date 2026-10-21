# Feuille de route : v1.0.0 (version finale)

Critères de validation : voir docs/SPEC.md. « Cœur » = la logique est écrite et testée, l'écran ou l'intégration Shopify reste à faire.

## Formats et imprimantes
- [ ] F1 Taille libre (cœur fait : `customFormat`)
- [ ] F2 Formats prêts (cœur fait : `FORMATS`, à valider sur imprimantes réelles)
- [ ] F3 Case de départ (cœur fait : `layoutSlots`)
- [ ] F4 Réglages fins (cœur fait : décalages et rotation dans `renderLabels`)

## Mise en page
- [ ] F5 Éditeur visuel
- [ ] F6 Champs, prix barré, métachamps (cœur fait : `fieldValue`, logo à faire)
- [ ] F7 Texte qui rétrécit (cœur fait : `fitText`)
- [ ] F8 Prix selon la devise (cœur fait : `formatPrice`)
- [ ] F9 Caractères spéciaux (cœur fait : police DejaVu, cyrillique et arabe testés)

## Codes-barres
- [ ] F10 Codes uniques (cœur fait : `planBarcodes`, test sur 10 000 variantes)
- [ ] F11 Codes existants protégés (cœur fait : confirmation obligatoire, ancienne valeur gardée)
- [ ] F12 Scan sur la bonne variante

## Flux d'impression
- [ ] F13 Quantité par défaut et sélection
- [x] F14 Bons de commande, transferts, CSV (champs de l'API vérifiés sur la référence 2026-10)
- [x] F15 Extensions d'impression et tuile de caisse (à essayer sur une boutique de test : adresse relative de fetch dans l'admin, jeton de la caisse)
- [ ] F16 File et historique

## Impression directe et réception
- [x] F17 Impression directe Zebra et Dymo (ZPL testé au décodage ; noms de rouleaux Dymo et service local à essayer sur machine réelle)
- [x] F18 Réception par scan (mutation vérifiée sur la référence : clé d'idempotence obligatoire depuis 2026-04)

## Codes GS1, modèles et promotions
- [x] F19 Import GS1
- [ ] F20 Modèle automatique par collection
- [ ] F21 Réétiquetage des promotions
- [ ] F22 Étiquettes de rayon et QR codes

## Lancement
- [ ] Formules Gratuit, Pro, Magasin (API de facturation)
- [ ] Test de non-régression des PDF
- [ ] Dossier de revue Shopify
