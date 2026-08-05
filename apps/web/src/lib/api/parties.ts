import { apiRequest } from "./client";

export interface PublicParty {
  id: string;
  name: string;
  party_type: "customer" | "supplier" | "employee" | "owner" | "other";
  is_active: boolean;
}

export interface ListPartiesResult {
  parties: PublicParty[];
  customers: PublicParty[];
  suppliers: PublicParty[];
}

/** Split a flat party list into customers and suppliers by party_type. */
export function splitParties(parties: PublicParty[]): { customers: PublicParty[]; suppliers: PublicParty[] } {
  return {
    customers: parties.filter((p) => p.party_type === "customer"),
    suppliers: parties.filter((p) => p.party_type === "supplier"),
  };
}

/**
 * The worker returns a flat `{ parties: PublicParty[] }` list. Split it into
 * customers/suppliers so consumers can use `parties?.customers ?? parties?.suppliers`
 * (the invoice and transaction forms) — previously those were always undefined
 * and existing parties never showed up in the selectors.
 */
export function listParties(): Promise<ListPartiesResult> {
  return apiRequest<{ parties: PublicParty[] }>("/api/parties").then((data) => {
    const parties = data.parties ?? [];
    return { parties, ...splitParties(parties) };
  });
}
