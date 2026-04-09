import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AccountsService } from './accounts.service';
import { TransactionCompletedEvent } from '@shared/events/transaction-completed.event';

@Controller()
export class AccountsEventsController {
  constructor(private readonly accountsService: AccountsService) {}

  @EventPattern('TransactionCompleted')
  handleTransactionCompleted(@Payload() event: TransactionCompletedEvent) {
    return this.accountsService.handleTransactionCompleted(event);
  }
}
