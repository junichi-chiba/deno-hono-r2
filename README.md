# Deno Hono R2

Hono API for Deno Deploy with Cloudflare R2 object storage.

## Local development

```sh
mise install
# Add your R2 credentials to .mise.local.toml first.
mise run dev
```

Set these variables in `.mise.local.toml` for local development:

```sh
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=...
```

## Routes

- `GET /health`
- `GET /objects/:key`
- `PUT /objects/:key`
- `DELETE /objects/:key`

Connect this repository to Deno Deploy with `src/index.ts` as the entrypoint.
