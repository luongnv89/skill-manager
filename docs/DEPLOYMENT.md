# Deployment

## Publishing to npm (via Bun)

agent-skill-manager is distributed as a global CLI package.

### 1. Bump the version

Update the version in both files:

- `package.json` → `"version"`
- `bin/skill-manager.ts` → `VERSION` constant

### 2. Build and publish

```bash
npm publish
```

Or if using Bun's npm compatibility:

```bash
bunx npm publish
```

### 3. Install globally

Users install with:

```bash
bun install -g agent-skill-manager
```

## Running from Source

For development or CI environments:

```bash
git clone https://github.com/luongnv89/agent-skill-manager.git
cd agent-skill-manager
bun install
bun run start
```

## CI Pipeline

GitHub Actions runs on every push and PR to `main`:

- Type-checking (`bun run typecheck`)
- Tests (`bun test`)

See `.github/workflows/ci.yml` for the full pipeline.
