/**
 * What happened to a record.
 *
 * @remarks
 * Past tense, because an audit entry records something that already happened.
 * Adding an auditable operation means adding a member here, which keeps the set
 * enumerable and filterable rather than a free text field nobody can query.
 *
 * @property CATEGORY_CREATED - A category was created.
 * @property CATEGORY_UPDATED - A category was renamed or archived.
 * @property CATEGORY_DELETED - A category was soft deleted.
 * @property PLAN_CREATED - A monthly target was set for the first time.
 * @property PLAN_UPDATED - An existing target was changed.
 * @property PLAN_DELETED - A target was soft deleted.
 * @property ACTUAL_CREATED - Spend was logged.
 * @property ACTUAL_UPDATED - Logged spend was changed.
 * @property ACTUAL_DELETED - Logged spend was soft deleted.
 * @property PERIOD_LOCKED - A month was locked.
 * @property PERIOD_UNLOCKED - A month was unlocked.
 * @property IMPORT_COMPLETED - A CSV import committed.
 */
export enum AuditActionEnum {
  CATEGORY_CREATED = 'CATEGORY_CREATED',
  CATEGORY_UPDATED = 'CATEGORY_UPDATED',
  CATEGORY_DELETED = 'CATEGORY_DELETED',
  PLAN_CREATED = 'PLAN_CREATED',
  PLAN_UPDATED = 'PLAN_UPDATED',
  PLAN_DELETED = 'PLAN_DELETED',
  ACTUAL_CREATED = 'ACTUAL_CREATED',
  ACTUAL_UPDATED = 'ACTUAL_UPDATED',
  ACTUAL_DELETED = 'ACTUAL_DELETED',
  PERIOD_LOCKED = 'PERIOD_LOCKED',
  PERIOD_UNLOCKED = 'PERIOD_UNLOCKED',
  IMPORT_COMPLETED = 'IMPORT_COMPLETED',
}

/**
 * What kind of record an entry is about.
 *
 * @property CATEGORY - A spending category.
 * @property PLAN - A monthly target.
 * @property ACTUAL - Logged spend.
 * @property PERIOD_LOCK - A locked month.
 * @property IMPORT_BATCH - A CSV import.
 */
export enum AuditEntityEnum {
  CATEGORY = 'CATEGORY',
  PLAN = 'PLAN',
  ACTUAL = 'ACTUAL',
  PERIOD_LOCK = 'PERIOD_LOCK',
  IMPORT_BATCH = 'IMPORT_BATCH',
}
