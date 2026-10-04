# Global Engineering Standard: CI/CD, Analytics & Observability

This document defines the strict, prescriptive, **100% free-tier** architecture for all web properties (Cloudflare Pages/Workers, Vercel) and microservices (GCP Cloud Run). All repositories must comply with these configurations exactly.

The core philosophy of this stack is **speed, minimalism, and local autonomy**—bypassing heavy remote build configurations and bloated enterprise monitoring tools.

---

## 1. CI/CD: Orchestrated Local Build & Deploy

To maximize deployment velocity, heavy remote virtual machines (like slow GitHub Actions runners) are barred. Code is compiled locally and pushed directly via native CLIs using a standardized local orchestrator.

### ── Standard Interface
Every repository must expose a top-level deployment command in `package.json`:
```json
"scripts": {
  "deploy:production": "node ./scripts/deploy-production.js"
}
```

### ── Orchestration Sequence
The `deploy:production` command must execute a custom deployment script that sequentially performs the following operations:

1. **Run Verify:** Execute the local quality gate suite exactly as defined below.
2. **Read Remote Deployment Manifest:** Fetch the state manifest from a centralized Cloudflare R2 bucket to verify current production versions and hashes.
3. **Apply Pending Migrations:** Execute necessary database schema updates against the production database instance.
4. **Upload New/Changed Secrets:** Read local encrypted environment configurations and push updated secrets natively to the target edge platform or GCP Secret Manager.
5. **Build/Deploy Accessory Components:** Compile and deploy dependencies, microservices, or companion workers if changes are detected.
6. **Build/Deploy Main App:** Compile production code assets locally and deploy the primary runtime engine.
7. **Write Updated Manifest to R2:** Append the new version hash, timestamp, and deployment logs to the deployment manifest in Cloudflare R2.
8. **Upload Changes to Git:** Commit tracking modifications, dependency updates, or manifest lockfiles directly back to the repository branch.

### ── Verification Suite (`npm run verify`)
The verification phase is non-negotiable. The orchestration script must confirm a successful execution of each of the following targets before proceeding:
```bash
npm run check:env-contract && \
npm run check:api-routes && \
npm run check:runtime-console && \
npm run check:csp-cloudflare-jsd-filter && \
npm run typecheck && \
npm run check:strict && \
npm run test
```

---

## 2. Low-Overhead Native Platform Deployments

When called by the orchestrator, individual runtimes must use their optimized native tooling:

* **Cloudflare Pages:** `npx wrangler pages deploy ./dist`
* **Cloudflare Workers:** `npx wrangler deploy`
* **Vercel Sites:**
  ```bash
  vercel build --prod
  vercel --prebuilt --prod
  ```
* **GCP Cloud Run (Microservices):**
  ```bash
  gcloud builds submit --tag gcr.io/[PROJECT_ID]/[SERVICE_NAME]
  gcloud run deploy [SERVICE_NAME] --image gcr.io/[PROJECT_ID]/[SERVICE_NAME] --platform managed
  ```
  *(Utilizes Google Cloud Build's 120 free minutes/day to compile images directly inside Google's internal network, preventing upload bottlenecks).*

---

## 3. Web Analytics: Umami Cloud Standard

Heavy product-analytics engines (e.g., PostHog) are barred due to high script weight and overly complex configurations. 

### ── Standard Implementation
* **Engine:** Umami Cloud (Free Tier)
* **Scope:** Applied uniformly across all Vercel and Cloudflare user-facing applications.
* **Volume Limits:** Free tier capped at **10,000 pageviews per month**.
* **Features:** Privacy-first tracking (no cookies required), instant performance dashboards, and simple single-line custom event tracking:
  ```javascript
  umami.track('signup-button-click', { plan: 'free' });
  ```

---

## 4. Logging & Error Observability

Enterprise error monitoring suites (e.g., Sentry) are replaced with a blend of native stdout aggregation and minimalist log streams to fill coverage gaps without configuration fatigue.

### ── GCP Cloud Run Logging
* **Engine:** Google Cloud Logging (Stackdriver)
* **Implementation:** Services must strictly write errors and operational logs to standard output streams (`stdout` and `stderr`). Cloud Run automatically intercepts and structures these logs.
* **Caps:** **20 GB per month completely free** with a 30-day retention window.

### ── Edge & Web Framework Logging (Cloudflare / Vercel)
* **Engine:** Axiom (Standard Platform)
* **Caps:** Up to **500 GB/month** ingestion with 30-day retention on the free tier.
* **Setup:** Bind via the Vercel Integration Marketplace or Cloudflare Logpush to stream runtime JSON exceptions to a single unified interface.

### ── Exception Catching (Sentry Alternative)
* **Engine:** GlitchTip
* **Usage:** Drop-in compatibility using existing Sentry SDKs, stripped of enterprise noise. Used exclusively for generating automated developer email notifications when a runtime exception escapes standard stdout logs.