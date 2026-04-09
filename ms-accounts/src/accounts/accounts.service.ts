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
}
