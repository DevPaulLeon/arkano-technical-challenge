import { Module } from '@nestjs/common';
import {
  ClientsModule as NatsClientsModule,
  Transport,
} from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './accounts.entity';

import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [
    ClientsModule,
    TypeOrmModule.forFeature([Account]),
    NatsClientsModule.register([
      {
        name: 'NATS_SERVICE',
        transport: Transport.NATS,
        options: {
          servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
        },
      },
    ]),
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
