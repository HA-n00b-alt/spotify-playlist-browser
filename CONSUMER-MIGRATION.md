# Consumer migration: `bpm-api-microservice` → `delman-site`

Use this checklist in **every repo that calls the BPM API** before the old GCP project is shut down.

Only the **primary API** (`bpm-service`) is called by consumers. Do **not** point apps at the worker or fallback services — those are internal.

---

## What changed

| Setting | Old (`bpm-api-microservice`) | New (`delman-site`) |
|---|---|---|
| GCP project | `bpm-api-microservice` | `delman-site` |
| Project number | `340051416180` | `579865585076` |
| Region | `europe-west3` | `europe-west3` (unchanged) |
| **API base URL** | `https://bpm-service-pgkjwjbhqq-ey.a.run.app` | `https://bpm-service-7jlgdaerna-ey.a.run.app` |
| Service account | `vercel-bpm-invoker@bpm-api-microservice.iam.gserviceaccount.com` | `vercel-bpm-invoker@delman-site.iam.gserviceaccount.com` |

**Unchanged:** API paths, request/response JSON, auth scheme (Google Identity Token with **audience = service URL**), IAM invoker role on the service account.

Endpoints (same on both):

- `GET /health`
- `POST /analyze/batch`
- `GET /stream/{batch_id}`
- `GET /batch/{batch_id}`

---

## Step 1 — Find references in the consumer repo

```bash
rg -i "bpm-api-microservice|pgkjwjbhqq|340051416180|bpm-service.*run\.app|BPM_SERVICE|GCP_SERVICE_ACCOUNT" .
```

Update **both** the URL and the service account key.

---

## Step 2 — Create a new service account key (one-time)

```bash
gcloud iam service-accounts keys create vercel-bpm-invoker-delman-site.json \
  --iam-account=vercel-bpm-invoker@delman-site.iam.gserviceaccount.com \
  --project=delman-site
```

---

## Step 3 — Update environment variables

| Variable | New value |
|---|---|
| `BPM_SERVICE_URL` | `https://bpm-service-7jlgdaerna-ey.a.run.app` |
| `GCP_SERVICE_ACCOUNT_KEY` | Full JSON from the new key file |

Token **audience** must be the new service URL exactly (no trailing slash).

---

## Step 4 — Verify

```bash
gcloud auth activate-service-account --key-file=vercel-bpm-invoker-delman-site.json
TOKEN=$(gcloud auth print-identity-token --audiences="https://bpm-service-7jlgdaerna-ey.a.run.app")
curl -H "Authorization: Bearer $TOKEN" "https://bpm-service-7jlgdaerna-ey.a.run.app/health"
```

---

## Step 5 — After all consumers migrated

Decommission `bpm-api-microservice` and revoke old service account keys.
