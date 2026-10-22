import { useLoaderData, type MetaFunction } from "react-router";

// Politique de confidentialité publique, exigée par l'App Store de Shopify.
// Adresse à indiquer dans la fiche : https://<adresse de l'app>/confidentialite
export const loader = () => ({ email: process.env.SUPPORT_EMAIL ?? "" });

export const meta: MetaFunction = () => [{ title: "Politique de confidentialité · Privacy policy" }];

const UPDATED = "21 octobre 2026";
const UPDATED_EN = "October 21, 2026";

export default function Confidentialite() {
  const { email } = useLoaderData<typeof loader>();
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : "l'onglet Aide de l'app";
  const contactEn = email ? <a href={`mailto:${email}`}>{email}</a> : "the Help tab of the app";
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", font: "16px/1.6 system-ui, sans-serif", color: "#1a1a1a" }}>
      <h1>Politique de confidentialité</h1>
      <p>Mise à jour le {UPDATED}.</p>
      <p>
        Cette app imprime des étiquettes code-barres pour les boutiques Shopify. Elle est installée par le marchand
        depuis l'App Store de Shopify et n'a accès qu'aux données que le marchand autorise lors de l'installation.
      </p>
      <h2>Données lues dans la boutique</h2>
      <p>
        Produits, variantes, prix, codes-barres, stock, emplacements, bons de commande et transferts de stock. Ces
        données servent uniquement à composer les étiquettes, à créer les codes-barres manquants et à ajouter le stock
        reçu. L'app n'a accès ni aux clients, ni aux commandes, ni aux paiements.
      </p>
      <h2>Données enregistrées par l'app</h2>
      <ul>
        <li>l'adresse de la boutique et le jeton d'accès fourni par Shopify ;</li>
        <li>les réglages et les modèles d'étiquettes créés par le marchand ;</li>
        <li>l'historique d'impression (identifiants de variantes et quantités) ;</li>
        <li>le journal des codes-barres modifiés (ancienne et nouvelle valeur), pour pouvoir revenir en arrière ;</li>
        <li>le dernier prix imprimé de chaque variante, pour signaler les étiquettes à refaire.</li>
      </ul>
      <p>Aucune donnée personnelle de client ou de membre du personnel n'est enregistrée.</p>
      <h2>Hébergement et partage</h2>
      <p>
        Les données sont hébergées chez Fly.io, dans la région de Paris. Elles ne sont ni vendues, ni partagées, ni
        utilisées à des fins publicitaires. L'app ne dépose aucun cookie de suivi.
      </p>
      <h2>Conservation et suppression</h2>
      <p>
        Le jeton d'accès est supprimé dès la désinstallation de l'app. Toutes les autres données de la boutique sont
        effacées quand Shopify en fait la demande, 48 heures après la désinstallation. Le marchand peut aussi demander
        leur suppression à tout moment.
      </p>
      <h2>Contact</h2>
      <p>Pour toute question ou demande : {contact}.</p>

      <hr style={{ margin: "40px 0" }} />

      <h1 lang="en">Privacy policy</h1>
      <div lang="en">
        <p>Last updated {UPDATED_EN}.</p>
        <p>
          This app prints barcode labels for Shopify stores. Merchants install it from the Shopify App Store, and it
          can only access the data the merchant approves at installation.
        </p>
        <h2>Store data the app reads</h2>
        <p>
          Products, variants, prices, barcodes, inventory, locations, purchase orders and inventory transfers. This data
          is only used to build labels, create missing barcodes and add received stock. The app has no access to
          customers, orders or payments.
        </p>
        <h2>Data the app stores</h2>
        <ul>
          <li>the store's address and the access token provided by Shopify;</li>
          <li>the settings and label templates created by the merchant;</li>
          <li>print history (variant IDs and quantities);</li>
          <li>a log of changed barcodes (old and new value), so changes can be undone;</li>
          <li>the last printed price of each variant, to flag labels that need reprinting.</li>
        </ul>
        <p>No personal data about customers or staff members is stored.</p>
        <h2>Hosting and sharing</h2>
        <p>
          Data is hosted by Fly.io in the Paris region. It is never sold, shared or used for advertising. The app sets
          no tracking cookies.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          The access token is deleted as soon as the app is uninstalled. All other store data is erased when Shopify
          requests it, 48 hours after uninstallation. Merchants can also ask for deletion at any time.
        </p>
        <h2>Contact</h2>
        <p>For any question or request: {contactEn}.</p>
      </div>
    </main>
  );
}
