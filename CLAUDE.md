# Instructions for Claude Code

- The design brief is in `docs/design-brief.md`. Section 0 of the brief has the rules for the build. Follow them.
- The requirements for each milestone are in `docs/requirements/`. Start each milestone with its file. Do not start a milestone before the previous milestone passes its exit checks.
- Open questions and their proposed defaults are in `docs/requirements/README.md`, Section 8. When you use a default, write it in `DECISIONS.md`.
- Write each decision that the brief does not give in `DECISIONS.md`, with one line of reason.
- Update `PROGRESS.md` at the end of each milestone.
- Put all tuning numbers in `/data/*.json`. Keep the simulation headless (no DOM in `src/core`, `world`, `econ`, `actor`, `ship`, `services`, `encounter`, `combat`, `career`).
- Use the seeded RNG in `src/core/rng.ts` for all random results. Do not use `Math.random`.
- Write documents in ASD-STE100 (short sentences, active voice, one meaning per word).
