# Mettre l'app en ligne (Fly.io)

Ce guide met l'app en ligne sur Fly.io, puis la relie à Shopify. Comptez environ une heure la première fois.
Fly.io facture à l'usage : avec une machine de 1 Go toujours allumée et un petit volume, prévoyez quelques dollars par mois.
Vérifiez le tarif à jour sur https://fly.io/docs/about/pricing/.

Les commandes se lancent dans le dossier du projet, sur votre ordinateur.

## Ce qui est déjà prêt dans le projet

- `Dockerfile` : l'image de l'app. Avant chaque démarrage, elle applique les migrations de la base.
- `fly.toml` : la machine, le volume de données et le contrôle de santé.
- `/healthz` : une adresse qui répond « ok » quand le serveur et la base fonctionnent. Fly s'en sert pour vérifier l'app.

La base est un fichier SQLite rangé sur un volume Fly (`/data`), qui survit aux redémarrages et aux mises à jour.
Elle suffit pour démarrer. SQLite n'accepte qu'une seule machine : pour en faire tourner plusieurs, il faudra passer à PostgreSQL (voir la fin du guide).

## 1. Créer le compte et installer l'outil Fly

1. Créez un compte sur https://fly.io (il demande une carte bancaire).
2. Installez l'outil en ligne de commande :
   - Mac : `brew install flyctl`
   - Windows (PowerShell) : `iwr https://fly.io/install.ps1 -useb | iex`, puis rouvrez PowerShell
3. Connectez-vous : `fly auth login`. Si le terminal ne peut pas recevoir la validation du navigateur, la page affiche un code : `fly auth login --code <code>`.

## 2. Créer l'app sur Fly

```
fly launch --no-deploy --copy-config
```

L'outil propose un nom (par exemple `etiquettes-codes-barres`). S'il est déjà pris, choisissez-en un autre ; il remplace la ligne `app = …` de `fly.toml`.
Refusez s'il propose une base PostgreSQL ou Redis : l'app n'en a pas besoin pour l'instant.

L'adresse de l'app sera `https://<nom>.fly.dev`. Notez-la.

Autre façon de faire, sans questions : `fly apps create <nom> --org personal`, puis remplacez à la main la ligne `app = …` de `fly.toml`.

Créez ensuite le volume des données, dans la même région que la machine (Paris, `cdg`) :

```
fly volumes create donnees --region cdg --size 1
```

## 3. Relier l'app au compte Partenaire Shopify

1. Sur https://partners.shopify.com, créez un compte Partenaire si ce n'est pas fait.
2. Dans le dossier du projet : `shopify app config link`. Choisissez l'organisation qui contient votre boutique de test, puis « créer une nouvelle app ».
   **Attention :** la commande réécrit `shopify.app.toml` et efface les webhooks du projet (dont les webhooks RGPD obligatoires). Gardez seulement le nouveau `client_id`, puis remettez le reste du fichier : `git checkout -- shopify.app.toml` et recopiez le `client_id`.
3. Dans `shopify.app.toml`, remplacez `https://example.com` par votre adresse Fly aux deux endroits :
   ```
   application_url = "https://<nom>.fly.dev"
   redirect_urls = [ "https://<nom>.fly.dev/auth/callback" ]
   ```
4. Récupérez la clé secrète : Partner Dashboard → « Tableau de bord de développement » (dev.shopify.com) → votre app → Paramètres → « Secret ». Ne la collez jamais dans un message ni sur une capture d'écran ; si cela arrive, faites-la pivoter au même endroit.
5. Choisissez la **distribution publique** (Partner Dashboard → Distribution des applications). Sans elle, Shopify refuse les abonnements, même en mode test (« Apps without a public distribution cannot use the Billing API »). Ce choix est définitif.

## 4. Donner les secrets à Fly

Les secrets ne sont jamais écrits dans un fichier du projet :

```
fly secrets set SHOPIFY_API_KEY=<client_id> SHOPIFY_API_SECRET=<clé secrète> SHOPIFY_APP_URL=https://<nom>.fly.dev SUPPORT_EMAIL=<votre e-mail de support>
```

L'e-mail de support s'affiche sur la politique de confidentialité, publiée à `https://<nom>.fly.dev/confidentialite`. C'est cette adresse qu'il faut donner dans la fiche de l'App Store.

Les abonnements restent en mode test (non facturés) tant que `BILLING_TEST` ne vaut pas `false`. Gardez ce réglage jusqu'à l'accord de Shopify.
Le jour où vous facturez pour de vrai : `fly secrets set BILLING_TEST=false`

## 5. Déployer

```
fly deploy
shopify app deploy --allow-updates
```

Si `fly deploy` échoue avec « certificate signed by unknown authority » (antivirus ou réseau qui filtre les connexions sécurisées), utilisez l'autre constructeur de Fly : `fly deploy --depot=false`.

La première commande construit et lance le serveur. La seconde envoie à Shopify la configuration, les webhooks et les extensions (bouton Imprimer de l'admin, tuile de la caisse).

Vérifiez que tout répond : ouvrez `https://<nom>.fly.dev/healthz`, la page doit afficher `ok`.

## 6. Installer sur la boutique de test

Partner Dashboard → votre app → « Choisir des boutiques » (ou « Test your app ») → LABTEST.
Acceptez les accès demandés, puis testez à la main :

- impression d'un PDF depuis l'onglet Imprimer ;
- bouton Imprimer dans la fiche d'un produit ;
- réception par scan (+1 en stock) ;
- **impression depuis un bon de commande** : c'est la seule partie qui n'a pas pu être vérifiée sur une vraie boutique ;
- abonnement à une formule (en mode test).

En cas de problème : `fly logs` affiche ce qui se passe sur le serveur.

## Mettre à jour l'app

Après chaque version (tests verts, `npm run verify`) :

```
fly deploy
shopify app deploy
```

Les migrations de la base s'appliquent toutes seules au démarrage.

## Sauvegardes

Fly prend chaque jour un instantané du volume et le garde 5 jours (`fly volumes snapshots list donnees`).
Avant une migration de la base, prenez-en un à la main : `fly volumes snapshots create <id du volume>` (l'id s'affiche avec `fly volumes list`).

## Plus tard : passer à PostgreSQL

À faire quand une seule machine ne suffit plus :

1. Créez une base PostgreSQL (`fly postgres create`, ou un service géré) et attachez-la : `fly postgres attach <nom>` remplit `DATABASE_URL`.
2. Dans `prisma/schema.prisma`, passez `provider` à `"postgresql"`, et recréez les migrations pour PostgreSQL.
3. Copiez les données de SQLite vers PostgreSQL, essayez sur une copie, puis retirez la ligne `DATABASE_URL` et le bloc `[[mounts]]` de `fly.toml`.
