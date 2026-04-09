import { AccountType } from '../types/account-type.enum';

export interface AccountCreatedEvent {
  eventId: string;
  version: string;
  occurredAt: string;
  payload: {
    accountId: string;
    clientId: string;
    initialBalance: number;
    type: AccountType;
    alias: string;
  };
}
