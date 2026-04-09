import { RejectionReason } from '../types/rejection-reason.enum';

export class TransactionRejectedEvent {
  eventId!: string;
  version!: string;
  occurredAt!: string;
  payload!: {
    transactionId: string;
    rejectionReason: RejectionReason;
  };
}
