import { Injectable, Logger } from '@nestjs/common';

import { TransactionCompletedEvent } from '@shared/events/transaction-completed.event';
import { TransactionRejectedEvent } from '@shared/events/transaction-rejected.event';
import { TransactionType } from '@shared/types/transaction-type.enum';
import { RejectionReason } from '@shared/types/rejection-reason.enum';

interface ClaudeResponse {
  content: { type: string; text: string }[];
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  async explainCompletedTransaction(
    event: TransactionCompletedEvent,
  ): Promise<void> {
    const { type, amount, sourceClientName, targetClientName } = event.payload;

    const prompt = this.buildCompletedPrompt(
      type,
      amount,
      sourceClientName,
      targetClientName,
    );
    const explanation = await this.callClaude(prompt);

    this.logger.log(
      `[TransactionCompleted] ${event.payload.transactionId}: ${explanation}`,
    );
  }

  async explainRejectedTransaction(
    event: TransactionRejectedEvent,
  ): Promise<void> {
    const { transactionId, rejectionReason } = event.payload;

    const prompt = this.buildRejectedPrompt(rejectionReason);
    const explanation = await this.callClaude(prompt);

    this.logger.log(`[TransactionRejected] ${transactionId}: ${explanation}`);
  }

  private buildCompletedPrompt(
    type: TransactionType,
    amount: number,
    sourceUserName: string,
    targetUserName: string,
  ): string {
    const prompts = {
      [TransactionType.DEPOSIT]: `Explica en una sola oración simple y amigable para el usuario final que se realizó un depósito de ${amount} en su cuenta.`,
      [TransactionType.WITHDRAWAL]: `Explica en una sola oración simple y amigable para el usuario final que se realizó un retiro de ${amount} de su cuenta.`,
      [TransactionType.TRANSFER]: `Explica en una sola oración simple y amigable para el usuario final que ${sourceUserName} realizó una transferencia de ${amount} a ${targetUserName}.`,
    };

    return prompts[type];
  }

  private buildRejectedPrompt(rejectionReason: RejectionReason): string {
    const prompts = {
      [RejectionReason.INSUFFICIENT_FUNDS]:
        'Explica en una sola oración simple y amigable para el usuario final que su transacción fue rechazada por saldo insuficiente.',
      [RejectionReason.ACCOUNT_NOT_FOUND]:
        'Explica en una sola oración simple y amigable para el usuario final que su transacción fue rechazada porque la cuenta destino no fue encontrada.',
      [RejectionReason.DUPLICATE_TRANSACTION]:
        'Explica en una sola oración simple y amigable para el usuario final que su transacción fue rechazada porque ya fue procesada anteriormente.',
    };

    return prompts[rejectionReason];
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = (await response.json()) as ClaudeResponse;
    return data.content[0].text;
  }
}
