import { RejectionReason } from '../types/rejection-reason.enum';

export interface TransactionRejectedEvent {
  eventId: string;
  version: string;
  occurredAt: string;
  payload: {
    transactionId: string;
    rejectionReason: RejectionReason;
  };
}
