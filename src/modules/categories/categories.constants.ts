/**
 * Longest category name accepted.
 *
 * @remarks
 * Long enough for a descriptive name such as "Security and Compliance Tools",
 * short enough that a name stays readable in a picker and a report column.
 */
export const CATEGORY_NAME_MAX_LENGTH = 60;

/**
 * What a caller is told when they try to change a shared catalogue entry.
 *
 * @remarks
 * It names the rule and the way around it. A message that only refuses leaves
 * the reader to guess whether the category is broken, missing, or somebody
 * else's.
 */
export const SHARED_CATEGORY_IS_READ_ONLY =
  'A standard category cannot be changed or deleted. Create your own category if you need a different one.';

/**
 * What a caller is told when a category name is already in use.
 *
 * @remarks
 * Deliberately does not say whether the existing one is theirs or from the
 * shared catalogue. Either way the answer is the same, and both are already
 * listed to them, so there is nothing to disclose and nothing to act on
 * differently.
 */
export const CATEGORY_NAME_TAKEN = 'A category with that name already exists.';
