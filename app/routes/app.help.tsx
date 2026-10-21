// Fiches d'aide par imprimante : les bons réglages de la fenêtre d'impression
const SHEETS = [
  {
    printer: "Dymo LabelWriter 450 / 550",
    steps: [
      "Dans la fenêtre d'impression, choisissez la LabelWriter.",
      "Taille du papier : celle de vos étiquettes (par exemple 30336).",
      "Échelle : 100 % (pas « Ajuster à la page »). Marges : aucune.",
      "La 550 ne prend que les étiquettes Dymo d'origine (puce RFID).",
    ],
  },
  {
    printer: "Zebra de bureau (ZD220, ZD421…)",
    steps: [
      "Installez le pilote ZDesigner et réglez la taille d'étiquette dans ses préférences.",
      "Échelle : 100 %. Marges : aucune.",
      "Pour imprimer sans fenêtre, installez Zebra Browser Print et choisissez « Impression directe Zebra » dans Réglages.",
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
