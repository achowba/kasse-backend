import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PAGE_LIMIT } from '@common/constants';
import { toPaginatedResponse } from './paginated-response';
import { PaginationQueryDTO } from './pagination-query.dto';

/**
 * Runs a raw query object through the same conversion and validation the global
 * pipe applies.
 *
 * @param query - The raw query parameters, as strings, as a URL delivers them.
 * @returns The converted instance and any validation errors.
 */
const validate = (query: Record<string, unknown>): { dto: PaginationQueryDTO; errors: string[] } => {
  const dto = plainToInstance(PaginationQueryDTO, query, { enableImplicitConversion: true });
  const errors = validateSync(dto).flatMap((error) => Object.keys(error.constraints ?? {}).map(() => error.property));

  return { dto, errors };
};

describe('PaginationQueryDTO', () => {
  it('defaults to the standard page size at the start of the set', () => {
    const { dto, errors } = validate({});

    expect(errors).toEqual([]);
    expect(dto.limit).toBe(50);
    expect(dto.offset).toBe(0);
  });

  it('converts the strings a URL actually delivers into numbers', () => {
    const { dto, errors } = validate({ limit: '25', offset: '100' });

    expect(errors).toEqual([]);
    expect(dto.limit).toBe(25);
    expect(dto.offset).toBe(100);
  });

  it('accepts the maximum page size', () => {
    expect(validate({ limit: String(MAX_PAGE_LIMIT) }).errors).toEqual([]);
  });

  it('rejects a page size above the cap, so no endpoint can be talked into an unbounded read', () => {
    expect(validate({ limit: String(MAX_PAGE_LIMIT + 1) }).errors).toContain('limit');
  });

  it('rejects a page size of zero or below', () => {
    expect(validate({ limit: '0' }).errors).toContain('limit');
    expect(validate({ limit: '-1' }).errors).toContain('limit');
  });

  it('rejects a negative offset', () => {
    expect(validate({ offset: '-1' }).errors).toContain('offset');
  });

  it('rejects a fractional page size', () => {
    expect(validate({ limit: '1.5' }).errors).toContain('limit');
  });

  it('rejects text where a number belongs', () => {
    expect(validate({ limit: 'all' }).errors).toContain('limit');
  });
});

describe('toPaginatedResponse', () => {
  it('reports the total over the whole set, not the page', () => {
    const query = plainToInstance(PaginationQueryDTO, { limit: 2, offset: 4 }, { enableImplicitConversion: true });
    const response = toPaginatedResponse(['a', 'b'], 97, query);

    expect(response.items).toEqual(['a', 'b']);
    expect(response.pagination).toEqual({ limit: 2, offset: 4, total: 97 });
  });

  it('reports an empty page honestly rather than omitting the envelope', () => {
    const query = plainToInstance(PaginationQueryDTO, {}, { enableImplicitConversion: true });
    const response = toPaginatedResponse([], 0, query);

    expect(response.items).toEqual([]);
    expect(response.pagination.total).toBe(0);
  });
});
