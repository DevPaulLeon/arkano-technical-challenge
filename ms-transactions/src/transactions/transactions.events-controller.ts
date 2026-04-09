import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { TransactionsService } from './transactions.service';

import { BalanceUpdatedEvent } from '@shared/events/balance-updated.event';
import { AccountCreatedEvent } from '@shared/events/account-created.event';
import { TransactionRequestedEvent } from '@shared/events/transaction-requested.event';

@Controller()
export class TransactionsEventsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @EventPattern('AccountCreated')
  handleAccountCreated(@Payload() event: AccountCreatedEvent) {
    return this.transactionsService.handleAccountCreated(event);
  }

  @EventPattern('BalanceUpdated')
  handleBalanceUpdated(@Payload() event: BalanceUpdatedEvent) {
    return this.transactionsService.handleBalanceUpdated(event);
  }

  @EventPattern('TransactionRequested')
  handleTransactionRequested(@Payload() event: TransactionRequestedEvent) {
    return this.transactionsService.handleTransactionRequested(event);
  }
}
