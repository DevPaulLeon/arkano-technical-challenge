import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Client } from './clients.entity';
import { AccountsService } from '../accounts/accounts.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;
  let mockRepository: any;
  let mockNatsClient: any;
  let mockAccountsService: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockNatsClient = {
      emit: jest.fn(),
    };

    mockAccountsService = {
      findAccountsByClientId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: getRepositoryToken(Client),
          useValue: mockRepository,
        },
        {
          provide: 'NATS_SERVICE',
          useValue: mockNatsClient,
        },
        {
          provide: AccountsService,
          useValue: mockAccountsService,
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a client successfully and emit ClientCreated', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const dto = {
        idNumber: '123',
        name: 'John',
        lastname: 'Doe',
        email: 'john@example.com',
      };
      const savedClient = { id: 'uuid', ...dto };

      mockRepository.create.mockReturnValue(savedClient);
      mockRepository.save.mockResolvedValue(savedClient);

      const result = await service.create(dto as any);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { idNumber: '123' },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(savedClient);
      expect(mockNatsClient.emit).toHaveBeenCalledWith(
        'ClientCreated',
        expect.objectContaining({
          payload: expect.objectContaining({
            clientId: 'uuid',
            name: 'John',
            lastname: 'Doe',
          }),
        }),
      );
      expect(result).toEqual(savedClient);
    });

    it('should throw ConflictException if idNumber is duplicated', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'existing' });
      const dto = {
        idNumber: '123',
        name: 'John',
        lastname: 'Doe',
        email: 'john@example.com',
      };

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockNatsClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return client if found', async () => {
      const client = { id: 'uuid', name: 'John' };
      mockRepository.findOne.mockResolvedValue(client);

      const result = await service.findOne('uuid');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid' },
      });
      expect(result).toEqual(client);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
