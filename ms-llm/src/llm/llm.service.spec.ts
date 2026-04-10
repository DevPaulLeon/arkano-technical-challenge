import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { TransactionType } from '@shared/types/transaction-type.enum';
import { RejectionReason } from '@shared/types/rejection-reason.enum';

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmService],
    }).compile();

    service = module.get<LlmService>(LlmService);

    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('explainCompletedTransaction', () => {
    it('should call Claude API with correct prompt for DEPOSIT', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          content: [{ text: 'Mocked explanation' }],
        }),
      });

      const event = {
        payload: {
          transactionId: 'tx1',
          type: TransactionType.DEPOSIT,
          amount: 100,
          sourceClientName: 'Juan',
          targetClientName: '',
        },
      };

      await service.explainCompletedTransaction(event as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('depósito de 100'),
        }),
      );
    });

    it('should call Claude API with correct prompt for TRANSFER', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          content: [{ text: 'Mocked transfer explanation' }],
        }),
      });

      const event = {
        payload: {
          transactionId: 'tx2',
          type: TransactionType.TRANSFER,
          amount: 50,
          sourceClientName: 'Juan',
          targetClientName: 'Maria',
        },
      };

      await service.explainCompletedTransaction(event as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringMatching(/Juan.*transferencia.*50.*Maria/),
        }),
      );
    });
  });

  describe('explainRejectedTransaction', () => {
    it('should call Claude API with correct prompt for INSUFFICIENT_FUNDS', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          content: [{ text: 'Mocked rejected explanation' }],
        }),
      });

      const event = {
        payload: {
          transactionId: 'tx3',
          rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
        },
      };

      await service.explainRejectedTransaction(event as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('saldo insuficiente'),
        }),
      );
    });
  });
});
