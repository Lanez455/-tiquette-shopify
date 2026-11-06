// Demande d'avis sur l'App Store (1.1.0) : après la 3e impression réussie, puis
// à la 20e et à la 50e. Shopify n'affiche sa fenêtre que si le marchand n'a pas
// déjà noté l'app et qu'aucune demande récente n'a eu lieu.
export const REVIEW_MILESTONES = [3, 20, 50];

// Vrai si l'impression qui fait passer de `before` à `after` atteint un palier
export const shouldAskReview = (before: number, after: number) => REVIEW_MILESTONES.some((m) => before < m && m <= after);

interface ReviewsApi {
  request(): Promise<{ success: boolean; code?: string }>;
}

// Jamais bloquant : sans App Bridge ou en cas de refus, l'impression continue
export async function askReview(api: ReviewsApi | undefined) {
  try {
    return (await api?.request()) ?? null;
  } catch {
    return null;
  }
}
