export interface BalanceUpdatedEvent {
  eventId: string;
  version: string;
  occurredAt: string;
  payload: {
    accountId: string;
    updateType: 'INCREASE' | 'DECREASE';
    amountAffected: number;
    newBalance: number;
  };
}
