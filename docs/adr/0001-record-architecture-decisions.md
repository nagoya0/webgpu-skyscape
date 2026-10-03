# 1. Record architecture decisions

- Status: Accepted
- Date: 2026-10-03

## Context

The reasoning behind this project's design comes out of discussion and experiments, and cannot be
read from the code or the git history. It needs to survive for later readers, including AI coding
agents, which start every session without memory.

## Decision

Record each significant decision as an Architecture Decision Record in `docs/adr/`, one file per
decision, numbered in order. A decision that is replaced is not edited away; it is marked
*Superseded* and linked to its replacement. [README.md](README.md) in this folder is the index.

Ideas and open questions that are not decided yet live in [docs/ideas.md](../ideas.md). When one
is settled, it becomes an ADR and is removed from the ideas file.

## Consequences

The history of the design stays readable, including decisions that were later reversed. The index
has to be kept up to date by hand.
