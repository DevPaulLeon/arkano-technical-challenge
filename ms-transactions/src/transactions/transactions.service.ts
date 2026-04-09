// transactions.service.ts
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';
import type { Cache } from 'cache-manager';

import { Transaction } from './transactions.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionStatus } from '@shared/types/transaction-status.enum';
import { TransactionType } from '@shared/types/transaction-type.enum';
import { TransactionRequestedEvent } from '@shared/events/transaction-requested.event';
import { RejectionReason } from '@shared/types/rejection-reason.enum';
import { BalanceUpdatedEvent } from '@shared/events/balance-updated.event';
import { AccountCreatedEvent } from '@shared/events/account-created.event';
import { TransactionCompletedEvent } from '@shared/events/transaction-completed.event';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly balanceCache = new Map<string, number | null>();

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject('NATS_SERVICE')
    private readonly natsClient: ClientProxy,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Idempotency check
    const existing = await this.transactionRepository.findOne({
      where: { transactionKey: createTransactionDto.transactionKey },
    });

    if (existing) {
      throw new ConflictException('Transaction with this key already exists');
    }

    // Validate transfer has targetAccountId
    if (
      createTransactionDto.type === TransactionType.TRANSFER &&
      !createTransactionDto.targetAccountId
    ) {
      throw new BadRequestException('Transfer requires a targetAccountId');
    }

    // Cache validation
    const cachedBalance = await this.cacheManager.get<number | null>(
      `balance:${createTransactionDto.sourceAccountId}`,
    );

    if (cachedBalance === undefined) {
      throw new NotFoundException('Account not available, please retry later');
    }

    if (cachedBalance === null) {
      throw new NotFoundException('Account not available, please retry later');
    }

    if (
      createTransactionDto.type !== TransactionType.DEPOSIT &&
      cachedBalance < createTransactionDto.amount
    ) {
      const transaction = this.transactionRepository.create({
        ...createTransactionDto,
        status: TransactionStatus.REJECTED,
      });
      const saved = await this.transactionRepository.save(transaction);

      this.natsClient.emit('TransactionRejected', {
        eventId: crypto.randomUUID(),
        version: '1.0',
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId: saved.id,
          rejectionReason: 'INSUFFICIENT_FUNDS',
        },
      });

      return saved;
    }

    // Create transaction as PENDING
    const transaction = this.transactionRepository.create({
      ...createTransactionDto,
      status: TransactionStatus.PENDING,
    });
    const saved = await this.transactionRepository.save(transaction);

    // Publish TransactionRequested event
    this.natsClient.emit<any, TransactionRequestedEvent>(
      'TransactionRequested',
      {
        eventId: crypto.randomUUID(),
        version: '1.0',
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId: saved.id,
          type: saved.type,
          sourceAccountId: saved.sourceAccountId,
          targetAccountId: saved.targetAccountId,
          amount: saved.amount,
        },
      },
    );

    return saved;
  }

  async findOne(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async handleAccountCreated(event: AccountCreatedEvent): Promise<void> {
    this.logger.log(
      `Initializing cache for account ${event.payload.accountId}`,
    );
    await this.cacheManager.set(
      `balance:${event.payload.accountId}`,
      event.payload.initialBalance,
    );

    await this.cacheManager.set(
      `owner:${event.payload.accountId}`,
      event.payload.clientName,
    );
  }

  async handleBalanceUpdated(event: BalanceUpdatedEvent): Promise<void> {
    this.logger.log(`Updating cache for account ${event.payload.accountId}`);
    await this.cacheManager.set(
      `balance:${event.payload.accountId}`,
      event.payload.newBalance,
    );
  }

  async handleTransactionRequested(
    event: TransactionRequestedEvent,
  ): Promise<void> {
    const { transactionId, type, sourceAccountId, targetAccountId, amount } =
      event.payload;

    // Idempotency check
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      this.logger.error(`Transaction ${transactionId} not found`);
      return;
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      this.logger.warn(
        `Transaction ${transactionId} already processed, skipping`,
      );
      return;
    }

    // Validate cache
    const cachedBalance = await this.cacheManager.get<number | null>(
      `balance:${sourceAccountId}`,
    );

    if (cachedBalance === undefined || cachedBalance === null) {
      this.logger.warn(`Account ${sourceAccountId} not available in cache`);
      return;
    }

    // Validate sufficient funds
    const insufficientFunds =
      type !== TransactionType.DEPOSIT &&
      Number(cachedBalance) < Number(amount);

    if (insufficientFunds) {
      transaction.status = TransactionStatus.REJECTED;
      await this.transactionRepository.save(transaction);

      this.natsClient.emit('TransactionRejected', {
        eventId: crypto.randomUUID(),
        version: '1.0',
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId,
          rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
        },
      });

      this.logger.log(
        `Transaction ${transactionId} rejected: insufficient funds`,
      );
      return;
    }

    // Complete transaction
    transaction.status = TransactionStatus.COMPLETED;
    await this.transactionRepository.save(transaction);

    const sourceOwner =
      (await this.cacheManager.get<string>(`owner:${sourceAccountId}`)) ?? '';

    const targetOwner = targetAccountId
      ? ((await this.cacheManager.get<string>(`owner:${targetAccountId}`)) ??
        '')
      : '';

    this.natsClient.emit<any, TransactionCompletedEvent>(
      'TransactionCompleted',
      {
        eventId: crypto.randomUUID(),
        version: '1.0',
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId,
          type,
          amount,
          sourceAccountId,
          sourceClientName: sourceOwner,
          targetAccountId: targetAccountId ?? null,
          targetClientName: targetOwner,
        },
      },
    );

    this.logger.log(`Transaction ${transactionId} completed successfully`);
  }
}
