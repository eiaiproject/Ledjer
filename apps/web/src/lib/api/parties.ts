import { apiRequest } from "./client";

export interface Party {
  id: string;
  name: string;
  party_type: "customer" | "supplier" | "employee" | "owner" | "other";
  is_active: boolean;
}

interface PartiesResponse {
  parties: Party[];
}

export function listParties(): Promise<Party[]> {
  return apiRequest<PartiesResponse>("/api/parties").then((data) => data.parties);
}
