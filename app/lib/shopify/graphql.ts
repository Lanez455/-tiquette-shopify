// Fonction d'appel à l'API GraphQL Admin. En production, elle enveloppe
// `admin.graphql` ; dans les tests, une fausse boutique en mémoire.
export type Gql = <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export class ShopifyUserError extends Error {
  constructor(public readonly errors: { field?: string[] | null; message: string }[]) {
    super(errors.map((e) => e.message).join(" ; "));
  }
}

interface CostExtension {
  cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable?: number; restoreRate?: number } };
}

// Shopify signale le dépassement de débit dans une réponse 200 (code THROTTLED) :
// la bibliothèque le lève en GraphqlQueryError sans réessayer. On attend que le
// seau se remplisse assez pour la requête, puis on réessaie.
export function throttleDelayMs(error: unknown): number | null {
  const body = (error as { body?: { errors?: { graphQLErrors?: { extensions?: { code?: string } }[] }; extensions?: CostExtension } })?.body;
  const throttled = body?.errors?.graphQLErrors?.some((e) => e.extensions?.code === "THROTTLED");
  if (!throttled) return null;
  const cost = body?.extensions?.cost;
  const missing = (cost?.requestedQueryCost ?? 100) - (cost?.throttleStatus?.currentlyAvailable ?? 0);
  const rate = cost?.throttleStatus?.restoreRate || 100;
  return Math.min(10_000, Math.max(500, Math.ceil((missing / rate) * 1000)));
}

const MAX_ATTEMPTS = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Adaptateur pour l'objet `admin` fourni par authenticate.admin()
export function gqlFromAdmin(
  admin: {
    graphql: (query: string, options?: { variables?: Record<string, unknown>; tries?: number }) => Promise<Response>;
  },
  sleep: (ms: number) => Promise<unknown> = wait,
): Gql {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        // tries : la bibliothèque réessaie elle-même les 429 et 503
        response = await admin.graphql(query, { variables, tries: 3 });
      } catch (error) {
        const delay = throttleDelayMs(error);
        if (delay === null || attempt >= MAX_ATTEMPTS) throw error;
        await sleep(delay);
        continue;
      }
      const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join(" ; "));
      return body.data as T;
    }
  };
}
