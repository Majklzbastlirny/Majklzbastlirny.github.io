# Self-hosted webfonts

These are served from this repository instead of from Google Fonts. Previously three tools
(`orientation`, `sensorcalc`, `antenna-pattern`) pulled webfonts from `fonts.gstatic.com`, which
meant every page load disclosed the visitor's IP address to Google and broke the fonts entirely
on a bench laptop with no network. Self-hosting removes both problems, and matches the site's
rule that a tool must work offline and from `file://`.

## What is here

| Family | Weights | Licence | Upstream |
|---|---|---|---|
| Chakra Petch | 400, 500, 600, 700 | OFL 1.1 | Cadson Demak |
| DM Sans | 400, 500, 700 | OFL 1.1 | Colophon Foundry, Jonny Pinhorn, Indian Type Foundry |
| IBM Plex Mono | 400, 500, 600 | OFL 1.1 | IBM Corp. |
| IBM Plex Sans | 400, 500, 600 | OFL 1.1 | IBM Corp. |
| JetBrains Mono | 400, 500, 600, 700 | OFL 1.1 | JetBrains s.r.o. |

`fonts.css` carries the `@font-face` rules for all five; tools link it as
`../assets/fonts/fonts.css` and browsers only fetch the `.woff2` files for families a page
actually uses, so the unused declarations cost nothing but a few hundred bytes of CSS.

**Only the `latin` and `latin-ext` subsets are included.** `latin-ext` is not optional here —
it carries the Czech diacritics (ř ě š č ž ů ď ť ň) that the Czech-language tools need. The
Cyrillic, Greek, Thai and Vietnamese subsets Google also offers were dropped; re-add them from
the Google Fonts CSS API if a tool ever needs them.

## Licence

All five families are licensed under the SIL Open Font License 1.1, reproduced in `OFL.txt`.
The OFL requires that the licence accompany the fonts when they are redistributed, which is why
that file is here — do not delete it. The fonts are redistributed unmodified, so the Reserved
Font Name restrictions are not engaged.

## Regenerating

Fetch the Google Fonts CSS API with a modern browser user-agent (an older UA gets you TTF
instead of woff2), keep only the `latin` and `latin-ext` blocks, download each `.woff2`, and
rewrite the `src:` URLs to local relative paths. Name files
`<family>-<weight>-<subset>.woff2` so the set stays readable.
