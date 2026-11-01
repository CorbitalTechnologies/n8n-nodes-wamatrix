# Publishing to the n8n marketplace

How to get `n8n-nodes-wamatrix` from this repo into n8n's nodes panel as a **verified community node**. Steps 1 to 4 are one-time; step 5 repeats for every release.

Source: [n8n, Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes) (checked 2026-10-31).

## How it works

```text
npm run release ──► git tag 0.1.0 pushed ──► GitHub Actions publish.yml ──► npm (with provenance)
                                                                              │
                                     n8n Creator Portal submission ◄──────────┘
                                                 │ review, up to 4 weeks
                                                 ▼
                                   listed as verified in n8n's nodes panel
```

From 2026-05-01, n8n rejects verified nodes published from a laptop. The package **must** be published by `.github/workflows/publish.yml` with an npm provenance statement, and provenance only works from a **public** GitHub repo. That repo is [`CorbitalTechnologies/n8n-nodes-wamatrix`](https://github.com/CorbitalTechnologies/n8n-nodes-wamatrix).

## Before the first release

Check each item. n8n's reviewers check them too.

- [ ] The WaMatrix webhooks API (`/api/v1/webhooks`) is deployed to production. Without it, the trigger's automatic registration fails for every user.
- [ ] A live smoke test against a real workspace has passed: send a text and a template, and see a delivery status reach the trigger.
- [ ] `npm run lint` shows 0 errors and 0 warnings.
- [ ] `npm test` passes, and `npm run e2e` passes if n8n is installed locally.
- [ ] `package.json` → `repository.url` is exactly `git+https://github.com/CorbitalTechnologies/n8n-nodes-wamatrix.git`. npm and n8n compare it against the provenance.
- [ ] `dependencies` is empty. Verified nodes may not have runtime dependencies.
- [ ] `@n8n/node-cli` is version 0.23.0 or later (`npm list @n8n/node-cli`; currently 0.54.6).
- [ ] `CHANGELOG.md` has an entry for the version.

## 1. npm account

1. Sign in at [npmjs.com](https://www.npmjs.com/) with the company account (or create an **organisation** `corbitaltechnologies` and add the people who should be able to manage the package).
2. Turn on two-factor authentication for the account.

The package is unscoped (`n8n-nodes-wamatrix`), so the npm org name does not appear in it. The name was free on 2026-10-31.

## 2. First publish (token)

npm's Trusted Publisher setting lives on the package's settings page, and that page only exists once the package has been published. So the very first release uses a short-lived token. It is still published from GitHub Actions with provenance, so it still counts for verification.

1. On npmjs.com: **Access Tokens → Generate New Token → Granular Access Token**.
    - Permissions: **Read and write**, packages: all packages (the package doesn't exist yet, so it can't be selected).
    - Expiry: 7 days.
2. On GitHub: **CorbitalTechnologies/n8n-nodes-wamatrix → Settings → Secrets and variables → Actions → New repository secret**, name `NPM_TOKEN`, value the token.
3. Release from this folder (Node 24):

    ```bash
    npm ci
    npm run release
    ```

    `release` lints, builds, asks for the version (choose `0.1.0`), updates the changelog, commits, tags and pushes. The tag starts the **Publish** workflow.
4. Watch **Actions → Publish** on GitHub. When it is green, check the package:

    ```bash
    npm view n8n-nodes-wamatrix
    ```

    The npm page should show a **Provenance** badge linking back to the workflow run.

## 3. Switch to Trusted Publishing (no secrets)

1. On npmjs.com open **n8n-nodes-wamatrix → Settings → Publish access → Trusted Publishers → Add a publisher**, choose **GitHub Actions**:
    - Repository owner: `CorbitalTechnologies`
    - Repository name: `n8n-nodes-wamatrix`
    - Workflow name: `publish.yml` (the file name, not the `name:` inside it)
    - Environment: leave blank
2. Delete the `NPM_TOKEN` secret on GitHub, then revoke the token on npmjs.com.
3. Optional but recommended: under **Publish access**, choose "Require two-factor authentication and disallow tokens". Only the workflow can publish after that.

From now on the workflow authenticates through GitHub's OIDC; nothing long-lived exists to leak.

## 4. Submit for verification

1. Run n8n's scanner against the published package. It must pass:

    ```bash
    npx @n8n/scan-community-package n8n-nodes-wamatrix
    ```

2. Sign up or log in at the [n8n Creator Portal](https://creators.n8n.io/nodes) and submit `n8n-nodes-wamatrix`. Use the copy from [Listing copy](#listing-copy) below.
3. Review takes up to four weeks. n8n emails you at each stage. If they ask for changes, fix them here, release a new version (step 5) and reply with the version number.

n8n can reject nodes that compete with its paid features; this package doesn't touch any.

## 5. Every later release

```bash
npm run release   # pick patch / minor / major
```

That's all. The tag triggers the workflow, npm gets the new version with provenance, and verified nodes update in n8n automatically. Versioning:

- **patch** (0.1.1): fixes, wording.
- **minor** (0.2.0): new operations, new optional fields.
- **major** (1.0.0): anything that breaks a saved workflow, such as a renamed or removed parameter. Prefer adding a new node version (`.agents/versioning.md`) over a breaking release.

When the WaMatrix `/api/v1` contract changes, update this package in the same piece of work.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Publish fails with `E404` / `ENEEDAUTH` | First release: `NPM_TOKEN` missing or expired. Later releases: the Trusted Publisher entry doesn't match the owner, repo or `publish.yml` exactly. |
| Publish fails on provenance | The repo is private, or `id-token: write` was removed from `publish.yml`. |
| npm page shows no Provenance badge | It was published locally. Deprecate that version (`npm deprecate n8n-nodes-wamatrix@x.y.z "republished"`) and release the next one from Actions. |
| Scanner flags a dependency | Something landed in `dependencies`. Move it to `devDependencies` or remove it. |
| Tag pushed, workflow didn't start | Tags must look like `0.1.0`, no `v` prefix (see `publish.yml`). |

## Listing copy

Use these wherever the package is described, so GitHub, npm and n8n say the same thing.

**One-liner** (GitHub "About", npm `description`, Creator Portal short description):

> Send WhatsApp messages and templates, keep contacts in sync, verify customers with WhatsApp OTP, and start workflows the moment a customer replies.

**GitHub topics:** `n8n`, `n8n-community-node-package`, `n8n-nodes`, `whatsapp`, `whatsapp-business`, `whatsapp-cloud-api`, `wamatrix`, `workflow-automation`, `otp`, `crm`

**Website:** `https://wamatrix.io`

**Long description** (Creator Portal):

> WaMatrix is a WhatsApp Business platform built on Meta's official Cloud API. This package brings it into n8n, so any workflow can talk to your customers on WhatsApp.
>
> **WaMatrix node**
> - Send a text message or an approved WhatsApp template, with variables filled from earlier steps.
> - Create, update or look up contacts, and add them to groups. "Create or update" matches on phone number, so a CRM sync never makes duplicates.
> - Read conversations and their messages.
> - Send and check WhatsApp one-time passwords for sign-in and checkout.
> - List your WhatsApp numbers and templates, which the node also uses to fill its dropdowns.
>
> **WaMatrix Trigger**
> - Start a workflow when a customer messages you, when a message you sent is delivered, read or fails, or when Meta approves or rejects a template.
> - It registers its own webhook when you activate the workflow and removes it when you deactivate it, so there's nothing to set up in WaMatrix.
> - Every request is signed and checked before your workflow runs.
>
> **Good first workflows** (included as examples): reply automatically to keywords, send a welcome template when a CRM contact is created, alert your team when a message fails, and add WhatsApp OTP to a login form.
>
> You need a WaMatrix workspace on a plan with API access, and an API key from Settings → API Keys.

**Category suggestions:** Communication, Marketing, Sales.
