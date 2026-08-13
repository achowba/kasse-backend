/**
 * How an import finished.
 *
 * @remarks
 * There is no `PENDING` or `RUNNING` member, and that absence is the design. The
 * import parses, validates, and writes inside one request, so a batch record only
 * ever exists after the outcome is known. A status that could be observed
 * mid-flight would imply a client has to poll, which it does not.
 *
 * @property COMPLETED - Every row validated and was written.
 * @property FAILED - At least one row was rejected, so nothing was written.
 */
export enum ImportStatusEnum {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
