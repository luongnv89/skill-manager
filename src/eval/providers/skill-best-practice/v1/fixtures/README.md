# skill-best-practice/v1 fixtures

Each subdirectory is an input fixture: a real skill directory the provider can
be pointed at. Tests in `../index.test.ts` load these via the loader helper
(see `loadFixtureSkill()`), copy them into a tmp root so the provider sees the
fixture's directory name as the skill root, and assert the expected
finding/severity is emitted.

Fixtures only cover **new or changed** checks introduced in v1.1.0
(skill-creator v1.7.1 alignment). Older checks remain covered inline in
`../index.test.ts` to keep the existing test surface intact.

Naming: `<check-id>-pass` / `<check-id>-fail`. Each fixture's frontmatter
`name:` matches its directory so the `name-matches-directory` check passes —
unless the fixture is specifically exercising that check.
