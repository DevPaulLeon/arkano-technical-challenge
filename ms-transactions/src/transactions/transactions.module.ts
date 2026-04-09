import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';

import { Transaction } from './transactions.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsEventsController } from './transactions.events-controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    ClientsModule.register([
      {
        name: 'NATS_SERVICE',
        transport: Transport.NATS,
        options: {
          servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
        },
      },
    ]),
    ConfigModule,
  ],
  controllers: [TransactionsController, TransactionsEventsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
