# Hostinger deployment: animakesfilms

This is a **Node.js backend app**, including the portfolio and its admin dashboard. Deploying a static HTML export loses login, editing and uploads. Business Web Hosting or Cloud with Node.js Web Apps supports this application using the **Other** framework type. A VPS is an alternative.

## Business / Cloud: GitHub deployment

1. In hPanel, create a MySQL database and database user for this portfolio. Save the database host, database name, username and password. Use the connection host supplied by Hostinger, not an assumed `localhost`.
2. In Websites → Add/Create website → Node.js Web App, import `https://github.com/Sterben-san/animakesfilms`. The repository is public, so Hostinger can import its URL without GitHub account authorization. For GitHub-connected automatic deployment, connect your account and grant Hostinger access to this repository.
3. Choose branch `main`, framework **Other**, Node.js **22.x**, and repository root `.`. Install command: `npm ci`. Build command: `npm run build`. Output directory: `dist`. Entry file: `app.js` inside that output directory (use `dist/app.js` if the field explicitly requests a repository-relative path). Start command, where available: `npm start`.
4. Add the environment variables below **before the first deployment**. Use the actual final HTTPS domain, or the exact temporary Hostinger HTTPS domain while previewing. Set `APP_URL` again when changing domains, then redeploy.
5. Deploy, connect the domain and enable SSL. Requests must reach the backend with the configured domain in the HTTP `Host` header. A secondary `www` domain should redirect to the canonical domain at the hosting layer.
6. Verify `/health`, the main portfolio, hamburger-menu **Admin login**, sign-in, content editing, image/PDF upload, YouTube videos, project detail links, archive/restore and sign-out. Save a change and upload a picture, redeploy once, then confirm both remain.

| Variable | Required value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | Exact HTTPS origin, e.g. `https://your-domain.com`; no path |
| `HOST` | `0.0.0.0` |
| `PORT` | Use Hostinger's provided port; the app honors it (defaults to 3000) |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| `DATABASE_SSL` | `true` when the database provider requires trusted TLS; otherwise omit |
| `PORTFOLIO_ADMIN_EMAIL` | `venkatani@portfolio.com` |
| `PORTFOLIO_ADMIN_PASSWORD` | Set privately in hPanel; 12–256 characters |

URL-encode special characters in database usernames/passwords. The `.env.example` file is a template; the server reads process environment and does not automatically load `.env`. Never commit populated environment files or account hashes.

The supplied local account remains unchanged. On a new hosted database, the admin account is initialized from the environment and stored as a salted scrypt hash. Later restarts preserve that account even if bootstrap variables change. To deliberately reset it, run `npm run admin:setup` with `DATABASE_URL` set, then restart the application. Changing the bootstrap password alone does not reset an existing account. Remove the bootstrap password from hPanel after initialization if you prefer.

## Durable data and database requirements

MySQL stores all content, admin credentials, upload metadata, original image/PDF bytes and archived files. The runtime never relies on the deployment folder for hosted content. Code rebuilds can replace `dist` without erasing authored content. Tables are created automatically, with `portfolio_` prefixes; use a dedicated database and a user allowed to create tables, select, insert and update.

MySQL 8+ or a compatible MariaDB version must support JSON functions. `max_allowed_packet` must be **at least 12 MiB** for uploads up to 10 MiB; startup checks this requirement. Ask Hostinger to increase it if startup reports that limit. Uploaded files consume database quota, including archived files; monitor storage and keep database backups. Large media libraries may warrant object storage later. YouTube videos are embedded by URL, so original video files are not stored in the database.

Run **one app instance/process**. Admin sessions and content caches are in process memory; restart signs admins out. Multiple replicas require shared sessions and cache invalidation before scaling. MySQL writes use an atomic revision check to reject conflicting saves.

The fresh hosted portfolio starts with neutral editable placeholders. Local content has not been committed or automatically transferred. This workspace currently contains no authored projects, videos or pictures. If you later need to transfer local content, back up the complete `.local` directory privately and plan a database import; never push it to GitHub.

## Build and validation

```sh
npm ci
npm test
npm run build
```

`dist` contains the backend entry point, admin UI, public assets and production dependencies. It excludes `.local`, secrets, tests, docs and unused vendor scripts. `npm run build:static` remains available for a public-only snapshot; it is not the Hostinger admin deployment.

With real environment variables available, run `npm run validate:hosting`. It checks configuration structure; application startup additionally verifies the database connection, table permissions, packet limit and first-time admin credentials.

The active GitHub Actions workflow in `.github/workflows/ci.yml` runs the full test suite against an isolated MySQL 8.4 service on Node 22 on pushes and pull requests. It uses read-only repository permissions; deployment does not require workflow write access. Locally, the database test can be enabled using `TEST_DATABASE_URL` pointing to a **disposable test database only**, with a name ending in `_test`: it deletes its three `portfolio_*` tables before running. Never point this variable at a live database.

## VPS alternative

Install Node 22+, clone the repository, run `npm ci` and `npm run build`, and start `node dist/app.js` under a process manager with restart-on-failure. Keep secrets in a private environment file managed by the process manager. Use either the MySQL configuration above or omit `DATABASE_URL` and set `PORTFOLIO_DATA_DIR=/var/lib/animakesfilms`, owned by the application user and outside the checkout. In filesystem mode the complete data directory requires private backups.

Terminate HTTPS in Nginx/CloudPanel, preserve the canonical Host header and proxy to the application's configured port. Set `client_max_body_size 12m` or higher, so the proxy permits 10 MiB uploads. Keep the internal port inaccessible from the public network. `/health` returns status only, without credentials or configuration details.

## Launch prerequisites still requiring your Hostinger account

- Confirm the plan includes Node.js Web Apps.
- Create the database and supply its private connection details.
- Select the HTTPS domain and configure `APP_URL`.
- Set the hosted admin password privately.
- Import the public GitHub repository and verify an actual hPanel deployment and redeploy.

The application has been prepared and tested locally; Hostinger account settings, DNS, SSL and live deployment cannot be verified before these values are supplied.

Preparation verified on 7 October 2026: all 54 checks passed using an isolated real MySQL server, including HTTPS-origin checks, Secure cookies, conflicting revisions, all content sections, a 10 MiB upload and persistence through server restart. The `dist` application started in production mode and served its health endpoint, public page, admin dashboard and admin JavaScript. `npm audit --omit=dev` reported zero known vulnerabilities. Local verification used Node 26 and MySQL 26; GitHub Actions targets Node 22 and MySQL 8.4. Check the repository Actions tab for current remote results.

Official guidance: [Node.js hosting options](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/) and [deploying a Node.js app, including Other framework settings](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

## LiteSpeed startup compatibility

Hostinger's runtime log confirmed that `lsnode.js` loads the entry using `require()`. The original top-level `await` in `app.js` failed before configuration or database initialization with `ERR_REQUIRE_ASYNC_MODULE`. The entry now starts asynchronously using dynamic `import()` without top-level await. Regression checks load it with `require()`, verify health/public/admin responses and clean shutdown, and verify readable startup failures. The same checks can target the built artifact with `TEST_ENTRYPOINT` set to its absolute `app.js` path.

Runtime messages prefixed `[portfolio-startup]` identify configuration validation, storage initialization and HTTP startup. They do not print passwords or connection strings. If a later deployment reports an unresolved database-host placeholder or denied database access, correct the private environment values; a successfully published build alone does not establish that the app has started.

Only `README-DEPLOY.md` from the read-only VES reference was consulted for this hosting preparation. Its site content and application implementation were not copied or modified.
