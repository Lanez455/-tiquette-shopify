# Fiche App Store : Etiqo Barcode Labels

Textes à copier dans le Partner Dashboard → Distribution des applications → Etiqo Barcode Labels → fiche de l'App Store.
L'anglais est obligatoire ; le français s'ajoute comme traduction de la fiche.
Les limites de longueur sont indiquées à titre indicatif : le formulaire de Shopify affiche le compteur exact.

Règles de Shopify à respecter sur toute la fiche : pas de prix ni d'avis dans les images, pas de comparaison avec d'autres apps nommées, pas de superlatifs invérifiables (« la meilleure », « n° 1 »), pas de coordonnées dans les images.

## Informations générales

| Champ | Valeur |
| --- | --- |
| Nom de l'app | Etiqo Barcode Labels |
| Catégorie | Store management → Inventory (ou « Barcodes and labels » si proposé) |
| Langues de l'app | Anglais, français |
| Politique de confidentialité | https://etiqo-barcode-labels.fly.dev/confidentialite |
| E-mail de support | YanisLanez@outlook.com |
| Prix (à partir de la 1.1.0, à changer sur la fiche le jour de la mise en ligne) | Gratuit (250 étiquettes / mois, bons de commande compris), Pro 7,99 $ / mois ou 79 $ / an, Magasin 17,99 $ / mois ou 179 $ / an, 14 jours d'essai |

## Textes en anglais (obligatoires)

**Introduction (≈ 100 caractères)**

> Print barcode labels that fit your printer, right from products, purchase orders and POS.

**Description détaillée (≈ 500 caractères)**

> Etiqo prints product labels at the exact size of your roll or sheet: Dymo, Zebra, Brother, Avery or any custom size. Start from a ready-made format or move fields freely in the visual editor. Create unique EAN-13, UPC-A or Code 128 barcodes for variants that have none; existing barcodes are never changed without your confirmation. Print from a product page, a purchase order, a stock transfer, a CSV file or Shopify POS, and see which labels to redo when a price changes.

**Fonctionnalités (≈ 80 caractères chacune)**

1. Exact-size labels for Dymo, Zebra, Brother, Avery sheets or any custom size
2. Unique barcodes for variants without one; existing codes always protected
3. Print from purchase orders and transfers with the received quantities
4. Print button in product pages and a tile in Shopify POS
5. Price-change list to relabel promotions, with compare-at price

**Formules (texte affiché sous chaque prix)**

- Free: 50 labels per month, ready-made formats, 1 custom template, unique barcodes.
- Pro: unlimited labels and templates, full editor, purchase orders, transfers and CSV import.
- Store: everything in Pro, plus receiving by scan, POS tile, direct Zebra and Dymo printing, priority support.

## Textes en français

**Introduction**

> Des étiquettes code-barres à la taille de votre imprimante, depuis vos produits, bons de commande et la caisse.

**Description détaillée**

> Etiqo imprime vos étiquettes produit à la taille exacte de votre rouleau ou de votre planche : Dymo, Zebra, Brother, Avery ou taille libre. Partez d'un format prêt ou placez librement les champs dans l'éditeur visuel. Créez des codes EAN-13, UPC-A ou Code 128 uniques pour les variantes qui n'en ont pas ; les codes existants ne changent jamais sans votre accord. Imprimez depuis une fiche produit, un bon de commande, un transfert de stock, un fichier CSV ou la caisse Shopify, et retrouvez les étiquettes à refaire quand un prix change.

**Fonctionnalités**

1. Étiquettes à la taille exacte : Dymo, Zebra, Brother, planches Avery ou taille libre
2. Codes-barres uniques pour les variantes sans code ; codes existants protégés
3. Impression depuis les bons de commande et transferts, aux quantités reçues
4. Bouton Imprimer dans les fiches produit et tuile dans la caisse Shopify
5. Liste des prix changés pour réétiqueter les promotions, avec prix barré

**Formules**

- Gratuit : 50 étiquettes par mois, formats prêts, 1 modèle personnalisé, codes-barres uniques.
- Pro : étiquettes et modèles illimités, éditeur complet, bons de commande, transferts et import CSV.
- Magasin : tout Pro, plus réception par scan, tuile en caisse, impression directe Zebra et Dymo, support prioritaire.

## Visuels à préparer

- **Icône** : 1200 × 1200 px, PNG ou JPG, sans texte, coins non arrondis (Shopify les arrondit).
- **Captures d'écran** : 1600 × 900 px (16:9), de 3 à 6, prises sur LABTEST avec des produits réalistes :
  1. Écran Impression avec quelques produits et l'aperçu d'une étiquette.
  2. Éditeur visuel d'un modèle (champs déplacés, prix barré).
  3. Écran Codes-barres : couverture du catalogue et création des codes manquants.
  4. Bouton Imprimer dans la fiche d'un produit (panneau avec l'aperçu).
  5. Impression depuis un bon de commande.
  6. Prix changés.
