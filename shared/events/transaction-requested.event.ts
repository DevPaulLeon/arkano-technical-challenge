import { TransactionType } from '../types/transaction-type.enum';

export interface TransactionRequestedEvent {
  eventId: string;
  version: string;
  occurredAt: string;
  payload: {
    transactionId: string;
    type: TransactionType;
    sourceAccountId: string;
    targetAccountId: string;
    amount: number;
  };
}
