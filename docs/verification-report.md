# Portfolio verification — 7 October 2026

The tested story is: an administrator signs in, edits/uploads content, saves it through protected APIs into local storage, and sees published records rendered on the public site. Verification followed the full-story verification skill across browser, HTTP, storage and response boundaries.

## Hypotheses before fixes

| Possible source | Evidence and result |
| --- | --- |
| Page initialization / listeners / opening animation | Public initialization logs showed menu, video and project controls ready. Actual menu, keyboard navigation and video playback worked. No confirmed initialization failure. |
| Derived editor state becoming stale | Confirmed: publication badges, search indexes and filter attributes were generated only during rendering, then diverged from edited records. |
| Session expiry and response handling | Login/session/CSRF tests passed, but uploads used a different transport. An expired upload session left the workspace visible instead of opening login. |
| Content validation or migration | Validated all sections, legacy migration, draft publishing requirements, unsafe URLs, video URLs, order and numeric bounds. Existing authored values and stable addresses were preserved. |
| Concurrent requests / saves | Server revisions and serialized storage protected concurrent writes. Client editing remained enabled during saves, and old media responses could overwrite newer views. |
| File storage / reference integrity | Tested uploads, file types/limits, metadata, used-file archive rejection, archive/restore and restart persistence. Browser crop produced a 700 × 875 PNG. |
| Public rendering / exports | Tested escaping, draft exclusion, full project pages/galleries, metadata, theme, hidden/reordered sections and published-only exports. |

The two strongest causes were **stale derived editor state** and **incomplete asynchronous operation/recovery handling**. Logs and failing regression tests were added before implementation changes.

## Confirmed failures and fixes

| Reproduction | Diagnostic evidence before fix | Result after fix |
| --- | --- | --- |
| Edit a draft title, check publishing, select Published | `indexedPublished:false`, `modelPublished:true`, `staleIndex:true`; the entry disappeared | Filter indexes and summaries update from the current model immediately; `staleIndex:false` |
| Begin a delayed save, then edit a field before its response | `locked:false`, `changedDuringRequest:true`; the response overwrote the newer edit | Editing/navigation controls lock throughout save, upload, discard and media mutation operations; regression reports `locked:true`, `changedDuringRequest:false` |
| Load current files, select Archive, then deliver the older current-files response | `requestedTrash:false`, `currentTrash:true`, `count:1`; active files appeared in Archive | Request generations and selected-view checks reject stale responses; diagnostic event `media.response.ignored` |
| Return 401 from an image upload | `status:401`, `loginVisible:false` | Upload errors retain HTTP status; login opens and unsaved content survives reauthentication; `loginVisible:true` |

Upload network interruption, cancellation and timeout paths now reject with clear errors instead of leaving an unresolved operation. File inputs reset after attempts so the same file can be retried. Diagnostic logs remain opt-in and exclude credentials, tokens, request bodies and authored text.

## Automated checks

`npm test`: **51 passing checks, zero failures**. Tests use isolated temporary storage/accounts and controlled delayed responses.

| Area | Coverage |
| --- | --- |
| Admin | All 13 sidebar sections; fields and pending edits; add/duplicate/reorder/remove; nested galleries/skills; all three quick-create types; identity auto-fill; validation; conflict recovery; discard; sign-out |
| State regressions | Live publication/search filters; locked delayed saves; stale media response rejection; expired-upload login recovery with retained edits |
| Public | Menu/backdrop/Escape/keyboard focus; video open/close and focus restoration; text/category filters and empty results; all sections; theme/metadata; résumé/certificate links; visibility/order; reduced motion; project stories/galleries |
| Upload/crop | Authenticated upload headers and progress; HTTP error status; network/abort/timeout failure paths; ratio/rotation/zoom; crop export; original/cancel; GIF preservation; object URL cleanup |
| Real HTTP/storage | Protected reads/writes; local-origin/CSRF checks; rate limiting; session sign-out/restart; assets/nested routes; image/PDF serving; all-section save/disk equality; concurrent-save winner/conflict; invalid content/body/media/MIME; 10 MB limit; credential-free request logs |
| Content/export | Existing content migration; stable unique slugs; draft isolation even while authenticated; invalid publishing rejection; referenced-file archive protection; archive/restore; public-only project pages/media; excluded admin files |

## Actual browser checks

Populated fixtures ran on an isolated localhost:3001 server. The user's localhost:3000 content file was compared byte-for-byte with its pre-verification backup and remained unchanged.

- Existing local account sign-in and dashboard counts.
- Quick-post dialog, live title/publication filtering, invalid publishing feedback, correction/save, and public project appearance.
- Project search/category combinations, empty results, detail stories and galleries.
- YouTube video played in the actual privacy embed: player showed Pause and advancing elapsed time; close controls removed the iframe source.
- Media details/search, copied URL (original clipboard restored), used-file protection, archive/restore, picture creation, reuse and description transfer.
- Actual portrait crop with rotation, upload and save. Storage recorded a 700 × 875 PNG.
- Automatic public-tab refresh after an admin headline save, without manually reloading the public page.
- Mobile public menu and menu-to-dashboard link at 390 × 844. Both public and admin document widths were 390 pixels, with no page-level horizontal overflow. Desktop and mobile viewport checks completed; temporary viewport overrides were reset.
- No browser warning/error logs in the checked public and admin flows. The initial unauthenticated session request returned the expected 401; other recorded browser requests succeeded.

The tests verify the application flows and a real browser smoke pass. They do not constitute a complete browser/device compatibility certification. PDF response bytes and download headers were tested; built-in PDF viewer behavior was not separately certified. External contact/social links were checked for their destinations rather than sending messages or placing calls.

## Reproduce

```sh
npm ci
npm test
npm run build
PORTFOLIO_DEBUG=1 npm run dev
```

Open `/admin/dashboard?debug=1` or `/?debug=1` for browser logs. HTTP logs contain only method, path, status and duration. Test-only fixture accounts/storage are never copied into the public export. VES was not edited or used as a test target.
