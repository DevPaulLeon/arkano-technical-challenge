import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';

import { LlmEventsController } from './llm.events-controller';
import { LlmService } from './llm.service';

@Module({
  imports: [
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
  controllers: [LlmEventsController],
  providers: [LlmService],
})
export class LlmModule {}
