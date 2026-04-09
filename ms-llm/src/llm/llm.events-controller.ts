// events-controller.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { LlmService } from './llm.service';
import { TransactionCompletedEvent } from '@shared/events/transaction-completed.event';
import { TransactionRejectedEvent } from '@shared/events/transaction-rejected.event';

@Controller()
export class LlmEventsController {
  constructor(private readonly llmService: LlmService) {}

  @EventPattern('TransactionCompleted')
  handleTransactionCompleted(@Payload() event: TransactionCompletedEvent) {
    return this.llmService.explainCompletedTransaction(event);
  }

  @EventPattern('TransactionRejected')
  handleTransactionRejected(@Payload() event: TransactionRejectedEvent) {
    return this.llmService.explainRejectedTransaction(event);
  }
}
