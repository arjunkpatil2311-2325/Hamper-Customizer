# VelvetBox — Hamper Customizer

A premium custom-gifting storefront where customers can build personalized hampers and the store owner manages the live product catalog.

The current customer-facing brand in the UI is **Hamper Hub**. The original visual design and existing customer journey are retained.

## Run & Operate

- Install the workspace with `corepack pnpm install --frozen-lockfile`.
- Run the storefront with `corepack pnpm --filter @workspace/hamper-hub run dev`. Vite defaults to `PORT=5173` and `BASE_PATH=/`.
- Type-check with `corepack pnpm run typecheck`; build with `corepack pnpm run build`.
- Generate API clients and validators after editing the OpenAPI source with `corepack pnpm --filter @workspace/api-spec run codegen`.
- Apply the Drizzle schema to a development database with `corepack pnpm --filter @workspace/db run push`. This project currently uses schema push and has no versioned migration directory.
- The product catalog starts empty by design. Add products in `/admin/products`; a product appears in the customer catalog only when it is active and has stock greater than zero.
- Deploy the storefront and API to Vercel from the repository root; see [Vercel deployment](#vercel-deployment).

### Windows notes

Use PowerShell. The root preinstall hook invokes `sh`, so add Git for Windows' `bin` directory to the current PowerShell process `PATH` if it is not already present:

```powershell
$env:PATH = "C:\Git\bin;$env:PATH"
corepack pnpm install --frozen-lockfile
```

To override the frontend defaults, set these values in the same terminal:

```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
corepack pnpm --filter @workspace/hamper-hub run dev
```

The API's `dev` script currently uses POSIX `export` and is not PowerShell-compatible. With its required configuration in place, run its build and start scripts separately:

```powershell
$env:PORT = "5000"
$env:NODE_ENV = "development"
corepack pnpm --filter @workspace/api-server run build
corepack pnpm --filter @workspace/api-server run start
```

For a local end-to-end run, the Vite development server proxies `/api` requests to the API server at `http://127.0.0.1:5000`. Start the API on port `5000` and the storefront on port `5173`. This proxy applies to Vite development only.

### Configuration

Keep values in ignored local environment files or the deployment's secret manager; never commit credentials.

- Database: `DATABASE_URL`
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` where the corresponding frontend/server flows require them
- Studio authorization: `HAMPER_HUB_ADMIN_EMAIL` must match a verified Clerk email
- Vite: optional `PORT` (default `5173`), `BASE_PATH` (default `/`), and `VITE_CLERK_PROXY_URL`
- Upload signing: `UPLOAD_TOKEN_SECRET`, a random secret used to sign short-lived, user-bound upload links
- Vercel Blob: connect a **private** Blob store to the Vercel project. Vercel supplies the store ID and deployment credentials.

## Stack

- pnpm workspaces; Node.js 24; TypeScript 5.9
- Frontend: React 19, Vite, Wouter, TanStack Query, Tailwind CSS 4 and custom CSS
- API: Express 5
- Database: PostgreSQL, Drizzle ORM and Drizzle Kit
- Validation/API contract: OpenAPI, Orval and Zod
- Authentication: Clerk
- Images: private Vercel Blob storage, with authenticated API uploads and owner/admin-checked photo reads

## Where things live

- `artifacts/hamper-hub/src/App.tsx` — storefront, hamper builder, customer order pages, studio order desk and product-management UI
- `artifacts/hamper-hub/src/index.css` — existing premium visual system and responsive layouts
- `artifacts/hamper-hub/public/` — storefront photography and existing static brand assets
- `artifacts/api-server/src/routes/products.ts` — public, active/in-stock product catalog and product-image delivery
- `artifacts/api-server/src/routes/adminProducts.ts` — server-protected product CRUD/archive operations
- `artifacts/api-server/src/routes/orders.ts` — customer order validation, inventory reservation and order snapshots
- `artifacts/api-server/src/lib/objectStorage.ts` — private Vercel Blob storage and signed upload-link handling
- `api/[...path].js` and `artifacts/api-server/src/vercel.ts` — Vercel serverless API entry point
- `vercel.json` — Vercel build, static output and SPA routing configuration
- `artifacts/api-server/src/middlewares/customerAuth.ts` — verified Clerk-based studio admin authorization
- `lib/db/src/schema/products.ts` and `product-images.ts` — product and immutable product-image records
- `lib/db/src/schema/hamper-orders.ts` — orders, including snapshotted item names, categories, prices and image URLs
- `lib/api-spec/openapi.yaml` — source of truth for API routes and payloads
- `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` — generated API client and validation code; regenerate from the OpenAPI spec

## Architecture decisions

- The customer catalog and studio product manager read/write the same PostgreSQL product table; there is no runtime hard-coded product fallback or initial product seed.
- Customer product lists contain only active products with positive stock. Order creation locks product rows and validates current stock/price server-side before reserving stock.
- Orders snapshot item names, categories, prices and image URLs. Product records are archived rather than deleted, and uploaded product-image assets are retained so historical order details do not change when a product is edited.
- Every product-management endpoint uses `requireStudioAdmin`; the frontend's admin navigation is only a convenience, not an authorization boundary.
- Product/customer images use private Vercel Blob storage. Short-lived upload signatures bind the file, size, content type and signed-in user; photo reads check ownership or studio-admin access, while product images are streamed through their immutable image records.

## Vercel deployment

The Vercel project should use the repository root as its Root Directory and the checked-in `vercel.json` settings. The build creates the Vite storefront as static output and routes `/api/*` through a Vercel Function. SPA routes such as `/build` are rewritten to the storefront entry point.

Before the first production deployment:

1. Import this Git repository into the existing `hamper-hub` Vercel project. The project shown in the dashboard must be connected to the repository containing this configuration.
2. Create a PostgreSQL database (Neon is a compatible option) and set `DATABASE_URL` in Vercel. Use the provider's pooled connection string for the deployed API.
3. Connect a **private** Vercel Blob store to the project. Do not use a public store: personalization photos and product uploads are private at rest. The Blob integration provides the store credentials to deployments.
4. Configure Clerk production credentials: `VITE_CLERK_PUBLISHABLE_KEY` (available to the frontend build), `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. For Vercel, set `VITE_CLERK_PROXY_URL` to `/_clerk`; Vercel rewrites that path to the API function. For local deployments, use `/api/__clerk`. Add the deployed Vercel domain to the Clerk instance.
5. Set `HAMPER_HUB_ADMIN_EMAIL` to the store owner's verified Clerk email.
6. Set `UPLOAD_TOKEN_SECRET` to a new random secret (at least 32 random bytes). Generate it locally; never put the value in Git or chat.
7. Run `corepack pnpm --filter @workspace/db run push` against the intended new database only after checking `DATABASE_URL`. This project has no versioned migrations; schema push changes the target database.
8. Deploy to Preview first, verify sign-in, catalog, image upload, order placement and the studio product desk, then promote a verified deployment to Production.

Set backend secrets through **Project Settings → Environment Variables** in Vercel. Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PROXY_URL` for Production and Preview because Vite embeds them at build time. Never paste secrets into chat or commit `.env`.

For local Blob development, provide a Vercel Blob read/write token in a local environment file or use Vercel's local development tooling. Production Blob operations use the connected private store. Product photos are delivered through the API; customer photos stay private and are served only to their owner or the studio admin.

## Product

The existing storefront includes a catalog, a hamper builder with product selection, live total calculation and a visual preview, wrapping and personalization options, delivery details, sign-in, order history and a studio order desk. The product manager adds product listing/search/filtering, image uploads, add/edit, stock and active-state management, and safe archival.

The catalog begins empty as requested. Product images and order placement depend on the configured database, Clerk identity and private Vercel Blob store. Image uploads are capped at 4 MB to stay below Vercel Function request limits.

## User preferences

- Preserve the imported design and existing working customer flows; do not rebuild from scratch.
- Do not seed or hard-code product data. Only products created and activated by the store owner should be offered to customers.
- Avoid paid services, do not expose keys or secrets, and ask before destructive changes.

## Gotchas

- The schema has no versioned migration history. `db push` updates the database schema; review and run it against the intended database before deploying.
- Stock must be set to a verified positive quantity and the product activated before customers can select it.
- The API server imports the database connection at startup and requires `DATABASE_URL`.
- Never use `db push` before verifying that `DATABASE_URL` points to the intended development or production database.
- Vercel does not receive the local `.env`; configure each required variable in the Vercel project, with frontend `VITE_` values available at build time.
