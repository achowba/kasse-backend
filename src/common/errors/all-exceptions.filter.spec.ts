import { ArgumentsHost, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';
import { ErrorCodeEnum } from './error-code.enum';
import { IErrorResponse } from './error-response.interface';

/**
 * Minimal stand in for the Express response, capturing what the filter sends.
 *
 * @property status - Records the status and returns itself, as Express does.
 * @property json - Records the body.
 */
interface IMockResponse {
  status: jest.Mock;
  json: jest.Mock;
  body?: IErrorResponse;
}

/**
 * Builds a response double whose `status` chains, matching Express, and which
 * captures the body it is sent.
 *
 * @remarks
 * Capturing the body on the double rather than digging through `mock.calls`
 * keeps the assertions typed. `mock.calls` is `any`, which the lint rules reject
 * and which would silently accept a misspelled field in an expectation.
 *
 * @returns The response double.
 */
const createResponse = (): IMockResponse => {
  const response: IMockResponse = { status: jest.fn(), json: jest.fn() };

  response.status.mockReturnValue(response);
  response.json.mockImplementation((body: IErrorResponse): IMockResponse => {
    response.body = body;

    return response;
  });

  return response;
};

/**
 * Builds an execution context carrying the given request and response.
 *
 * @param request - The request double.
 * @param response - The response double.
 * @returns Something shaped enough like an `ArgumentsHost` for the filter.
 */
const createHost = (request: object, response: IMockResponse): ArgumentsHost =>
  ({
    switchToHttp: (): { getRequest: () => object; getResponse: () => IMockResponse } => ({
      getRequest: (): object => request,
      getResponse: (): IMockResponse => response,
    }),
  }) as unknown as ArgumentsHost;

/**
 * Reads the body the filter sent.
 *
 * @param response - The response double.
 * @returns The error envelope.
 */
const sentBody = (response: IMockResponse): IErrorResponse => {
  if (response.body === undefined) {
    throw new Error('the filter sent no response body');
  }

  return response.body;
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  const request = { url: '/api/v1/plans', id: 'req-1', headers: {} };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('preserves the code, status, and details of a classified exception', () => {
    const response = createResponse();
    const exception = new AppException(ErrorCodeEnum.PERIOD_LOCKED, '2026-01 is locked.', HttpStatus.LOCKED, {
      month: '2026-01',
    });

    filter.catch(exception, createHost(request, response));

    const body = sentBody(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.LOCKED);
    expect(body.code).toBe(ErrorCodeEnum.PERIOD_LOCKED);
    expect(body.message).toBe('2026-01 is locked.');
    expect(body.details).toEqual({ month: '2026-01' });
    expect(body.path).toBe('/api/v1/plans');
    expect(body.requestId).toBe('req-1');
  });

  it('maps a framework exception to a code by its status', () => {
    const response = createResponse();

    filter.catch(new NotFoundException('No such plan'), createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(sentBody(response).code).toBe(ErrorCodeEnum.NOT_FOUND);
  });

  it('returns every failing field of a validation error at once', () => {
    const response = createResponse();
    const validationFailure = new HttpException(
      { message: ['month must match YYYY-MM', 'targetMinor must be an integer'], statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(validationFailure, createHost(request, response));

    const body = sentBody(response);

    expect(body.code).toBe(ErrorCodeEnum.VALIDATION_FAILED);
    expect(body.details).toEqual({
      errors: ['month must match YYYY-MM', 'targetMinor must be an integer'],
    });
  });

  it('never leaks the internal message of an unexpected failure', () => {
    const response = createResponse();

    filter.catch(new Error('connection string rejected by mongodb'), createHost(request, response));

    const body = sentBody(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.code).toBe(ErrorCodeEnum.INTERNAL);
    expect(body.message).toBe('An unexpected error occurred.');
    expect(body.message).not.toContain('mongodb');
    expect(body.requestId).toBe('req-1');
  });

  it('logs a server failure at error and a caller failure at info', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    filter.catch(new Error('boom'), createHost(request, createResponse()));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    filter.catch(new NotFoundException(), createHost(request, createResponse()));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the forwarded header when the logger set no request id', () => {
    const response = createResponse();
    const headerOnly = { url: '/api/v1/plans', headers: { 'x-request-id': 'from-header' } };

    filter.catch(new NotFoundException(), createHost(headerOnly, response));

    expect(sentBody(response).requestId).toBe('from-header');
  });

  it('omits details entirely when there are none', () => {
    const response = createResponse();

    filter.catch(new NotFoundException('nope'), createHost(request, response));

    expect(sentBody(response)).not.toHaveProperty('details');
  });
});
