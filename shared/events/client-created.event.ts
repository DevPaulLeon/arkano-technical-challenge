export class ClientCreatedEvent {
  eventId!: string;
  version!: string;
  occurredAt!: string;
  payload!: {
    clientId: string;
    name: string;
    lastname: string;
  };
}
