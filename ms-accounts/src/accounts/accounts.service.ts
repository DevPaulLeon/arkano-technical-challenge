import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { Account } from './accounts.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountCreatedEvent } from '@shared/events/account-created.event';
import { ClientsService } from 'src/clients/clients.service';
import { TransactionCompletedEvent } from '@shared/events/transaction-completed.event';
import { BalanceUpdatedEvent } from '@shared/events/balance-updated.event';
import { TransactionType } from '@shared/types/transaction-type.enum';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @Inject('NATS_SERVICE')
    private readonly natsClient: ClientProxy,
    @Inject(forwardRef(() => ClientsService))
    private readonly clientsService: ClientsService,
  ) {}

  async create(createAccountDto: CreateAccountDto): Promise<Account> {
    await this.clientsService.findOne(createAccountDto.clientId);

    const existing = await this.accountRepository.findOne({
      where: {
        clientId: createAccountDto.clientId,
        alias: createAccountDto.alias,
      },
    });

    if (existing) {
      throw new ConflictException('Account with this alias already exists');
    }

    const account = this.accountRepository.create({
      ...createAccountDto,
      balance: createAccountDto.initialBalance,
    });
    const saved = await this.accountRepository.save(account);

    this.natsClient.emit<any, AccountCreatedEvent>('AccountCreated', {
      eventId: crypto.randomUUID(),
      version: '1.0',
      occurredAt: new Date().toISOString(),
      payload: {
        accountId: saved.id,
        clientId: saved.clientId,
        initialBalance: saved.balance,
        type: saved.type,
        alias: saved.alias,
      },
    });

    return saved;
  }

  async findOne(id: string): Promise<Account> {
    const client = await this.accountRepository.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException('Account not found');
    }

    return client;
  }

  async findAccountsByClientId(clientId: string): Promise<Account[]> {
    return this.accountRepository.find({ where: { clientId } });
  }

  async handleTransactionCompleted(event: TransactionCompletedEvent) {
    const sourceAccount = await this.findOne(event.payload.sourceAccountId);

    if (event.payload.type === TransactionType.DEPOSIT) {
      sourceAccount.balance =
        Number(sourceAccount.balance) + event.payload.amount;
    } else if (
      event.payload.type === TransactionType.TRANSFER ||
      event.payload.type === TransactionType.WITHDRAWAL
    ) {
      sourceAccount.balance =
        Number(sourceAccount.balance) - event.payload.amount;
    }

    try {
      await this.accountRepository.save(sourceAccount);
    } catch (error) {
      this.logger.error(
        `Error al actualizar el saldo de la cuenta origen ${sourceAccount.id}`,
        error,
      );
      // TODO: Patron Saga
      // En producción implementar compensating transaction
      // Evento DebitFailed para revertir el saldo de sourceAccount
      throw error;
    }

    const updateType =
      event.payload.type === TransactionType.DEPOSIT ? 'INCREASE' : 'DECREASE';

    this.natsClient.emit<any, BalanceUpdatedEvent>('BalanceUpdated', {
      eventId: crypto.randomUUID(),
      version: '1.0',
      occurredAt: new Date().toISOString(),
      payload: {
        accountId: sourceAccount.id,
        updateType,
        amountAffected: event.payload.amount,
        newBalance: sourceAccount.balance,
      },
    });

    if (
      event.payload.targetAccountId &&
      event.payload.type === TransactionType.TRANSFER
    ) {
      const targetAccount = await this.findOne(event.payload.targetAccountId);

      targetAccount.balance =
        Number(targetAccount.balance) + event.payload.amount;

      try {
        await this.accountRepository.save(targetAccount);
      } catch (error) {
        this.logger.error(
          `Error al actualizar el saldo de la cuenta destino ${targetAccount.id}`,
          error,
        );
        // TODO: Patron Saga
        // En producción implementar compensating transaction
        // Evento CreditFailed para revertir el saldo de targetAccount
        throw error;
      }

      this.natsClient.emit<any, BalanceUpdatedEvent>('BalanceUpdated', {
        eventId: crypto.randomUUID(),
        version: '1.0',
        occurredAt: new Date().toISOString(),
        payload: {
          accountId: targetAccount.id,
          updateType: 'INCREASE',
          amountAffected: event.payload.amount,
          newBalance: targetAccount.balance,
        },
      });
    }
  }
}
