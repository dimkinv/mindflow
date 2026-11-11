# Mindflow

Mindflow is a self-hosted mind-map editor built with React, Next.js-compatible
App Router APIs, vinext, Cloudflare Workers, D1, and Drizzle ORM.

## Requirements

- Node.js 22.13 or newer
- A Cloudflare account
- Wrangler authenticated with `npx wrangler login`
- An existing D1 database, or a new D1 database created for Mindflow

## Cloudflare configuration

Edit `wrangler.jsonc` before deploying:

1. Change `database_name` to the name of your D1 database.
2. Replace the all-zero `database_id` with that database's real UUID.
3. Optionally change the Worker name from `mindflow`.
4. Add `account_id` at the top level, or set `CLOUDFLARE_ACCOUNT_ID` in your shell or CI environment.

Configure the password pepper once for each Worker environment. Use a long,
random value and never commit it:

```bash
npx wrangler secret put PASSWORD_PEPPER
```

Find the database information with `npx wrangler d1 list`. The Worker accesses
D1 through the `DB` binding; no database password is stored in the app.

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

## Deploying to your Cloudflare account

```bash
npm run db:migrate:remote
npm run deploy
```

Afterward, attach a custom domain from the Worker's **Settings > Domains &
Routes** page in the Cloudflare dashboard.

For later schema changes, run `npm run db:generate`, inspect and commit the
generated SQL, then apply migrations before deploying.

## Deploying from GitHub Actions

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
deploys on pushes to `master`. You can also run it from GitHub's **Actions >
Deploy to Cloudflare > Run workflow** page, selecting `master`.

In the repository's **Settings > Secrets and variables > Actions**, add these
repository secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with **Account > Workers
  Scripts > Edit** and **Account > D1 > Edit** permissions for the target account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the configured
  D1 database and Worker.

The D1 database in `wrangler.jsonc` must already exist in that account. Configure
`PASSWORD_PEPPER` on the Worker once using `npx wrangler secret put PASSWORD_PEPPER`
before serving users; it stays on Cloudflare and is not needed as a GitHub secret.

The workflow installs dependencies with `npm ci`, builds and tests the app,
applies remote D1 migrations, and uploads the built Worker and assets. Deployments
run one at a time, and an active deployment is allowed to finish before another
starts. Commit generated SQL migrations alongside the app changes that need them.
Database migrations are applied before deployment and remain applied if the
Worker upload fails.

## Authentication

Authentication is owned by this application and does not depend on ChatGPT.
Users register with a name, email, and password and receive an HTTP-only session
cookie.

- Passwords use PBKDF2-HMAC-SHA-256 with a unique random salt.
- Password hashing also uses a Worker secret named `PASSWORD_PEPPER`.
- D1 stores only hashes of session tokens.
- Sessions expire after 30 days.
- Production cookies use `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Existing maps are claimed when an account uses the same normalized email.
- Existing view and edit links remain valid.

For a public service, configure Cloudflare rate limits for `/api/auth/login` and
`/api/auth/register`. Email verification and password reset require an email
delivery provider and are not included yet.

## Live collaboration

People who open the same editable map link join a board-specific WebSocket room.
Node additions, moves, and text edits are shared immediately; regular autosave
persists the resulting board to D1. The `CollaborationRoom` Durable Object and
its `v1` migration are declared in `wrangler.jsonc`, so `npm run deploy` will
provision the room automatically.

## Useful commands

- `npm run dev`: local development
- `npm run build`: production build
- `npm test`: build and project checks
- `npm run lint`: lint the project
- `npm run deploy`: deploy to Cloudflare Workers
- `npm run db:generate`: generate a Drizzle migration
- `npm run db:migrate:local`: apply migrations to local D1
- `npm run db:migrate:remote`: apply migrations to remote D1

## Framework-independent mindmap package

The mindmap model, SVG/HTML rendering, editing tools, and navigation live in
[`@mindflow/mindmap`](packages/mindmap/README.md), an npm workspace package with
no runtime framework dependencies. It mounts into any DOM element using
`createMindMap(container, options)` and isolates its styles in a shadow DOM.
A [plain HTML example](packages/mindmap/examples/index.html) demonstrates use
without React, Next.js, or a bundler.

The application owns authentication, persistence, sharing, feedback, and the
collaboration connection. `app/mind-map-canvas.tsx` is a React lifecycle adapter;
it forwards document changes and read-only state to the package. API and
collaboration validation share the package's model schema.

`npm run dev` and `npm run build` compile the package before starting the app.
After editing package sources during development, run `npm run build:mindmap`
to refresh the compiled modules (or `npx tsc -p packages/mindmap/tsconfig.json --watch`
in a second terminal). To create a distributable archive, run
`npm pack --workspace @mindflow/mindmap`.
