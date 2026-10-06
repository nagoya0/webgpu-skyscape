# CLAUDE.md

Guidance for AI coding agents working in this repository.

## What this is

A demo that tests how well sky, clouds and the ground can be rendered in the browser with
WebGPU. The camera rides along a precomputed flight path over central Tokyo; there is no
piloting. See [README.md](README.md) (including what is in so far) and
[ADR 0002](docs/adr/0002-a-rendering-quality-demo.md). Keep the README's status section and
parameter table up to date when features change.

## Language

Everything in the repository is in English: documentation, code, comments, commit messages.

## Decisions and ideas

- Design decisions are Architecture Decision Records in [docs/adr/](docs/adr/). Read the index
  ([docs/adr/README.md](docs/adr/README.md)) before changing the design, and do not work against
  an Accepted decision without proposing a new ADR that supersedes it.
- Record a new decision as the next numbered ADR and add it to the index. Replaced decisions are
  marked *Superseded* and linked to their replacement, not deleted.
- Write ADRs in plain, literal language: state the facts and the reasons directly. Avoid metaphors
  and compressed or poetic phrasing. A reader who was not part of the discussion, including the
  author months later, must be able to follow why the decision was made.
- Record only what the maintainer agreed to. Do not add your own assumptions as decisions or
  reasons.
- Undecided ideas and open questions live in [docs/ideas.md](docs/ideas.md). When one is settled,
  write the ADR and remove it from the ideas file.
- Write down only what cannot be read from the code or the git history.

## Choosing technology

Fit with the product comes first. Never pick a tool the product does not need. Record each
significant choice as an ADR with the alternatives considered.

Libraries move quickly here (Three.js WebGPU and TSL, the takram packages). Before using an API,
check it against the installed version's source or documentation rather than memory.

`three`, `@types/three` and `@takram/*` are pinned, and the takram packages carry local patches.
Follow [docs/upgrading.md](docs/upgrading.md) for any upgrade, and keep its "Current state"
section up to date. Mark every type cast that bridges takram's types to the installed
`@types/three` with a `TYPE-BRIDGE:` comment.

`node scripts/check-page.mjs <url> <out.png>` opens a page in headless Chrome and reports its state
and `window.__debug`; use it to check changes in a real browser. The main page takes its
settings from URL query parameters, listed in `src/params.ts`. `pnpm test` runs the unit tests
(Vitest), which cover the coordinate conversions, the tile maths, the flight path, the camera,
the parameters and the shader preprocessor.

Write heavy shader code in WGSL (`.wgsl` files, one function each, connected with `wgslFn`) and
use TSL only to gather inputs and connect stages. In post-processing, pass the scene camera's
values as uniforms; the `three/tsl` camera accessors refer to the full-screen quad's camera there
([ADR 0022](docs/adr/0022-heavy-shaders-in-wgsl.md)).

The clouds aim to reproduce as much of `@takram/three-clouds` as possible
([ADR 0013](docs/adr/0013-port-the-clouds-to-tsl.md)). Whenever a cloud feature is added, changed
or deferred, update [docs/clouds-parity.md](docs/clouds-parity.md), and never leave a takram
feature out without a row there saying so. Keep takram's `#ifdef` switches as preprocessor
blocks (`src/shaders/preprocess.ts`) instead of cutting them out.

Do not add on-screen controls; the UI is designed once the features are in
([ADR 0019](docs/adr/0019-no-ui-until-features-are-in.md)). Add a URL parameter instead.

## Secrets and data

- Never commit API keys or other secrets. Pass them as environment variables at run time.
- Never print, log or commit a key value. To check that a key is present, show its name and length only.
- Never ask the maintainer to paste a key into the chat.
- Large tile data does not go into the repository
  ([ADR 0012](docs/adr/0012-site-and-tile-data-hosted-apart.md)).
- Every data source keeps its attribution on screen and in the README.

## Repository hygiene

- This repository will become public. Write every document, comment and commit message to be
  read by anyone.
- Keep personal circumstances, employers and other private context out of the repository, and
  anything that identifies the maintainer's own environment, such as user names, local paths and
  account names. The GPU model used for measurements may be named, since the measurements depend
  on it.
- Write about other projects and their authors neutrally: state facts with dates (last commit,
  open pull requests) without judging them, and do not cite people's social media posts.
- Commit author is the maintainer's GitHub noreply address; do not change it.
