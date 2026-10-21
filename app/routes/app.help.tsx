// Fiches d'aide par imprimante : les bons réglages de la fenêtre d'impression
const SHEETS = [
  {
    printer: "Dymo LabelWriter 450 / 550",
    steps: [
      "Dans la fenêtre d'impression, choisissez la LabelWriter.",
      "Taille du papier : celle de vos étiquettes (par exemple 30336).",
      "Échelle : 100 % (pas « Ajuster à la page »). Marges : aucune.",
      "La 550 ne prend que les étiquettes Dymo d'origine (puce RFID).",
      "Pour imprimer sans fenêtre, installez DYMO Connect, puis choisissez « Impression directe Dymo » dans Réglages.",
    ],
  },
  {
    printer: "Zebra de bureau (ZD220, ZD421…)",
    steps: [
      "Installez le pilote ZDesigner et réglez la taille d'étiquette dans ses préférences.",
      "Échelle : 100 %. Marges : aucune.",
      "Pour imprimer sans fenêtre, installez Zebra Browser Print et choisissez « Impression directe Zebra » dans Réglages.",
      "Browser Print : choisissez votre Zebra comme imprimante par défaut, et acceptez son certificat une fois en ouvrant https://127.0.0.1:9101/ssl_support dans le navigateur.",
      "Si la Zebra ne répond pas, l'app imprime automatiquement en PDF.",
    ],
  },
  {
    printer: "Brother QL-800 / QL-810W / QL-820",
    steps: [
      "Format du papier : 29 × 90 mm (DK-1201) ou 62 mm (DK-2205).",
      "Échelle : 100 %. Désactivez « Ajuster à la taille du papier ».",
      "Sur rouleau continu (DK-2205), réglez la longueur sur 29 mm.",
    ],
  },
  {
    printer: "Rollo",
    steps: ["Choisissez la taille de vos étiquettes dans les préférences du pilote.", "Échelle : 100 %. Marges : aucune."],
  },
  {
    printer: "Laser ou jet d'encre (planches Avery 5160, 5167)",
    steps: [
      "Papier : Lettre US. Échelle : 100 % (« Taille réelle »).",
      "Sur une planche entamée, choisissez la ligne et la colonne de départ dans l'écran Impression.",
      "Faites un essai sur papier normal et superposez-le à la planche avant d'imprimer.",
    ],
  },
  {
    printer: "Importer un fichier CSV",
    steps: [
      "Une colonne de code (« Code-barres », « SKU », « ID variante » ou « Code ») et une colonne « Quantité ».",
      "Séparateur « ; » ou « , » : les deux marchent, tout comme un export Excel.",
      "Dans Excel, mettez la colonne des codes-barres au format Texte : sinon ils deviennent 2,00E+12 et sont perdus.",
      "Une quantité vide compte pour 1. Les lignes fautives sont listées, les autres sont ajoutées.",
    ],
  },
  {
    printer: "iPad en caisse (AirPrint)",
    steps: [
      "Une imprimante compatible AirPrint est nécessaire.",
      "L'impression directe Zebra et Dymo n'existe pas sur iPad : la caisse passe toujours par le PDF.",
    ],
  },
];

export default function Help() {
  return (
    <s-page heading="Aide">
      <s-section>
        <s-paragraph>
          Si l'étiquette sort décalée, corrigez-la dans Réglages, section Réglages fins (par pas de 0,5 mm).
        </s-paragraph>
      </s-section>
      {SHEETS.map((sheet) => (
        <s-section key={sheet.printer} heading={sheet.printer}>
          <s-ordered-list>
            {sheet.steps.map((step) => (
              <s-list-item key={step}>{step}</s-list-item>
            ))}
          </s-ordered-list>
        </s-section>
      ))}
    </s-page>
  );
}
