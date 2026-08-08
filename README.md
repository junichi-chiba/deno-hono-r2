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
CLOUDFLARE_R2_MAX_UPLOAD_BYTES=1073741824
CLOUDFLARE_R2_UPLOAD_URL_TTL_MS=1800000
CLOUDFLARE_R2_STALE_UPLOAD_TTL_MS=1800000
CLOUDFLARE_R2_MAX_UPLOAD_LIFETIME_MS=3600000
```

## Routes

- `GET /health`
- `GET /api/objects/:key`
- `PUT /api/objects/:key`
- `DELETE /api/objects/:key`
- `POST /api/uploads`
- `POST /api/uploads/:uploadId/parts/:partNumber`
- `POST /api/uploads/:uploadId/extend`
- `POST /api/uploads/:uploadId/complete`
- `POST /api/uploads/:uploadId/abort`
- `DELETE /api/uploads/:uploadId`

The upload flow uses multipart uploads by default. Pass `strategy: "single"` to
keep the single PUT flow, or `strategy: "auto"` to explicitly select multipart.
Multipart clients request a presigned URL for each part, then submit the part
numbers and ETags to the complete endpoint. The flow stores pending metadata,
including multipart IDs and completed parts, in an in-memory JSON-shaped POC
store. It must be replaced with MongoDB Atlas before running multiple Deno
Deploy instances; the upload handlers already depend on a small storage
interface that can be swapped for a MongoDB repository.

Connect this repository to Deno Deploy with `src/index.ts` as the entrypoint.
