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
