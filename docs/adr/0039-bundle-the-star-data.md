# 39. Bundle takram's star data

- Status: Accepted
- Date: 2026-10-08

## Context

takram's atmosphere draws the stars from `stars.bin`, which it loads from its GitHub repository
at run time. Its README says the file holds the directions, magnitudes and colours of the 9,096
stars in the Yale Bright Star Catalog, 5th edition (Hoffleit and Warren, 1991). That catalogue
has been distributed freely for decades by NASA's HEASARC and by CDS, Strasbourg. CDS asks that
the authors and the source be cited. No restriction to non-commercial or research use was found;
the catalogue's own page at CDS could not be reached when this was checked.

## Decision

- The file is bundled at `public/stars/stars.bin` (the maintainer, 2026-10-08), and takram's
  atmosphere loads it from there through a patch of its address, so the demo loads nothing from
  GitHub.
- The README credits takram for the file (MIT) and the catalogue it comes from.
- The stars are not made again from the catalogue: the file's origin is stated.

## Consequences

- With this and [ADR 0038](0038-own-blue-noise.md), the only server the demo loads from at run
  time, apart from its own, is the GSI's.
- Whether the stars are drawn correctly can only be seen once night is implemented: the exposure
  is still the day's, so the night sky shows black.