/**
 * Normalises a category name into its comparison key.
 *
 * @remarks
 * Uniqueness is on the slug, not the name, so "Cloud Hosting", "cloud hosting",
 * and "Cloud  Hosting" are the same category. Without this a user ends up with
 * three categories that look identical in a picker and split their spend three
 * ways in a report.
 *
 * The displayed name keeps whatever capitalisation the user chose. Only the key
 * is normalised.
 *
 * @param name - The name as the user wrote it.
 * @returns The comparison key: lower case, trimmed, with runs of non alphanumeric characters collapsed to a single hyphen.
 */
export const toCategorySlug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
