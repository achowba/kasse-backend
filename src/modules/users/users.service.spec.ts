import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CurrencyEnum } from '@common/enums';
import { UserDocument } from './schemas/user.schema';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/** Stand in for a stored account. */
const buildUser = (): UserDocument =>
  ({
    _id: new Types.ObjectId(),
    email: 'finance@acme.test',
    passwordHash: '$argon2id$stored',
    currency: CurrencyEnum.USD,
    fiscalYearStartMonth: 1,
  }) as UserDocument;

describe('UsersService', () => {
  let repository: jest.Mocked<Pick<UsersRepository, 'findById' | 'findByEmail' | 'existsByEmail' | 'create' | 'updateSettings'>>;
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(buildUser()),
      findByEmail: jest.fn().mockResolvedValue(null),
      existsByEmail: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue(buildUser()),
      updateSettings: jest.fn().mockResolvedValue(buildUser()),
    };

    service = new UsersService(repository as unknown as UsersRepository);
  });

  describe('getById', () => {
    it('returns the account', async () => {
      await expect(service.getById(new Types.ObjectId())).resolves.toBeDefined();
    });

    it('raises a not found rather than returning null, so a caller cannot forget to check', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findById', () => {
    it('returns null instead of throwing, for callers that answer something other than 404', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(new Types.ObjectId())).resolves.toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('passes the changes through', async () => {
      const userId = new Types.ObjectId();

      await service.updateSettings(userId, { currency: CurrencyEnum.AED, fiscalYearStartMonth: 4 });

      expect(repository.updateSettings).toHaveBeenCalledWith(userId, {
        currency: CurrencyEnum.AED,
        fiscalYearStartMonth: 4,
      });
    });

    it('raises a not found when the account is gone', async () => {
      repository.updateSettings.mockResolvedValue(null);

      await expect(service.updateSettings(new Types.ObjectId(), { fiscalYearStartMonth: 2 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('never sees a plaintext password: it stores the hash it is handed', async () => {
    await service.create('finance@acme.test', '$argon2id$handed-in');

    expect(repository.create).toHaveBeenCalledWith('finance@acme.test', '$argon2id$handed-in', undefined);
  });
});
