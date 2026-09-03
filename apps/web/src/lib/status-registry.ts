/** Matches Badge component's variant prop */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusDef {
  label: string;
  variant: StatusTone;
  accessibleDescription: string;
}

type DomainRegistry = Record<string, StatusDef>;
type Registry = Record<string, DomainRegistry>;

export const STATUS_REGISTRY: Registry = {
  transactions: {
    posted: {
      label: "Posted",
      variant: "success",
      accessibleDescription: "Transaksi telah diposting dan diverifikasi",
    },
    voided: {
      label: "Dibatalkan",
      variant: "error",
      accessibleDescription: "Transaksi telah dibatalkan",
    },
  },
} as const;

export function getStatus(domain: string, rawStatus: string): StatusDef {
  const fallback: StatusDef = {
    label: rawStatus,
    variant: "neutral",
    accessibleDescription: `Status: ${rawStatus}`,
  };
  return STATUS_REGISTRY[domain]?.[rawStatus] ?? fallback;
}