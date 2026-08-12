/**
 * How an expense got here.
 *
 * @remarks
 * Recorded so an unexpected figure can be traced to how it arrived. An imported
 * row and a hand entered one are corrected differently: the first usually means
 * re-importing a corrected file, the second means editing the record.
 *
 * @property MANUAL - Entered through the API by a person.
 * @property CSV - Written by a CSV import, which also stores the batch it came from.
 */
export enum ExpenseSourceEnum {
  MANUAL = 'MANUAL',
  CSV = 'CSV',
}
