/**
 * Repositories barrel export.
 */

export {
  getAllAccounts,
  getActiveAccounts,
  getAccountsBySubtype,
  getAccountById,
  createAccountLocal,
  patchAccountLocal,
} from "./accounts.repo";

export {
  getAllProducts,
  getProductById,
  createProductLocal,
  patchProductLocal,
} from "./products.repo";

export {
  getAllParties,
  getPartyById,
  createPartyLocal,
} from "./parties.repo";

export type { Party } from "./parties.repo";

export {
  getTransactions,
  getTransactionById,
  getStockMovementsForTransactions,
  postTransactionLocal,
  voidTransactionLocal,
} from "./transactions.repo";
export type { CreateTransactionInput } from "./transactions.repo";

export {
  appendOutbox,
  getPendingOutbox,
  markOutboxSynced,
  cleanupSyncedOutbox,
  countPendingOutbox,
} from "./outbox.repo";
export type { OutboxEntry, OutboxOpType } from "./outbox.repo";