- Recadrer pour ne garder que l'app, sans barre du navigateur ni données personnelles.

## Instructions de test pour l'équipe de revue (à coller en anglais)

> **No login needed**: the app is embedded and uses the store's Shopify session.
>
> **Billing**: subscriptions are created in test mode during review; approving a plan does not charge the store.
>
> 1. Install the app and accept the requested access.
> 2. **Barcodes**: open *Barcodes*. Variants without a barcode are counted; click *Create the N missing barcodes*. Existing barcodes are not modified, and the batch can be undone from the change log.
> 3. **Print**: open *Print*, click *Select all* (or *Add products*), set a quantity on a few variants, then click *Preview* and *Print*. A PDF at the exact label size opens in the browser's print dialog.
> 4. **Product page**: open any product in the Shopify admin → *More actions* → *Print* → *Etiqo Barcode Labels*. The panel shows a preview; Shopify's print button opens the PDF.
> 5. **Purchase orders** (Pro plan): open *Plans* and choose *Pro* (test charge). Create a purchase order in *Products → Purchase orders*, then in the app's *Print* screen pick it under *Purchase order or transfer* and click *Add its items*: quantities match the purchase order.
> 6. **Price changes**: after printing a product, change its price in the admin. It appears in *Price changes* with the compare-at price suggested.
> 7. **Shopify POS** (Store plan): in Shopify POS, add the *Etiqo* tile to the home screen. It prints labels for the cart, and a product's action menu prints that product's label.
> 8. **Direct printing** to Zebra or Dymo needs a printer and its vendor service on the computer; without them the app falls back to the PDF automatically.
>
> Support: YanisLanez@outlook.com

## Avant de soumettre

- [ ] La branche `mise-en-ligne` est fusionnée dans `main`, et c'est cette version qui tourne sur Fly.
- [ ] Scan du code-barres d'un PDF avec un téléphone : le numéro lu est le bon.
- [ ] Tuile de la caisse essayée dans l'appli Shopify POS.
- [ ] Icône et captures prêtes.
- [ ] `BILLING_TEST` n'est pas réglé à `false` : les abonnements restent en test pendant la revue.
- [ ] Après l'accord de Shopify : `fly secrets set BILLING_TEST=false` pour facturer pour de vrai.

## Champs du formulaire « English listing » (Partner Dashboard)

| Section | Champ | Valeur |
| --- | --- | --- |
| Basic app information | App name | Etiqo Barcode Labels |
| | App category | Store management → Inventory management (ou « Barcodes » si proposé) |
| | Languages | English, French |
| App discovery | App card subtitle | Barcode labels that fit your printer, in a few clicks |
| | Search terms | barcode labels · label printer · price tags · dymo zebra · inventory labels |
| Listing content | Support | E-mail : YanisLanez@outlook.com |
| | Resources | Privacy policy : https://etiqo-barcode-labels.fly.dev/confidentialite |
| Pricing | Plans | 1.1.0 : Free 0 $ (250 labels/month, purchase orders included) · Pro $7.99/month or $79/year · Store $17.99/month or $179/year · 14-day free trial |
| Install requirements | Sales channel | Aucun canal obligatoire (ni boutique en ligne ni POS) |
| Contact | Merchant review email / App submission email | YanisLanez@outlook.com |
| App testing | Test account | Non nécessaire : l'app est intégrée à l'admin et utilise la session Shopify |
| | Testing instructions | Texte « Instructions de test » plus haut |
| | Screencast URL | Vidéo YouTube « non répertoriée » (voir le déroulé ci-dessous) |

**Déroulé de la vidéo de démonstration (2 à 3 minutes, sans voix, en anglais si possible)**
1. Installation de l'app sur la boutique de test et écran d'accueil.
2. Codes-barres : création des codes manquants.
3. Impression : sélection de produits, quantités, aperçu, PDF.
4. Fiche produit → Plus d'actions → Imprimer → Etiqo Barcode Labels.
5. Formules : choix de Pro (abonnement de test), puis impression depuis un bon de commande.
6. Prix changés.

Enregistrement sous Windows 11 : Outil Capture d'écran (Win + Maj + R), puis mise en ligne sur YouTube en « non répertoriée ».

**Point à surveiller :** dans l'app en anglais, la formule s'appelle « Store », mais la page de paiement de Shopify affiche « Magasin » (nom technique de l'abonnement). À harmoniser avant la soumission.
