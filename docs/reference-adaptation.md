# Reference architecture adaptation

Reference: [Sterben-san/ves-website](https://github.com/Sterben-san/ves-website), inspected at commit `5d477a5805f3a1f38006ab8178c4b4434d611ecb` on 7 October 2026. Inspection used a downloaded source snapshot in a temporary folder. No reference scripts were executed, no reference checkout was edited, and no commits or remote writes were made to VES.

The reference separates public pages and an authenticated dashboard from domain rules, application workflows, persistence adapters and HTTP interfaces. This portfolio now follows that separation in its existing dependency-free Node application. All additions were independently written for this portfolio. No VES text, branding, images, seeded records, credentials or other page content were imported.

| Reference pattern inspected | Portfolio adaptation |
| --- | --- |
| `server/domain/entities.ts`, `server/application/*`, `server/interfaces/http.ts` | `server/domain/portfolio.mjs`, `server/application/PortfolioService.mjs`, local storage adapters and the HTTP interface |
| Admin dashboard and `QuickPostLauncher.tsx` | Saved counts for projects, videos, pictures, achievements and media; quick draft creation from every editor section |
| `projectUseCases.ts`, `slug.ts`, `ProjectDashboardClient.tsx` and public project routes | Stable unique project addresses, explicit draft/published status, featured projects, full detail pages and nested galleries |
| Public project explorer | Search and category filters on the existing project grid and `/projects`, with editable labels and empty messages |
| `ImageCropModal.tsx`, `MediaManagerClient.tsx`, `mediaUseCases.ts` | Local optional image cropping, frame ratios, zoom, rotation, upload progress, reusable file picker, descriptions and file search |
| Editable homepage media/copy and certificates | Existing schema editor extended with hero imagery/shading and uploaded certificate PDFs |
| Admin record controls | Draft badges, publication filtering, search, reorder, duplicate-as-draft and explicit save feedback |

This project also protects media references before archiving and provides an archive/restore flow. Storage remains local rather than adopting MySQL or Cloudinary. The existing single administrator account, scrypt password hash, session cookies, CSRF checks and revision protection are preserved. Corporate/team/internship modules were outside the portfolio's scope.

## Behavior

- Site settings save immediately. Published collection entries appear publicly after saving; unchecked entries are saved drafts.
- Draft records are omitted from public HTML and JSON even while an administrator is signed in. Draft project pages return 404.
- Published projects have stable `/projects/:slug` pages. Duplicate addresses are rejected. Duplicating a project clears its ID/address and starts a new draft.
- Uploads are saved immediately and can be reused; descriptions in the library can seed per-image descriptions. Active file URLs are public, so draft media is not a private file vault.
- Referenced files cannot be archived until their content references are removed and saved. Archived URLs stop resolving; restoring reinstates the original URL.
- Static exports contain the public homepage, project explorer, published detail pages and referenced public uploads. The admin studio requires the local Node server.

## Verification

Integration coverage includes authentication/CSRF protection, uploads, revisions, restart persistence, migration without overwriting authored values, stable addresses, draft isolation, publication validation, duplicate-address rejection, media metadata, archive protection/recovery and static export visibility. Browser checks cover the existing login, quick project creation, image crop/upload, media reuse, published details/galleries, search, archive/recovery and mobile dashboard width. Temporary test content was removed from the portfolio afterward.
