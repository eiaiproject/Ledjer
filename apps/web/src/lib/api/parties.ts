import { apiRequest } from "./client";

export interface PublicParty {
  id: string;
  name: string;
  party_type: "customer" | "supplier" | "employee" | "owner" | "other";
  is_active: boolean;
}

interface ListPartiesResult {
  parties: PublicParty[];
  customers: PublicParty[];
  suppliers: PublicParty[];
}

export function listParties(): Promise<ListPartiesResult> {
  return apiRequest<ListPartiesResult>("/api/parties");
}
