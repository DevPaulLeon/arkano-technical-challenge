import { forwardRef, Module } from '@nestjs/common';
import {
  ClientsModule as NatsClientsModule,
  Transport,
} from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './accounts.entity';

import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsEventsController } from './accounts.events-controller';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [
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
    forwardRef(() => ClientsModule),
  ],
  controllers: [AccountsController, AccountsEventsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
