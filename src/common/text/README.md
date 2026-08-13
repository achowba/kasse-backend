# common/text

Cleaning and refusing user typed text, in one place.

## What it does

Two jobs that look alike and are not.

**`sanitiseText`** cleans a value on its way in, without changing what it says. It composes to `NFC`, removes the invisible characters that carry no meaning, folds every kind of whitespace to a plain space, collapses runs, and trims. `SanitisedText()` wires it into a DTO field.

**`hasForbiddenCharacters`** answers whether a value must be refused outright. Nothing repairs these.

**`foldForComparison`** reduces a value to the key used to decide whether two of them are the same thing. It is deliberately more aggressive than the other two.

## Strip, refuse, or fold

The three lists are different on purpose, and the differences are the whole design.

| | Example | Treatment | Why |
|---|---|---|---|
| Invisible, meaningless | Variation selector, zero width space, soft hyphen, BOM | **Removed** | Almost always a paste accident. A spreadsheet exports a BOM on the first cell; a chat client attaches a variation selector. Refusing would punish someone for their clipboard. |
| Invisible, meaningful | Zero width joiner, non joiner | **Kept in the name, removed from the key** | They build emoji sequences and are required for correct rendering in Persian, Hindi, and other scripts, so removing them corrupts real text. But a key that kept them would let two indistinguishable names exist. |
| Control and direction | `NUL`, `ESC`, `U+202E`, the bidi isolates | **Refused, 400** | Not a typing mistake. A direction override makes a string display as one thing and compare as another, which is the Trojan Source class of attack, and stripping one silently would hide the attempt rather than stop it. A refusal is a signal; a silent repair is not. |
| Whitespace of any kind | No break space, em space, tab, newline | **Folded to one space** | Real whitespace, not an attack. Folding also keeps a name on one line without a separate rule. |

## Why a name and its key differ

A stored name has to be what the owner wrote. A key has to answer one question: would a person reading these two strings call them the same thing?

So the key also folds accents and case. `Café` and `Cafe` are one category to anyone choosing from a list, and `NFKD` splits the accent off the letter so the accent can be dropped rather than the whole letter.

### What this fixed

The category slug was built by collapsing everything outside `a-z0-9` to a hyphen, and two things fell out of that.

**Invisible characters became separators instead of disappearing.** `Marke<ZWSP>ting` keyed as `marke-ting`, so it was a different category from `Marketing`, sat next to it in the picker looking identical, and split its spend across two rows of the variance report. Every uniqueness rule in the module was bypassable by pasting one character nobody can see.

**Non ASCII letters were deleted.** `Café` keyed as `caf`, because a composed `é` fell outside `a-z0-9`, became a separator, and was then trimmed off the end. So `Café` and `Cafè` collided while `Café` and `Cafe` did not, which is backwards. The same name also keyed differently depending on the machine it was typed on, since macOS produces the decomposed form, which left an `e` behind, and most other systems produce the composed one, which did not.

## Why the patterns are built from numbers

`text.constants.ts` assembles its regular expressions from tables of code points rather than writing the characters out. Every character this module handles is invisible: a pattern containing them could not be reviewed in a diff, could not survive a careless copy or a well meaning formatter, and would be the exact failure the module exists to prevent. A reader sees `0x200b` and can look it up.

The same reasoning applies to the tests, which build their fixtures with `String.fromCodePoint`. A spec that lost one of its literal characters would compare `Marketing` with `Marketing` and pass having asserted nothing.

The lint rule against irregular whitespace makes the point independently: it rejected this module's own doc comment when an example was written with real no break spaces in it.

## What this does not solve

**Confusable scripts.** Cyrillic `а` and Latin `a` render identically and fold to different keys, so two categories can still look the same to a reader. Catching that needs a Unicode confusables mapping, which is a larger dependency than the problem currently justifies.

## How it relates to the rest of the project

`SanitisedText()` is on every field a person types into: the category name, the expense note, and the natural language question. The CSV import applies `sanitiseText` in its cell reader and reports a forbidden character as a per row error, so a bad cell sends the reader to the line that needs fixing rather than failing the whole file with no location.

`@modules/categories` builds its slug on `foldForComparison`.

## Endpoints

None.

## Dependencies on other modules

None. This is a leaf, which is deliberate: everything that validates input can depend on it without a cycle.
