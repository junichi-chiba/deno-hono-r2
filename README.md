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
Completed content metadata (including active, duplicate, and deleted records)
and upload-attempt records are persisted under `tmp/db`. Storage keys are
UUID-backed per upload attempt. Content digests are verified at completion using
the storage provider's SHA-256 checksum metadata rather than downloading the
object; competing completions retain a duplicate record until the configured
duplicate retention window expires. Automated tests use the in-memory
environment:

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
CLOUDFLARE_R2_DUPLICATE_RETENTION_MS=86400000
```

The account and credential variables are only required when storage mode is
`r2`.

## Routes

- `GET /health`
- `GET /api/objects/:key`
- `PUT /api/objects/:key`
- `DELETE /api/objects/:key`
- `POST /api/uploads`
- `POST /api/uploads/cleanup`
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
Upload creation requires `contentDigest`, a 64-character SHA-256 hexadecimal
digest of the content. The API also returns the required base64
`x-amz-checksum-sha256` value. Multipart clients request a presigned URL for
each part with a JSON body containing that part's `contentDigest`; the response
contains the matching base64 checksum header value. Clients must send that
header with each PUT, then submit the part numbers and ETags to the complete
endpoint. `mock-memory` uses in-memory metadata and upload repositories, while
`mock-file` uses JSON files under `tmp/db`. R2 currently uses the in-memory
repositories as a temporary fallback until MongoDB Atlas repositories are
implemented; this fallback must not be used for multiple Deno Deploy instances.

R2 multipart completion sends the client-provided full-object SHA-256 checksum
to the S3-compatible API and verifies the returned checksum through
`HeadObject`. R2 deployments must support `ChecksumAlgorithm=SHA256`,
`ChecksumType=FULL_OBJECT`, and checksum-bearing `HeadObject` responses; some
older R2 compatibility layers may not expose all of these fields.

Connect this repository to Deno Deploy with `src/index.ts` as the entrypoint.
