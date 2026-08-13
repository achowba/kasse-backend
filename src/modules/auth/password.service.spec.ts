import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const password = 'correct horse battery staple';

  it('produces an Argon2id hash', async () => {
    const stored = await service.hash(password);

    // The algorithm is not set explicitly, because the library's Algorithm enum
    // is an ambient const enum that isolatedModules cannot read. This assertion
    // is what stops that being a silent downgrade: if the library's default ever
    // moves to Argon2i or Argon2d, this fails rather than weakening every
    // password in production.
    expect(stored.startsWith('$argon2id$')).toBe(true);
  });

  it('encodes its cost parameters into the hash, so they can be raised later', async () => {
    const stored = await service.hash(password);

    expect(stored).toContain('m=19456');
    expect(stored).toContain('t=2');
    expect(stored).toContain('p=1');
  });

  it('accepts the password it hashed', async () => {
    const stored = await service.hash(password);

    await expect(service.verify(stored, password)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await service.hash(password);

    await expect(service.verify(stored, 'not the password at all')).resolves.toBe(false);
  });

  it('rejects a password that differs only in case', async () => {
    const stored = await service.hash(password);

    await expect(service.verify(stored, password.toUpperCase())).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const first = await service.hash(password);
    const second = await service.hash(password);

    expect(first).not.toBe(second);
    await expect(service.verify(first, password)).resolves.toBe(true);
    await expect(service.verify(second, password)).resolves.toBe(true);
  });

  it('answers false for a malformed stored hash rather than throwing', async () => {
    // A corrupt or truncated hash is a failed credential check, not a server
    // error. Throwing here would turn one bad record into a 500 and tell the
    // caller something is wrong with the account.
    await expect(service.verify('not-a-hash', password)).resolves.toBe(false);
    await expect(service.verify('', password)).resolves.toBe(false);
  });
});
