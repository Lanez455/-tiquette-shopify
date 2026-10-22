# Cahier des charges — App d'étiquettes code-barres Shopify

2026-10-21 · @Yanis

## Contexte et objectif

L'objectif est de construire l'app d'étiquettes code-barres que les boutiques physiques sur Shopify réclament : celle qui corrige, point par point, les reproches faits à l'app officielle de Shopify.

- **Le constat :** [Retail Barcode Labels](https://apps.shopify.com/retail-barcode-labels), l'app gratuite de Shopify, a **2,3/5 sur 476 avis**, dont 208 à 1 étoile et 85 à 2 étoiles (62 % d'avis négatifs).
- **Le déclencheur :** une mise à jour d'avril 2026 a changé la quantité par défaut, les modèles et les polices. Les avis négatifs s'accumulent depuis.
- **La concurrence :** les meilleures alternatives ont 300 à 370 avis (MS Barcode : 368, EasyScan : 333, RF Barcode : 294). Aucune ne domine.
- **La cible :** les commerçants qui vendent en magasin avec la caisse Shopify (POS) et étiquettent chaque arrivage de marchandise.

**Objectif de la ****version finale :** une app fiable, qui imprime la bonne étiquette, à la bonne taille, sur l'imprimante du commerçant, en moins de clics que l'app officielle, avec l'impression directe et la réception par scan dès le lancement. Objectif commercial : 300 boutiques payantes à 12 $ par mois en 12 à 18 mois, soit environ 3 600 $ par mois.

## Ce que disent les avis négatifs

Quatre grands reproches reviennent à parts presque égales : les formats d'étiquettes, la mise en page, les codes-barres et le nombre de clics pour imprimer. La fiabilité et le support viennent juste derrière.

J'ai lu environ 100 avis : les pages 1 à 6 des avis à 1 étoile, les pages 1 et 2 des avis à 2 et à 3 étoiles. Un même avis peut citer plusieurs reproches, et les nombres sont des ordres de grandeur.

| Reproche | Avis concernés (environ) | Ce que les marchands écrivent |
| --- | --- | --- |
| Formats et imprimantes non gérés | 22 | Pas de taille libre. Manquent Dymo 30332, 30333, 30336, 30299, les étiquettes 1"×1", les ronds de 3", les étiquettes de carton de 3,5" ou 4". Pas de modèle Brother QL-810, pourtant l'imprimante recommandée en Australie et Nouvelle-Zélande. Zebra LC8 « trop petite ». Impression coupée, décalée ou dans le mauvais sens. Impossible de choisir la case de départ sur une planche Avery 5160 entamée. |
| Mise en page trop rigide | 22 | Le SKU a disparu des étiquettes Avery 5167. Impossible de masquer ou d'afficher le prix à volonté, ni d'afficher le prix barré. Police imposée, texte tronqué avec « ... » au lieu de rétrécir. Seulement 2 lignes et 8 champs, pas de métachamps. Pas de prix en gras, éléments impossibles à déplacer. Devise mal formatée (roupie, sens de lecture arabe, pas d'espace avant le symbole). Cyrillique et caractères spéciaux non gérés. |
| Flux d'impression trop long | 20 | Quantité par défaut passée de 0 à 1 en avril 2026 : il faut remettre chaque variante à 0. Tous les produits présélectionnés. Pas de « tout sélectionner » sur 1 000 produits. Impossible d'imprimer depuis un bon de commande fournisseur, Stocky, un CSV ou l'app de caisse. Produits déjà imprimés qui restent dans la file. 10 clics et 53 secondes pour quelques étiquettes, contre 6 clics et 25 secondes dans le logiciel Dymo. |
| Codes-barres peu fiables | 18 | Doublons : l'app prend les 8 derniers chiffres de l'identifiant de variante. Codes existants modifiés sans prévenir, qui ne scannent plus. Génération qui échoue ou n'apparaît pas. Codes fabricant non reconnus. Pas de GTIN à 12 chiffres pour Google Merchant Center. Pas de protection sur « remplacer tous les codes ». |
| Fiabilité et support | 10 | Mises à jour qui cassent tout sans préavis. App qui cesse de fonctionner. Écrans lents. Support absent ou automatisé par IA. |

Les reproches les plus récents (avril à octobre 2026) portent surtout sur la quantité par défaut, les modèles modifiés et l'impression depuis les bons de commande. [Avis 1 étoile](https://apps.shopify.com/retail-barcode-labels/reviews?ratings%5B%5D=1) · [Avis 2 étoiles](https://apps.shopify.com/retail-barcode-labels/reviews?ratings%5B%5D=2) · [Avis 3 étoiles](https://apps.shopify.com/retail-barcode-labels/reviews?ratings%5B%5D=3)

## Utilisateurs cibles et cas d'usage

La cible est le commerçant indépendant avec une ou plusieurs boutiques physiques sur la caisse Shopify, qui étiquette lui-même sa marchandise.

**Profils vus dans les avis :** boutiques de cadeaux, bijouteries et piercings, vêtements enfants, chocolatiers, caves et domaines viticoles, papeteries, magasins de loisirs. Beaucoup arrivent d'une autre caisse (QuickBooks POS, Lightspeed) et comparent avec ce qu'ils avaient avant.

**Cas d'usage, du plus fréquent au plus rare :**

1. **Étiqueter un arrivage** : imprimer, pour chaque variante reçue, autant d'étiquettes que d'unités, depuis un bon de commande fournisseur ou un transfert de stock.
2. **Étiqueter un nouveau produit** : créer le code-barres s'il n'existe pas, puis imprimer.
3. **Réétiqueter après un changement de prix ou une promotion** : afficher le nouveau prix, parfois avec le prix barré.
4. **Réimprimer une étiquette abîmée** depuis la caisse, sans quitter le comptoir.
5. **Petits formats spéciaux** : étiquettes de bijoux et de piercings, pastilles de prix.
6. **Grands formats** : étiquettes de carton et de stock en réserve.

**Matériel cité :** imprimantes Dymo (LabelWriter 450 et 550), Zebra, Brother (QL-810), Rollo, et imprimantes laser ou jet d'encre avec planches Avery (5160, 5167).

## Fonctionnalités

La version finale compte 22 fonctions, toutes livrées au lancement. Chacune corrige un reproche précis ou répond à une demande des avis, et a un critère de validation testable.

**Formats et imprimantes**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F1 | Taille d'étiquette libre (largeur × hauteur en mm ou en pouces, forme rectangle ou rond) | Formats imposés | Une étiquette de 25 × 25 mm et un rond de 3" s'impriment sans débordement |
| F2 | Bibliothèque de formats prêts : Dymo 30252, 30299, 30332, 30333, 30334, 30336 ; Zebra 2"×1" et 1"×1" ; Brother DK-1201 et DK-2205 ; Avery 5160, 5167 ; bijoux et piercings | Formats manquants | Chaque format s'imprime centré, dans le bon sens, sur une vraie imprimante |
| F3 | Choix de la case de départ sur une planche entamée (ligne et colonne) | Planches gaspillées | Sur une Avery 5160, démarrer en ligne 4 colonne 2 imprime au bon endroit |
| F4 | Réglages fins : décalage horizontal et vertical, rotation à 90°, marges | Impression coupée ou décalée | Un décalage de 1 mm se voit sur l'aperçu et à l'impression |

**Mise en page**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F5 | Éditeur visuel par glisser-déposer : chaque élément se place, se redimensionne et s'aligne librement | Mise en page rigide | On déplace le prix en bas à droite et on le met en gras |
| F6 | Champs disponibles : titre, variante, SKU, prix, prix barré, fournisseur, type, code-barres et son numéro, texte libre, métachamps produit et variante, logo | Champs limités, SKU retiré, pas de prix barré | Chaque champ s'active ou se masque indépendamment, y compris le prix |
| F7 | Texte qui rétrécit pour tenir dans sa zone, avec une taille minimale et un retour à la ligne | Titres tronqués par « ... » | Un titre de 60 caractères tient sur une étiquette bijou, sans coupure |
| F8 | Format de prix selon la devise et la langue de la boutique, symbole avant ou après, espace configurable | Devises mal affichées | Les prix en EUR, INR et AED s'affichent correctement, y compris en écriture de droite à gauche |
| F9 | Prise en charge complète des caractères (accents, cyrillique, arabe, ponctuation) | Caractères spéciaux | Un titre en cyrillique avec apostrophes et barres obliques s'imprime sans erreur |

**Codes-barres**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F10 | Génération de codes uniques garantis (Code 128, EAN-13, UPC-A), avec vérification des doublons dans tout le catalogue | Doublons | Sur 10 000 variantes, aucun doublon ; un doublon existant est signalé |
| F11 | Codes existants jamais modifiés sans action explicite ; codes fabricant conservés ; confirmation obligatoire avant tout remplacement en masse | Codes modifiés sans prévenir | Aucun code existant ne change après une génération ou une mise à jour de l'app |
| F12 | Code-barres ouvert directement sur la bonne variante au scan en caisse | Le scan ouvre le produit parent | Le scan d'une étiquette ajoute la bonne variante au panier |

**Flux d'impression**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F13 | Quantité par défaut réglable : 0, 1 ou stock disponible ; rien de présélectionné ; « tout sélectionner » et filtres (collection, fournisseur, type, date d'ajout) | Quantité à 1, tout présélectionné | Imprimer 1 étiquette d'une seule variante prend 3 clics au plus depuis la fiche produit |
| F14 | Impression depuis un bon de commande fournisseur, un transfert de stock ou un fichier CSV, avec les quantités reçues | Pas d'impression depuis les arrivages | Un bon de 200 variantes produit 200 lignes aux bonnes quantités en un clic |
| F15 | Bouton « Imprimer les étiquettes » dans la liste et la fiche produit, et une tuile dans l'app de caisse | Trop d'écrans, rien en caisse | Depuis la caisse, réimprimer l'étiquette d'un article prend moins de 30 secondes |
| F16 | File d'impression qui se vide après chaque impression, historique pour réimprimer | Produits déjà imprimés qui restent dans la file | Après une impression, la file est vide ; la dernière impression se relance en 1 clic |

**Impression directe et réception**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F17 | Impression directe sans fenêtre d'impression depuis un ordinateur : code natif ZPL vers les Zebra (Browser Print), envoi vers les Dymo (DYMO Connect). Sur iPad, repli automatique sur le PDF | Trop de clics, réglages d'impression à refaire à chaque fois | Sur une Zebra et une Dymo, une étiquette sort en 1 clic, sans boîte de dialogue |
| F18 | Réception par scan : scanner un article reçu ajoute 1 au stock du magasin et place son étiquette dans la file | « Pas de mode de mise à jour du stock par scan » | 20 articles scannés : stock augmenté de 20 et 20 étiquettes prêtes |

**Codes GS1, modèles et promotions**

| # | Fonction | Reproche corrigé | Validé quand |
| --- | --- | --- | --- |
| F19 | Import des GTIN achetés par le marchand auprès de GS1 (CSV ou saisie), avec contrôle de la clé. L'app n'invente jamais de GTIN | Pas de GTIN pour Google Merchant Center | 500 GTIN importés, clés vérifiées, aucun GTIN créé par l'app |
| F20 | Modèle automatique par collection : bijoux sur le format bijou, vêtements sur le 2"×1" | Choisir le modèle à chaque impression | Une sélection mêlant bijoux et vêtements sort sur les deux bons formats sans choix manuel |
| F21 | Réétiquetage des promotions : liste des produits dont le prix a changé depuis la dernière impression, prix barré proposé | Rien pour suivre les changements de prix | Après le changement de prix de 10 produits, les 10 apparaissent et s'impriment en 1 clic |
| F22 | Étiquettes de rayon et QR codes vers la fiche produit | Pas d'étiquettes de rayon | Un QR code scanné au téléphone ouvre la bonne fiche produit |

## Pistes après le lancement

Toutes les fonctions d'étiquetage sont dans la version finale. Restent deux idées hors étiquettes, à décider selon les retours des marchands :

- Rapport de fin de journée par magasin : ventes par moyen de paiement et par vendeur. C'est un manque cité dans les avis de la caisse Shopify.
- Ajustements de stock rapides depuis la caisse.

## Exigences techniques

Tout ce dont la version finale a besoin existe aujourd'hui chez Shopify. La lecture des bons de commande, la grande nouveauté, est ouverte depuis le 17 septembre 2026.

**Base de l'app**

- Modèle d'app officiel de Shopify (CLI Shopify), interface avec les composants Polaris, intégrée dans l'administration.
- API GraphQL Admin, **version 2026-10 minimum**, nécessaire pour lire les bons de commande.
- Base de données pour les modèles d'étiquettes, les réglages et l'historique d'impression.

**Accès demandés à la boutique (scopes)**

| Accès | Pourquoi |
| --- | --- |
| `read_products`, `write_products` | Lire les produits et écrire les codes-barres des variantes |
| `read_inventory`, `read_locations` | Proposer la quantité égale au stock, par magasin |
| `read_inventory_purchase_orders` | Imprimer depuis un bon de commande fournisseur (F14) |
| `read_inventory_transfers` | Imprimer depuis un transfert de stock (F14) |
| write_inventory | Mettre à jour le stock lors de la réception par scan (F18) |

**Points d'entrée dans Shopify**

- **Menu Imprimer de la fiche produit et de la liste de produits** (sélection multiple) : extensions d'impression de l'administration (F15).
- **Tuile dans l'app de caisse** : extension pour la caisse, avec l'API d'impression qui accepte HTML, images et PDF (F15). Un PDF passe forcément par la fenêtre d'impression du système (AirPrint sur iPad).

**Impression**

- **Par défaut**** :** générer un **PDF à la taille exacte de l'étiquette**, ouvert dans la fenêtre d'impression. Cela fonctionne avec toutes les imprimantes installées. Une fiche d'aide par imprimante indique les bons réglages (échelle 100 %, pas de marges).
- **Impression directe (F17) :** code natif via les logiciels de connexion de Zebra (Browser Print) et de Dymo (DYMO Connect), installés sur l'ordinateur du commerçant. Ces logiciels n'existent pas sur iPad : en caisse, l'impression passe toujours par le PDF et AirPrint.
- Codes-barres générés par une bibliothèque éprouvée (Code 128, EAN-13, UPC-A), avec contrôle de la clé de validation pour EAN et UPC.

**Règles sur les codes-barres (F10, F11)**

- Jamais dériver un code de l'identifiant de variante : c'est la cause des doublons de l'app officielle.
- Avant d'attribuer un code, vérifier dans tout le catalogue qu'il n'existe pas déjà.
- Ne jamais écraser un code existant, sauf action explicite avec confirmation et journal des changements.

Sources : [lecture des bons de commande](https://shopify.dev/changelog/purchase-order-read-api) · [API d'impression de la caisse](https://shopify.dev/docs/api/pos-ui-extensions/latest/target-apis/platform-apis/printing-api.md) · [extensions d'impression de l'administration](https://shopify.dev/docs/api/admin-extensions/latest/target-apis/core-apis/print-action-extension-api)

## Parcours utilisateur et écrans

Quel que soit le point de départ, le commerçant arrive sur le même écran d'impression. Un code-barres manquant se crée en chemin, sans changer d'écran.

_(Schéma du parcours d'impression : voir le cahier des charges en ligne.)_

Le seul embranchement est l'absence de code-barres : l'app en génère un unique, puis reprend le parcours normal.

**Écrans**

1. **Accueil** : dernières impressions, raccourcis vers les arrivages récents, alertes de doublons.
2. **Impression** : liste des variantes avec quantités, filtres, choix du modèle, aperçu en direct.
3. Réception : scan des articles reçus, stock mis à jour, étiquettes ajoutées à la file.
4. Promotions : produits dont le prix a changé depuis la dernière impression.
5. **Modèles** : bibliothèque de formats prêts et éditeur visuel.
6. **Codes-barres** : couverture du catalogue, doublons détectés, journal des changements.
7. **Réglages** : imprimante par défaut, quantité par défaut, devise, décalages.
8. **Aide** : une fiche par imprimante avec les bons réglages.

## Tarification et positionnement

Il faut une version gratuite pour attirer les déçus de l'app officielle, qui est gratuite, puis deux formules payantes entre 10 et 20 $ par mois.

**Promesse :** « Des étiquettes qui tombent juste, sur votre imprimante, en 3 clics. Et vos codes-barres ne changent jamais sans votre accord. »

| Formule | Prix | Contenu |
| --- | --- | --- |
| Gratuit | 0 $ | 50 étiquettes par mois, formats prêts, 1 modèle personnalisé, codes-barres uniques |
| Pro | 9,99 $ par mois | Étiquettes illimitées, éditeur complet, modèles illimités, bons de commande, transferts, CSV |
| Magasin | 19,99 $ par mois | Tout Pro, plus plusieurs magasins, tuile en caisse, historique d'impression, support prioritaire , impression directe Zebra et Dymo, réception par scan |

Avec un abonnement annuel à –20 %, la moyenne visée est d'environ 12 $ par boutique payante.

**Prix des concurrents relevés :**

| App | Avis | Prix |
| --- | --- | --- |
| [Retail Barcode Labels](https://apps.shopify.com/retail-barcode-labels) (Shopify) | 476, note 2,3 | Gratuit |
| MS Barcode Labels & Generator | 368, note 4,9 | Version gratuite, prix non affichés |
| RF Barcode Generator & Labels | 294, note 5,0 | Gratuit |
| [MB Barcode Labels](https://apps.shopify.com/autoscan) | 1, note 5,0 | 9, 19 ou 29 $ par mois |
| [Labelify](https://apps.shopify.com/barcode-labels-pro) | 0 | Gratuit ou 4,99 $ par mois |

**Différences à mettre en avant sur la fiche de l'app :** impression depuis les bons de commande (nouveau chez Shopify en septembre 2026), formats Brother inclus, impression directe sans fenêtre d'impression, réception par scan, tuile en caisse, garantie « zéro doublon », quantité par défaut à 0.

## Plan de tests et critères de réussite

La version finale est publiée directement, sans bêta. Seuls les tests sur de vraies imprimantes et la validation de Shopify restent obligatoires avant la sortie.

**Tests avant lancement**

- [ ] **Imprimantes réelles** : chaque format de F2 imprimé sur Dymo LabelWriter 550, Brother QL-810, une Zebra de bureau et une laser avec planches Avery 5160 et 5167. Contrôle : centrage, sens, rien de coupé, code qui scanne.
- [ ] **Catalogue de test de 10 000 variantes** : génération de tous les codes, zéro doublon, aucun code existant modifié.
- [ ] **Textes difficiles** : titre de 60 caractères sur étiquette bijou, cyrillique, arabe, apostrophes et barres obliques, prix en EUR, INR et AED.
- [ ] **Bon de commande de 200 variantes** : bonnes quantités en un clic.
- [ ] **Caisse sur iPad** : réimpression d'une étiquette en moins de 30 secondes.
- [ ] **Chronomètre** : 1 étiquette d'une variante en 3 clics au plus depuis la fiche produit. Repère dans les avis : 10 clics et 53 secondes avec l'app officielle.
- [ ] Impression directe : sur une Zebra et une Dymo, 1 clic imprime sans fenêtre d'impression ; sur iPad, le repli PDF fonctionne.
- [ ] Réception par scan : 20 articles scannés, stock augmenté de 20, 20 étiquettes prêtes.
- [ ] Import GS1 : 500 GTIN importés, clés vérifiées, aucun GTIN inventé.
- [ ] Promotions : 10 prix modifiés apparaissent dans la liste et s'impriment en 1 clic.
- [ ] **Validation de Shopify** : l'app passe la revue de la boutique d'apps.

**Lancement direct, sans bêta :** dès la publication, proposer 3 mois de formule Pro offerts aux auteurs d'avis négatifs récents sur l'app officielle, et sur le forum de Shopify. Les 10 premiers utilisateurs jouent le rôle de bêta, et leurs retours sont corrigés dans les mises à jour suivantes.

**Critères de réussite à 6 mois (objectifs, à ajuster) :**

| Indicateur | Objectif |
| --- | --- |
| Note sur la boutique d'apps | 4,8 ou plus, avec au moins 20 avis |
| Boutiques installées | 500 |
| Passage de la version gratuite à une formule payante | 10 % |
| Boutiques payantes | 50 |
| Désabonnements par mois | moins de 5 % |
| Doublons de codes-barres signalés | 0 |

## Hors périmètre et risques

La version finale reste centrée sur l'étiquetage et la réception de marchandise. Le premier risque est que Shopify corrige son app gratuite.

**Hors périmètre**

- Gestion de stock au-delà de la réception par scan, rapports de caisse.
- Attribution de GTIN officiels : l'app importe ceux du marchand, elle n'en invente jamais.
- Imprimantes non listées dans F2 : elles passent par la taille libre (F1), sans garantie de résultat.

**Risques**

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Shopify corrige son app gratuite | Moins de mécontents à convertir | Viser les besoins que Shopify ne couvrira pas : bons de commande, Brother, bijoux, caisse, support humain |
| Rendu différent d'une imprimante à l'autre | Avis négatifs dès le lancement | Tests sur imprimantes réelles, fiches de réglage, réglages fins (F4) |
| Un bug modifie des codes-barres existants | Perte de confiance immédiate | Jamais d'écriture sans confirmation, journal des changements, retour arrière possible |
| Les concurrents copient les fonctions | Différence qui s'érode | Avance sur les avis et le support ; qualité d'impression |
| Support chronophage | Moins de temps pour développer | Fiches d'aide par imprimante, réponses types, formule Magasin pour le support prioritaire |
| Lancement plus tardif, tout étant livré d'un coup | Premiers revenus et premiers avis repoussés ; plus de choses à tester avant la sortie | Construire l'impression directe et la réception en parallèle du reste ; garder le PDF comme solution de repli si une imprimante pose problème |

**Matériel à prévoir :** une Dymo LabelWriter 550, une Brother QL-810 et une Zebra de bureau au minimum (la Zebra sert aussi à tester l'impression directe) pour tester, et quelques rouleaux et planches d'étiquettes.

## Annexe A : prompt pour construire l'app avec Claude (conversation)

À copier tel quel dans Claude, de préférence dans un projet où tu ajoutes aussi ce cahier des charges. Construis une étape à la fois et teste-la avant de passer à la suivante.

```
Tu es mon développeur. On construit ensemble une app Shopify publique d'étiquettes code-barres pour les boutiques physiques. Le cahier des charges complet est joint ; respecte-le, en particulier les fonctions F1 à F22 et leurs critères de validation. Tout est livré dans une seule version finale.

Contraintes techniques :
- Modèle d'app officiel généré par la CLI Shopify, interface Polaris, intégrée à l'administration.
- API GraphQL Admin version 2026-10 minimum.
- Scopes : read_products, write_products, read_inventory, write_inventory, read_locations, read_inventory_purchase_orders, read_inventory_transfers.
- Impression : PDF généré à la taille exacte de l'étiquette, ouvert dans la fenêtre d'impression. Impression directe sur ordinateur via Zebra Browser Print (ZPL) et DYMO Connect, avec repli sur le PDF (toujours le PDF sur iPad).
- Codes-barres : bibliothèque éprouvée (Code 128, EAN-13, UPC-A). Ne jamais dériver un code de l'identifiant de variante. Vérifier l'unicité dans tout le catalogue avant d'écrire. Ne jamais modifier un code existant sans confirmation explicite, et journaliser chaque changement. Ne jamais inventer de GTIN : seulement ceux importés par le marchand.

Méthode :
1. Avant de coder, propose l'architecture (dossiers, modèle de données des modèles d'étiquettes, écrans) et attends mon accord.
2. Construis dans cet ordre, une étape par réponse :
   a. Installation de l'app sur ma boutique de développement et lecture des produits.
   b. Génération du PDF pour un format fixe (Dymo 30252) avec titre, prix et code-barres.
   c. Formats prêts (F2), taille libre (F1), case de départ (F3), réglages fins (F4).
   d. Éditeur visuel et champs (F5 à F9).
   e. Génération et protection des codes-barres (F10 à F12).
   f. Sélection, quantités et file d'impression (F13, F16).
   g. Bons de commande, transferts et CSV (F14).
   h. Extensions d'impression de l'administration et tuile de caisse (F15).
   i. Impression directe Zebra et Dymo (F17).
   j. Réception par scan (F18).
   k. Import GS1, modèles par collection, promotions, étiquettes de rayon et QR codes (F19 à F22).
   l. Formules d'abonnement (Gratuit, Pro, Magasin) avec l'API de facturation de Shopify.
3. À chaque étape : explique ce que tu as fait en termes simples, donne-moi les commandes à lancer, et la liste des tests à faire pour vérifier le critère de validation.
4. Écris des tests automatiques pour la génération des codes-barres (unicité, clé de validation, aucun code existant modifié).
5. Si une information te manque ou si une fonction Shopify ne permet pas ce qui est demandé, dis-le au lieu d'inventer.

Je débute en développement : explique chaque étape comme à quelqu'un qui n'a jamais publié d'app.
```

## Annexe B : Claude Code, de la version finale aux mises à jour régulières

Trois textes suffisent : un fichier de règles que Claude Code relit à chaque session, un prompt de démarrage, et un prompt à relancer toutes les deux semaines pour chaque mise à jour.

**Avant de commencer (à faire toi-même)**

- [ ] Créer un compte Partenaire Shopify (gratuit) et une boutique de développement.
- [ ] Installer Claude Code, Node.js et la CLI Shopify sur ton ordinateur.
- [ ] Créer un dossier vide pour le projet et y lancer Claude Code.
- [ ] Exporter ce cahier des charges en Markdown et l'enregistrer dans le projet sous `docs/SPEC.md`.
- [ ] Créer le fichier `CLAUDE.md` à la racine avec le texte ci-dessous.
- [ ] Créer un fichier vide `RETOURS.md` : tu y colleras les avis, les messages des marchands et tes propres remarques.

**1. Fichier ****`CLAUDE.md`** (règles permanentes, relues automatiquement)

```
# Projet : app Shopify d'étiquettes code-barres

## Contexte
- Source de vérité : docs/SPEC.md (fonctions F1 à F22, toutes dans la version finale).
- Je débute en développement : explique chaque étape simplement, donne les commandes exactes à lancer.
- Réponds en français.

## Stack
- Modèle d'app officiel généré par la CLI Shopify, interface Polaris, intégrée à l'administration.
- API GraphQL Admin version 2026-10 minimum (lecture des bons de commande).
- Scopes : read_products, write_products, read_inventory, write_inventory, read_locations, read_inventory_purchase_orders, read_inventory_transfers.
- Base de données : celle du modèle en développement, PostgreSQL en production.
- Impression : PDF à la taille exacte de l'étiquette par défaut ; impression directe sur ordinateur via Zebra Browser Print (ZPL) et DYMO Connect, repli sur le PDF (toujours le PDF sur iPad). Codes-barres : bibliothèque éprouvée (Code 128, EAN-13, UPC-A).
- Extensions : impression dans la fiche et la liste produits de l'administration, tuile dans l'app de caisse.
- Webhooks RGPD obligatoires pour une app publique (customers/data_request, customers/redact, shop/redact).

## Règles absolues
1. Codes-barres : ne jamais les dériver de l'identifiant de variante. Vérifier l'unicité dans tout le catalogue avant d'écrire. Ne jamais modifier un code existant sans confirmation explicite du marchand. Journaliser chaque changement. Ne jamais inventer de GTIN. Tests automatiques obligatoires sur cette partie.
2. Mises à jour : ne jamais changer le comportement existant pour les marchands déjà installés. Pas de changement de quantité par défaut, de police, de taille ou de mise en page d'un modèle existant. Toute nouveauté qui modifie un comportement est une option désactivée par défaut. Les migrations de données sont réversibles et testées sur une copie.
3. Non-régression : un test compare le PDF de chaque format prêt avant et après chaque modification. Un écart bloque la version.
4. Ne rien inventer : si une API Shopify ne permet pas une fonction, dis-le et propose une alternative.
5. Une tâche n'est terminée que si ses tests passent et que son critère de validation (docs/SPEC.md) est rempli.
6. Demande-moi avant : supprimer des fichiers ou des données, ajouter un scope (les marchands devront réapprouver l'app), ajouter une dépendance lourde, déployer en production.

## Organisation
- ROADMAP.md : toutes les fonctions en cases à cocher.
- CHANGELOG.md : une entrée par version (numérotation X.Y.Z).
- docs/aide/ : une fiche par imprimante avec les bons réglages.
- Git : une branche par fonction, commits clairs, un tag vX.Y.Z à chaque version publiée.

## Calendrier des versions
- v1.0.0 (version finale) : F1 à F22, formules Gratuit, Pro et Magasin via l'API de facturation de Shopify. Soumission à la revue Shopify.
- Ensuite, une version toutes les 2 semaines : corrections et améliorations issues de RETOURS.md.
- Entre deux versions : correctifs X.Y.Z pour les bugs bloquants, publiés dès qu'ils sont prêts.

## Procédure pour chaque version
1. Lire RETOURS.md, ROADMAP.md et CHANGELOG.md.
2. Classer les retours : bug bloquant, bug, demande de fonction. Proposer le contenu de la version (bugs bloquants d'abord, puis les demandes les plus fréquentes) et attendre mon accord.
3. Développer avec les tests, y compris la non-régression des PDF.
4. Mettre à jour CHANGELOG.md, l'écran « Nouveautés » de l'app et les fiches d'aide concernées.
5. Liste de contrôle avant déploiement : tests verts, migration testée sur une copie, déploiement des extensions, déploiement du serveur, tag Git.
6. Me donner : ce que je dois tester à la main sur la boutique de développement et sur mes imprimantes, et un court texte pour annoncer la version aux marchands.
```

**2. Prompt de démarrage** (une seule fois)

```
Lis CLAUDE.md et docs/SPEC.md en entier.

1. Avant d'écrire du code, propose l'architecture : dossiers, modèle de données (modèles d'étiquettes, réglages, historique, journal des codes-barres, GTIN importés, réceptions), écrans et extensions. Attends mon accord.
2. Crée ROADMAP.md à partir de docs/SPEC.md, et CHANGELOG.md vide.
3. Construis la v1.0.0 (version finale) dans cet ordre, une étape à la fois, en t'arrêtant après chacune pour me dire quoi tester :
   a. App installée sur ma boutique de développement, lecture des produits.
   b. PDF d'un format fixe (Dymo 30252) avec titre, prix et code-barres.
   c. Formats prêts, taille libre, case de départ, réglages fins (F1 à F4).
   d. Éditeur visuel et champs (F5 à F9).
   e. Génération et protection des codes-barres (F10 à F12), avec leurs tests.
   f. Sélection, quantités, file d'impression (F13, F16).
   g. Bons de commande, transferts, CSV (F14).
   h. Extensions d'impression de l'administration et tuile de caisse (F15).
   i. Impression directe Zebra et Dymo, avec repli sur le PDF (F17).
   j. Réception par scan (F18).
   k. Import GS1, modèles par collection, promotions, étiquettes de rayon et QR codes (F19 à F22).
   l. Formules d'abonnement et webhooks RGPD.
   m. Test de non-régression des PDF pour tous les formats prêts.
4. Quand la v1.0.0 est complète, prépare tout ce qu'il faut pour la revue Shopify : politique de confidentialité, texte et captures de la fiche de l'app, tarifs, instructions de test pour l'équipe de revue. Donne-moi la liste de ce que je dois faire moi-même.
```

**3. Prompt de mise à jour** (toutes les deux semaines, après avoir collé les nouveaux retours dans RETOURS.md)

```
Nouvelle version. Applique la procédure de CLAUDE.md.
J'ai ajouté les derniers avis et messages dans RETOURS.md.
Commence par le classement des retours et ta proposition de contenu pour la version, puis attends mon accord avant de coder.
Rappel : aucun comportement existant ne change sans option désactivée par défaut.
```

**En cas de bug urgent signalé par un marchand :**

```
Correctif urgent. Voici le problème signalé : [coller le message].
Reproduis le bug avec un test qui échoue, corrige-le, vérifie que tous les tests passent, puis prépare un correctif X.Y.Z selon la procédure de CLAUDE.md.
```
