// Fonction d'appel à l'API GraphQL Admin. En production, elle enveloppe
// `admin.graphql` ; dans les tests, une fausse boutique en mémoire.
export type Gql = <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export class ShopifyUserError extends Error {
  constructor(public readonly errors: { field?: string[] | null; message: string }[]) {
    super(errors.map((e) => e.message).join(" ; "));
  }
}

// Adaptateur pour l'objet `admin` fourni par authenticate.admin()
export function gqlFromAdmin(admin: {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}): Gql {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
    const response = await admin.graphql(query, { variables });
    const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join(" ; "));
    return body.data as T;
  };
}
