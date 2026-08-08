# Deno Hono R2

Hono API for Deno Deploy with Cloudflare R2 object storage.

## Local development

```sh
mise install
# Use mise -E file run dev for filesystem-backed mock mode, or configure R2.
mise -E file run dev
```

For local testing without R2, use the filesystem-backed mock environment:

```sh
mise -E file run dev
```

It sets `CLOUDFLARE_R2_STORAGE_MODE=mock-file`. Mock signed URLs point back to
the upload API and store objects and multipart parts under `tmp/db/objects`.
Automated tests use the in-memory environment:

```sh
mise -E test run test
```

Set these variables in `.mise.local.toml` for local development:

```sh
CLOUDFLARE_R2_STORAGE_MODE=r2
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=...
CLOUDFLARE_R2_MAX_UPLOAD_BYTES=1073741824
CLOUDFLARE_R2_UPLOAD_URL_TTL_MS=1800000
CLOUDFLARE_R2_STALE_UPLOAD_TTL_MS=1800000
CLOUDFLARE_R2_MAX_UPLOAD_LIFETIME_MS=3600000
```

The account and credential variables are only required when storage mode is
`r2`.

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
- `PUT /api/uploads/mock/:uploadId` (mock-file and mock-memory only)
- `PUT /api/uploads/mock/:uploadId/parts/:partNumber` (mock-file and mock-memory
  only)

The upload flow uses multipart uploads by default. Pass `strategy: "single"` to
keep the single PUT flow, or `strategy: "auto"` to explicitly select multipart.
Multipart clients request a presigned URL for each part, then submit the part
numbers and ETags to the complete endpoint. The flow stores pending metadata,
including multipart IDs and completed parts, in an in-memory JSON-shaped POC
store. It must be replaced with MongoDB Atlas before running multiple Deno
Deploy instances; the upload handlers already depend on a small storage
interface that can be swapped for a MongoDB repository.

Connect this repository to Deno Deploy with `src/index.ts` as the entrypoint.
