import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from './transactions.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TransactionType } from '@shared/types/transaction-type.enum';
import { TransactionStatus } from '@shared/types/transaction-status.enum';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let mockRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockNatsClient: {
    emit: jest.Mock;
  };
  let mockCacheManager: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockNatsClient = {
      emit: jest.fn(),
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockRepository,
        },
        {
          provide: 'NATS_SERVICE',
          useValue: mockNatsClient,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw ConflictException if transactionKey duplicated', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'exists' });
      await expect(
        service.create({ transactionKey: 'key1' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if TRANSFER without targetAccountId', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({
          type: TransactionType.TRANSFER,
          sourceAccountId: 'a1',
          transactionKey: 'k2',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if cache is null (cuenta no disponible)', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockCacheManager.get.mockResolvedValue(null);

      await expect(
        service.create({
          type: TransactionType.WITHDRAWAL,
          sourceAccountId: 'a1',
          transactionKey: 'k3',
          amount: 10,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create REJECTED transaction if insufficient funds', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockCacheManager.get.mockResolvedValue(5); // Balance less than amount

      const dto = {
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: 'a1',
        transactionKey: 'k4',
        amount: 10,
      };
      const savedTx = { id: 'tx1', ...dto, status: TransactionStatus.REJECTED };

      mockRepository.create.mockReturnValue(savedTx);
      mockRepository.save.mockResolvedValue(savedTx);

      const result = await service.create(dto as any);

      expect(result.status).toBe(TransactionStatus.REJECTED);
      expect(mockNatsClient.emit).toHaveBeenCalledWith(
        'TransactionRejected',
        expect.anything(),
      );
    });

    it('should create PENDING transaction and publish TransactionRequested if all valid', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockCacheManager.get.mockResolvedValue(100);

      const dto = {
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: 'a1',
        transactionKey: 'k5',
        amount: 10,
      };
      const savedTx = { id: 'tx2', ...dto, status: TransactionStatus.PENDING };

      mockRepository.create.mockReturnValue(savedTx);
      mockRepository.save.mockResolvedValue(savedTx);

      const result = await service.create(dto as any);

      expect(result.status).toBe(TransactionStatus.PENDING);
      expect(mockNatsClient.emit).toHaveBeenCalledWith(
        'TransactionRequested',
        expect.anything(),
      );
    });
  });

  describe('handleTransactionRequested', () => {
    it('should complete transaction and publish TransactionCompleted', async () => {
      const tx = { id: 'tx1', status: TransactionStatus.PENDING };
      mockRepository.findOne.mockResolvedValue(tx);
      mockCacheManager.get.mockImplementation((key: string) => {
        if (key.startsWith('balance:')) return 100;
        if (key.startsWith('owner:')) return 'Juan';
        return null;
      });

      await service.handleTransactionRequested({
        payload: {
          transactionId: 'tx1',
          type: TransactionType.WITHDRAWAL,
          amount: 10,
          sourceAccountId: 'a1',
        },
      } as any);

      expect(tx.status).toBe(TransactionStatus.COMPLETED);
      expect(mockRepository.save).toHaveBeenCalledWith(tx);
      expect(mockNatsClient.emit).toHaveBeenCalledWith(
        'TransactionCompleted',
        expect.anything(),
      );
    });

    it('should reject transaction and publish TransactionRejected if insufficient funds', async () => {
      const tx = { id: 'tx2', status: TransactionStatus.PENDING };
      mockRepository.findOne.mockResolvedValue(tx);
      mockCacheManager.get.mockResolvedValue(5); // lower than amount 10

      await service.handleTransactionRequested({
        payload: {
          transactionId: 'tx2',
          type: TransactionType.WITHDRAWAL,
          amount: 10,
          sourceAccountId: 'a1',
        },
      } as any);

      expect(tx.status).toBe(TransactionStatus.REJECTED);
      expect(mockRepository.save).toHaveBeenCalledWith(tx);
      expect(mockNatsClient.emit).toHaveBeenCalledWith(
        'TransactionRejected',
        expect.anything(),
      );
    });

    it('should ignore if transaction is no longer PENDING (idempotency)', async () => {
      const tx = { id: 'tx3', status: TransactionStatus.COMPLETED };
      mockRepository.findOne.mockResolvedValue(tx);

      await service.handleTransactionRequested({
        payload: {
          transactionId: 'tx3',
          type: TransactionType.WITHDRAWAL,
          amount: 10,
          sourceAccountId: 'a1',
        },
      } as any);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockNatsClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleAccountCreated', () => {
    it('should initialize cache of balance and owner', async () => {
      await service.handleAccountCreated({
        payload: {
          accountId: 'a1',
          initialBalance: 100,
          clientName: 'Juan Perez',
        },
      } as any);

      expect(mockCacheManager.set).toHaveBeenCalledWith('balance:a1', 100);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'owner:a1',
        'Juan Perez',
      );
    });
  });

  describe('handleBalanceUpdated', () => {
    it('should update balance cache', async () => {
      await service.handleBalanceUpdated({
        payload: { accountId: 'a1', newBalance: 150 },
      } as any);

      expect(mockCacheManager.set).toHaveBeenCalledWith('balance:a1', 150);
    });
  });
});
