import { foldForComparison } from '@common/text';

/** Runs of anything that is not a letter or a digit, in any script. */
const SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/gu;

/** Leading and trailing hyphens left behind by the separator collapse. */
const EDGE_HYPHEN_PATTERN = /^-+|-+$/g;

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
 * Two things this used to get wrong, both of which produced exactly the
 * duplicate the key exists to prevent.
 *
 * **Invisible characters survived.** The key was built by collapsing anything
 * outside `a-z0-9`, which turned a zero width space into a hyphen rather than
 * removing it, so `Marke<ZWSP>ting` keyed as `marke-ting` and sat in the picker
 * next to `Marketing`, indistinguishable and separately spent against.
 * {@link foldForComparison} removes them before anything else runs.
 *
 * **Non ASCII letters were deleted.** `Café` keyed as `caf`, because the
 * composed `é` fell outside `a-z0-9` and became a separator that was then
 * trimmed from the end. So `Café` and `Cafè` were the same category while `Café`
 * and `Cafe` were not, which is backwards. Worse, the same name keyed
 * differently depending on how it had been typed, since a decomposed `é` left an
 * `e` behind and a composed one did not. Folding handles the accent, and the
 * separator pattern now spans every script, so `Бюджет` keys as itself instead
 * of as an empty string that the caller was told "must contain at least one
 * letter or number".
 *
 * @param name - The name as the user wrote it.
 * @returns The comparison key: folded, lower case, with runs of anything that is not a letter or digit collapsed to a single hyphen.
 */
export const toCategorySlug = (name: string): string =>
  foldForComparison(name).replace(SEPARATOR_PATTERN, '-').replace(EDGE_HYPHEN_PATTERN, '');
