import { TransactionType } from '../types/transaction-type.enum';

export interface TransactionCompletedEvent {
  eventId: string;
  version: string;
  occurredAt: string;
  payload: {
    transactionId: string;
    type: TransactionType;
    amount: number;
    sourceAccountId: string;
    sourceUserName: string;
    targetAccountId: string;
    targetUserName: string;
  };
}
