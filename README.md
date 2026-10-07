# Portfolio Studio

An editable creative portfolio with one protected administrator account. Every content section is managed from the admin page. Use Node.js 22 or newer and install dependencies with `npm ci`. Local development uses private files; Hostinger deployments use MySQL for durable content and uploads.

## Hostinger

Follow [the deployment guide](docs/hostinger-deployment.md) for Business/Cloud GitHub deployment settings, database creation, private environment variables, domain/SSL setup and verification. `npm run build` generates the complete Node application in `dist`, including the admin dashboard. `.env.example` lists the required settings without real credentials.

## Start

```sh
npm run dev
```

- Main page: http://localhost:3000/
- Admin studio: http://localhost:3000/admin
- Account email: `venkatani@portfolio.com`
- Use the password supplied when this local account was created.

The requested account is already initialized on this computer. Its password is stored as a salted scrypt hash in `.local/admin.json`, never in browser code. Local mode listens on this computer's loopback interface. Production mode requires an explicit HTTPS website address and durable storage.

## Edit the portfolio

Sign in, choose a section from the sidebar, and edit the fields. **Save changes** updates site settings immediately. Projects, videos, pictures and achievements appear publicly only when **Publish on portfolio** is checked. New entries start as drafts. Public pages open in another tab automatically refresh when this editor saves. Otherwise refresh the main page to see the latest content.

- **Dashboard:** saved content counts, published/draft totals, media description reminders and quick creation. **Quick post** is also available from any editor section.
- **Identity & website:** author name, header brand, browser title, search description, keywords, favicon, social sharing image, résumé and navigation labels.
- **Home & introduction:** main headline, highlighted words, roles, availability, opening wordmark, scroll label, background image, shading and buttons.
- **Appearance:** accent, background and text colors, body and heading fonts, card radius, animations and cursor glow.
- **Section order:** move sections up or down. Each section's settings can also hide it and change its navigation label, small heading, title, introduction and empty message.
- **About & profile:** biography, portrait, photo badge, statistics, profile details and buttons.
- **YouTube videos:** add, remove and reorder videos; paste regular, shortened or Shorts YouTube URLs. Thumbnails are automatic unless you upload a custom one.
- **Projects & work:** titles, categories, descriptions, responsibilities, duration/dates, links, images, featured projects, full stories and nested photo galleries. Each published project gets `/projects/your-page-address`. Blank addresses generate automatically and stay stable after renaming. The project explorer and main page include editable search and category filters.
- **Pictures & gallery:** uploaded photographs, titles, captions and image descriptions.
- **Skills:** add groups and skills, and set each percentage.
- **Experience & timeline:** roles, milestones, dates and descriptions.
- **Achievements:** titles, symbols, descriptions and certificate links.
- **Contact:** public email, phone, social accounts and any other contact links. Use `mailto:address@example.com` for email or `tel:+911234567890` for a phone link.
- **Footer:** closing name, tagline, copyright name and links.
- **Media library:** upload files, search by name/description, edit file names and descriptions, copy URLs, archive unused files and restore archived files. Image/PDF fields also have **Choose existing file**. Files used by saved content, including drafts, cannot be archived.

Upload JPG, PNG, WebP, GIF or PDF files up to 10 MB each. Fields with an Upload control insert the saved URL automatically. Image fields offer optional cropping with zoom, rotation and frame shape before uploading. GIF animation is retained through original uploads. The upload status shows progress. Unsaved changes stay in the current tab until you save. Files themselves are stored immediately; removing an entry from the portfolio does not erase its uploaded file, so it can be reused.

Text is treated as plain text. User-entered markup cannot run scripts. The editor controls the portfolio's existing layout and content; structural changes to the template remain code changes.

## Storage and login

Content persists in `.local/portfolio.json`. Files persist in `.local/uploads/`. Recoverable files move to `.local/trash/uploads/`. A pre-upgrade content backup is saved at `.local/backups/before-reference-adaptation.json`. Copy the complete `.local/` directory when backing up this local installation; it is deliberately excluded from Git and the public website.

Server sessions last up to 12 hours and are invalidated by sign-out or a server restart. Writes and uploads require an authenticated session, a matching request origin, and a session token. The server also limits failed login attempts and protects against overwriting a newer edit from another tab.

To replace the one administrator account on another installation, or reset it locally:

```sh
npm run admin:setup
```

Enter an email and password when prompted, then restart the server. This replaces the existing administrator; it does not create additional users. The terminal setup prompt displays typed characters, so use it in a private terminal.

## Verify and export

```sh
npm ci
npm test
npm run build
```

For a public-only export instead, run `npm run build:static`. It replaces `dist`, so run `npm run build` again before deploying the complete app.

With an isolated MySQL test database configured, the suite runs 54 checks across all editor sections, public navigation/video/filter controls, crop/upload workflows, authentication, request validation, concurrent saves, draft privacy, media recovery, persistence, and static export. See [docs/verification-report.md](docs/verification-report.md) for reproduced issues, diagnostic evidence and browser coverage.

`npm run build:static` creates a **public static snapshot** in `dist/`, including published content, project detail pages and referenced public media. Draft records and media referenced only by drafts are excluded. It excludes administrator credentials and server code. The admin studio requires the running Node.js server and persistent storage; a static snapshot alone cannot provide login, editing or uploads. This local app has not been deployed.

## Main source files

| File | Purpose |
| --- | --- |
| `scripts/content-model.js` | Editable fields, neutral defaults and validation |
| `scripts/render.mjs` | Public portfolio template |
| `scripts/main.js` | Public navigation, video modal and animation |
| `scripts/admin.js` | Admin forms, media uploads, saving and login |
| `admin.html` / `styles/admin.css` | Admin interface |
| `styles/main.css` | Public portfolio design |
| `scripts/server.mjs` | Compatible server entry point |
| `server/domain/` | Content rules, stable addresses and publishing visibility |
| `server/application/` | Content/media workflows and dashboard summaries |
| `server/infrastructure/` | Atomic local content, media and credential persistence |
| `server/interfaces/` | Local HTTP routes and authenticated sessions |
| `scripts/admin/media-tools.js` | Crop dialogs and upload progress |
| `scripts/dev-server.mjs` | Local server entry point |
| `scripts/setup-admin.mjs` | Local account setup |
| `scripts/build.mjs` | Public snapshot export |

The read-only reference analysis and feature mapping are documented in [docs/reference-adaptation.md](docs/reference-adaptation.md). Uploaded files have public URLs when active, even if only referenced by a draft; draft text and project pages remain private. Archive a removed unused file to withdraw its URL.

Fonts and existing third-party library license notices remain in `assets/fonts/` and `scripts/vendor/`.

## Diagnostic logs

Open a local public or admin page with `?debug=1` to log control initialization, editor state transitions, filters and API response timing in the browser console. For local HTTP request/status/timing logs, run:

```sh
PORTFOLIO_DEBUG=1 npm run dev
```

Logs are disabled by default. They omit passwords, session cookies, CSRF tokens, request bodies and authored text. Successful writes temporarily lock editing controls; failed or completed operations unlock them. This prevents pending responses from overwriting newer edits. Expired upload sessions return to login while retaining the current tab's unsaved content.
