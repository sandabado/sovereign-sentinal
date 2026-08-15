# Sovereign

Sovereign is a protected family financial operating system. It combines a
canonical financial calendar, debt planning, subscription oversight, household
and entity views, Supabase authentication, and secure Plaid connectivity.

## Prerequisites

- Node.js `24.x`

## Local development

```bash
npm install
npm run build
npm run dev
```

Open `http://localhost:3000`. Protected routes redirect to `/auth/login`.

Copy `.env.example` to `.env.local` and provide the required values. Never
commit `.env.local`, Supabase service-role credentials, Plaid secrets, or token
encryption keys.

For local Supabase Auth, configure:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000/auth/callback
```

## Database

The Supabase migrations live in `supabase/migrations` and must be applied in
filename order. With the Supabase CLI linked to the intended project:

```bash
supabase db push --linked --include-all
```

## Checks

- `npm run build`: create the production Next.js build
- `npm run lint`: run source linting
- `npm test`: build and exercise the authentication and Plaid route boundaries

## Vercel deployment

Import the GitHub repository into Vercel as a Next.js project and configure the
variables documented in `.env.example`. After Vercel assigns the production
URL, add `https://YOUR_DOMAIN/auth/callback` to the Supabase Auth redirect
allow-list and configure Plaid's webhook as
`https://YOUR_DOMAIN/api/plaid/webhook`.
