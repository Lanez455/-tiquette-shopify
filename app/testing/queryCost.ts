import { Kind, parse, type FieldNode, type SelectionSetNode, type ValueNode } from "graphql";

// Estimation du coût d'une requête selon les règles de l'API Admin :
// objet = 1, scalaire = 0, connexion = 2 + first × coût d'un élément,
// liste d'identifiants (nodes) = nombre d'ids × coût d'un élément,
// mutation = 10. Shopify refuse toute requête au-delà de 1 000 points.
// La fausse boutique s'en sert pour refuser ce que Shopify refuserait.

export const MAX_QUERY_COST = 1000;

function valueOf(node: ValueNode | undefined, variables: Record<string, unknown>): unknown {
  if (!node) return undefined;
  if (node.kind === Kind.VARIABLE) return variables[node.name.value];
  if (node.kind === Kind.INT) return Number(node.value);
  if (node.kind === Kind.LIST) return node.values.map((v) => valueOf(v, variables));
  return undefined;
}

function selectionCost(set: SelectionSetNode | undefined, variables: Record<string, unknown>): number {
  if (!set) return 0;
  let common = 0;
  let fragments = 0;
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) common += fieldCost(sel, variables);
    // Interfaces et unions : coût du fragment le plus cher
    else if (sel.kind === Kind.INLINE_FRAGMENT) fragments = Math.max(fragments, selectionCost(sel.selectionSet, variables));
  }
  return common + fragments;
}

function fieldCost(field: FieldNode, variables: Record<string, unknown>): number {
  if (!field.selectionSet) return 0;
  const arg = (name: string) => valueOf(field.arguments?.find((a) => a.name.value === name)?.value, variables);
  const size = (arg("first") ?? arg("last")) as number | undefined;
  if (typeof size === "number") {
    let cost = 2;
    for (const sel of field.selectionSet.selections) {
      if (sel.kind !== Kind.FIELD) continue;
      const each = fieldCost(sel, variables);
      cost += sel.name.value === "nodes" || sel.name.value === "edges" ? size * each : each;
    }
    return cost;
  }
  const ids = arg("ids");
  if (Array.isArray(ids)) return ids.length * (1 + selectionCost(field.selectionSet, variables));
  return 1 + selectionCost(field.selectionSet, variables);
}

export function estimateQueryCost(query: string, variables: Record<string, unknown> = {}): number {
  const doc = parse(query);
  let total = 0;
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;
    total += (def.operation === "mutation" ? 10 : 0) + selectionCost(def.selectionSet, variables);
  }
  return total;
}
