import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Client } from './clients.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { ClientCreatedEvent } from '@shared/events/client-created.event';
import { AccountsService } from 'src/accounts/accounts.service';
import { Account } from 'src/accounts/accounts.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @Inject('NATS_SERVICE')
    private readonly natsClient: ClientProxy,
    @Inject(forwardRef(() => AccountsService))
    private readonly accountsService: AccountsService,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const existing = await this.clientRepository.findOne({
      where: { idNumber: createClientDto.idNumber },
    });

    if (existing) {
      throw new ConflictException('Client with this ID number already exists');
    }

    const client = this.clientRepository.create(createClientDto);
    const saved = await this.clientRepository.save(client);

    this.natsClient.emit<any, ClientCreatedEvent>('ClientCreated', {
      eventId: crypto.randomUUID(),
      version: '1.0',
      occurredAt: new Date().toISOString(),
      payload: {
        clientId: saved.id,
        name: saved.name,
        lastname: saved.lastname,
      },
    });

    return saved;
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async findAccounts(id: string): Promise<Account[]> {
    return this.accountsService.findAccountsByClientId(id);
  }
}
