# Certificate Studio

A self-hosted tool for preparing roster-based certificates, generating verification QR codes, and delivering certificates by email. Each deployment is configured for **one issuer**; use separate deployments and databases to isolate different organizations.

## Requirements

- Node.js 22 LTS
- npm
- PostgreSQL
- A persistent writable directory for certificate images and templates
- SMTP credentials for email delivery

## Local setup

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` with a development database, local `APP_URL`, admin credentials, issuer details, and SMTP settings. The local development server binds to `127.0.0.1` by default:

```powershell
npm run db:generate
npm run db:migrate
npm run dev
```

Open <http://127.0.0.1:3000>. In development only, the admin is accessible without Basic Auth when `ADMIN_USERNAME` or `ADMIN_PASSWORD` is missing. Set both locally to exercise the production authentication flow. Production fails closed with HTTP 503 if either is missing.

When issuing from a local admin for certificates that must verify on a public deployment, set `APP_URL` to that deployment's canonical HTTPS origin. The local default is only suitable for local testing; it would encode localhost into the QR code and verification email.

## Production deployment

1. Provision a dedicated PostgreSQL database and durable storage volume.
2. Set every variable in `.env.example` in the deployment secret manager. Never commit `.env` or production secrets.
3. Set `APP_URL` to the canonical HTTPS origin and configure a strong, unique `ADMIN_PASSWORD` and `ADMIN_USERNAME`.
4. Apply the additive schema migration with `npm run db:deploy` after reviewing it for the target environment. Do not use `prisma db push` in production.
5. Build and start the app with `npm run build` and `npm run start` behind an HTTPS reverse proxy.
6. Test issuance and email delivery against a staging database and test recipient before production use.

The application stores PNGs and templates on the local filesystem. Set `CERTIFICATE_STORAGE_DIR` to a durable volume mounted at the same path for every app instance. Ephemeral serverless filesystems and multiple instances with separate disks are not supported by the local storage adapter; use a shared durable storage adapter before adopting that topology. Back up both PostgreSQL and the storage directory.

## Configuration

See [`.env.example`](.env.example) for the complete list. Important issuer and email settings:

| Variable | Purpose |
| --- | --- |
| `ISSUER_NAME` | Organization shown on verification pages and email footers |
| `ISSUER_WEBSITE_URL`, `ISSUER_LINKEDIN_URL` | Optional HTTPS issuer links |
| `ISSUER_SUPPORT_EMAIL` | Optional support contact shown in email |
| `ISSUER_LOCALE` | Locale used to format issue dates on verification pages |
| `CERTIFICATE_NUMBER_PREFIX` | 1–12 character uppercase prefix for new serial numbers |
| `DEFAULT_EMAIL_SUBJECT`, `DEFAULT_EMAIL_MESSAGE` | Editable defaults; `{issuer}` is replaced at runtime |
| `APP_URL` | Public HTTPS origin embedded in verification QR codes and emails |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | HTTP Basic Auth credentials for `/` and all `/api/*` routes |
| `CERTIFICATE_STORAGE_DIR` | Persistent local directory for PNGs and templates |

Each roster can also set its own program/cohort name and email subject/message in the admin UI. The admin UI blocks issuance until the issuer name and public HTTPS `APP_URL` are configured, preventing generic branding or localhost verification links. Templates determine certificate wording, signatory, and visual identity.

## Admin workflow

1. Copy the roster into a Google Sheet with `Full Name` and `Email Address` headers and temporarily grant link-view access for import.
2. Load the sheet and confirm the row count and preview.
3. Enter the program/cohort name, upload a PNG template, and position the name and QR code.
4. Generate certificates for the loaded roster. Generation is idempotent for a roster batch and row index, so a retried request reuses an existing certificate instead of issuing a duplicate.
5. Review the queued count, subject, and message; send only after verifying the intended cohort.
6. Revoke public link access to the roster when import is complete.

Generated certificates and templates are stored in PostgreSQL metadata plus the configured storage directory. The public `/verify/[id]` page exposes the recipient name, certificate number, and issue date needed to verify a certificate; it does not expose the recipient email.

## Security and privacy

- Production admin routes are protected by Basic Auth and mutating requests are restricted to same-origin requests. Keep production behind HTTPS and set strong credentials.
- Security response headers include CSP, frame restrictions, MIME sniffing protection, and HSTS in production.
- File access is restricted to generated images under the configured storage directory; template uploads are PNG-validated and size/dimension limited.
- Google Sheets import accepts only `docs.google.com`, caps roster size and response size, and validates names and email addresses.
- Do not put student rosters, certificate images, environment files, or notebook execution output in Git. The repository ignores the temporary `Bootcamps/` and `notebooks/` directories.
- Back up and restrict access to the database and storage volume. Use staging data for email tests; SMTP sends real messages.

## Quality checks

```powershell
npm run check
npm run build
npm audit --omit=dev
```

The `check` script runs ESLint, TypeScript, and unit tests. The production dependency audit is clean. The full development-tool audit currently reports the upstream high-severity [picomatch ReDoS advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), through the Next.js ESLint toolchain; there is no released patched picomatch version yet. It is not included in the production dependency tree. Re-run the full audit after upstream releases a fix; avoid force-downgrading the Next.js ESLint config or adopting an unmerged third-party patch.
