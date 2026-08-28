# Pingdou Open-Source Star Launch Design

Date: 2026-08-27  
Status: Approved

## Objective

Launch Pingdou as an independent open-source project that a stranger can understand, try, trust, and star without first installing software or learning the full editor.

The product promise is:

> Turn any image into an editable, multicolor 3MF bead relief — locally in your browser.

Pingdou is not trying to become the most feature-rich 3D-printing tool. Launch decisions prioritize discoverability, reproducibility, visible results, sharing, and the shortest path from a source image to a Bambu Studio-compatible 3MF.

## Confirmed launch decisions

- Publish Pingdou as an independent GitHub repository named `pingdou`, not as a GitHub fork.
- Preserve the original Jett-Wu MIT notice and the exact upstream provenance already recorded in `UPSTREAM.md`.
- Target international 3D-printing and maker users first.
- Make English the default for non-Chinese browsers and keep the complete Chinese interface and documentation entry point.
- Use GitHub Pages for the zero-install live demo.
- Use one red, white, and black heart example for the complete source-to-print proof chain.
- Require both estimated and actual P2S print time to be below 30 minutes.
- Do not formally launch until a real print photograph and actual print result exist.
- Follow the proof-first launch approach: fix only launch blockers, publish the evidence, then let real feedback determine later product work.

## Current evidence and launch gap

The software core is already credible:

- image processing, editing, preview, project persistence, and 3MF generation run locally in the browser;
- the preview and exporter share the same printable model;
- fixed solid and layered 3MF samples regenerate deterministically;
- the repository has 46 Node tests covering core geometry, preview, color, stacking, and 3MF behavior;
- both solid and layered samples have documented Bambu Studio P2S import and slice acceptance;
- the Pages deployment workflow and a reproducible `npm ci` path already exist.

The launch surface does not yet communicate that value:

- the local repository has no canonical remote;
- the in-app GitHub link points to the upstream project;
- the README has no live-demo link or embedded image;
- current screenshots do not show one consistent source-to-Bambu-to-print result;
- there is no physical-print photograph;
- the prominent export action is for a 2D pattern rather than the product-defining 3MF;
- first-time visitors see the full editor without a guided example;
- CI builds Pages without running the verification path.

Adjacent open-source tools repeatedly show the same useful launch pattern: an immediate demo, a bundled example, a visible before/after result, fabrication evidence, and a factual local-first promise. Pingdou will reuse that pattern without adding a separate marketing application.

## Chosen approach

### Proof-first launch sprint

Freeze unrelated feature development. Complete only the work needed to make the existing product understandable, safe to try, verifiable, and publishable. Add the real print evidence, then launch and respond to users before choosing further features.

This was selected over:

- **Documentation-only launch**, which is faster but exposes known first-use confusion and silent data-loss risks to the first visitors.
- **Polish-first launch**, which would add cropping, a full Bambu wizard, browser-test infrastructure, and other useful work before validating whether strangers care about the core result.

## Conversion path

The launch is designed around one path:

1. A visitor sees Pingdou on GitHub or in a launch post.
2. Within ten seconds they understand the image-to-editable-3MF promise.
3. They open the live demo without installing, signing in, or uploading data to a server.
4. They load the bundled heart example or choose their own image.
5. Within sixty seconds they see an editable grid and 3D relief.
6. Within three minutes they can download a validated 3MF.
7. The README and sample artifacts prove the file can be assigned and sliced in Bambu Studio.
8. The visitor returns to GitHub and chooses whether to star, report feedback, or contribute.

The application will not add analytics to measure this path. Measurement uses GitHub traffic, referrers, stars, release downloads, issues, comments, and voluntary external print reports.

## Application design

### Entry state

GitHub Pages opens the editor directly. There is no separate landing page or duplicated marketing shell.

For a new blank project, the interface emphasizes two actions:

- `Try the sample`
- `Upload your image`

`Try the sample` loads a checked-in, project-owned PNG and passes it through the same image-conversion pipeline used for user uploads. It must not load a fake precomputed preview.

If a saved draft contains work, the draft remains the initial state. Any action that would replace it uses the same native confirmation guard as `New`. Cancelling the confirmation changes nothing.

### Language

- Browsers whose preferred language starts with `zh` open in Chinese.
- All other new visitors open in English.
- An explicit saved user choice continues to override browser language.
- The document language and visible interface language must not contradict each other on first load.

### Editing and regeneration safety

The initial image upload still generates automatically. Before any manual grid edit, conversion controls may continue to update the generated result automatically.

After the first manual edit, any action that would re-quantize from the source requires an explicit user action. It must not silently replace edited cells. Solid-mode filament names and TD values do not trigger regeneration because they do not affect solid color quantization.

All destructive replacement paths, including `New` and loading the sample over a non-empty project, share one confirmation rule.

### Export hierarchy

`Export 3MF` becomes the primary top-level export action. PNG, PDF, material usage, and editable-project exports remain available as secondary actions.

If 3MF validation fails, the primary action directs attention to the existing corrective errors and does not download a file. A successful download presents a short Bambu Studio handoff:

1. import the 3MF;
2. add and assign the three filament colors to the object parts;
3. slice using the documented P2S profile.

Pingdou continues to emit a standard grouped 3MF. It does not add Bambu private project metadata, printer credentials, G-code, or printer-upload behavior.

## Heart sample design

The first-release sample is a simple heart chosen for recognizability and reliable small printing.

Fixed design constraints:

- solid-color AMS mode;
- white rectangular base;
- black heart outline;
- red heart fill;
- no text;
- 10 × 10 cells;
- 2.5 mm cell pitch;
- approximately 25 × 25 × 2 mm overall size;
- Bambu Lab P2S with a 0.4 mm nozzle;
- estimated slice time below 30 minutes;
- measured wall-clock print time below 30 minutes.

Required checked-in artifacts:

- `samples/pingdou-heart-source.png`
- `samples/pingdou-heart-project.json`
- `samples/pingdou-heart-p2s.3mf`
- `docs/pingdou-heart-bambu-slice.webp`
- `docs/pingdou-printed-result.jpg`
- `docs/pingdou-workflow-hero.webp`

The source image is created specifically for Pingdou and covered by the repository license. The maintainer must own and approve repository use of the Bambu screenshot and physical-print photograph.

The physical photograph uses a neutral background, simple scale reference, oblique side lighting, and an approximately 45-degree camera angle. The photograph must visibly show the white base, black outline, red fill, raised bead surfaces, and center dimples. The final README image references are committed only when the actual files exist; the public branch never contains a broken placeholder.

## README design

The default README is English-first and provides a clear Simplified Chinese link near the top.

Above the fold, in order:

1. `Pingdou`
2. the one-sentence product promise;
3. `Try Live Demo` and `Download Sample 3MF` calls to action, plus `View on GitHub` on non-GitHub surfaces;
4. the complete workflow hero image;
5. three factual trust points: local processing, continued editability, and Bambu Studio validation.

The remaining order is:

1. sixty-second quick start;
2. Bambu Studio three-step workflow;
3. source, project, and 3MF sample downloads;
4. verification summary with a link to the detailed acceptance record;
5. local development;
6. known limitations;
7. upstream provenance and license;
8. concise contribution instructions.

After the proof points, the README includes one low-pressure request to star the repository if Pingdou is useful. The live demo exposes the same action through its GitHub link. There is no star modal, repeated banner, or vote request in community posts.

The README does not embed stale 24-color screenshots, the blank workspace, internal implementation plans, generic roadmap promises, or a wall of badges.

## Repository identity and trust

The independent repository uses one canonical URL everywhere after creation:

- application GitHub link;
- README source link;
- GitHub Pages homepage;
- package `repository`, `homepage`, and `bugs` metadata;
- release and launch-post links.

Repository metadata includes a concise English description and focused topics such as `3d-printing`, `3mf`, `bambu-studio`, `perler-beads`, `image-to-3d`, and `browser-app`.

The package declares the supported Node floor and exact package-manager version. The lockfile uses the canonical npm registry so an international contributor does not depend on a regional mirror.

The original `LICENSE` notice remains intact. `UPSTREAM.md` continues to name the exact imported commit and distinguishes the inherited editor base from Pingdou's AMS palette, printable geometry, grouped 3MF, P2S validation, and layered-color work. Repository ownership identifies the current maintainer; no unsupported copyright identity is invented.

Only a concise contribution entry point is added. A security policy, broad issue-template suite, governance system, plugin layer, and community scaffolding remain out of scope until the project has participation that needs them.

## Architecture and data flow

The release keeps the existing static React and TypeScript architecture:

```text
local or bundled image
        ↓
browser image conversion
        ↓
editable project + local browser draft
        ↓
shared printable model
        ├──→ 3D preview
        └──→ validation → grouped 3MF download
```

There is no server, account system, database, telemetry client, second geometry engine, or cloud copy of a user's image.

## Validation and error handling

Project import becomes the single trust boundary for saved project data. It validates or safely normalizes every print-setting type and range that the UI enforces. Invalid numeric values, malformed layered IDs, excessive dimensions, and unsupported structures cannot flow into geometry generation.

Generation and export failures preserve the current editable project. Errors identify the setting or action required to continue. Browser-storage failures degrade to an unsaved session with a visible warning rather than breaking the editor.

The README explains the privacy boundary accurately: source images and generated files are not uploaded, while the current editable draft is retained in browser storage until replaced or cleared.

### Safe export ceiling

A 50 × 50 single-color probe currently creates an approximately 61 MB uncompressed 3MF and reached roughly 671 MB peak RSS under Node. That conflicts with the fast, reliable first-release promise.

For v0.1.0:

- editing may remain available above 32 × 32;
- 3MF export is limited to at most 32 × 32 cells;
- the UI explains the export ceiling before generation;
- restoring 50 × 50 export requires a separately designed memory optimization and real browser verification.

The launch does not add a compression dependency or speculative geometry rewrite merely to preserve the old ceiling.

## Automated verification

CI uses the existing Node and TypeScript toolchain and does not add a browser automation framework for the launch.

On every pull request and push to `main`:

1. install from the lockfile with `npm ci`;
2. build the application;
3. run the current Node test suite;
4. regenerate all fixed samples, including the heart sample;
5. fail if tracked sample bytes changed unexpectedly;
6. test every checked-in 3MF archive for ZIP integrity.

The verification suite adds the smallest direct coverage for:

- imported print-setting types and bounds;
- the regeneration guard after manual edits;
- destructive replacement confirmation as a pure decision helper;
- the 32 × 32 3MF export ceiling;
- deterministic heart project and 3MF generation.

Pages deploys only after the verification job succeeds.

## Manual release acceptance

The deployed GitHub Pages build is tested, not merely the local development URL.

The release owner must:

1. open the deployed page in a current Chromium browser;
2. load the heart sample;
3. edit one cell and confirm conversion controls cannot silently overwrite it;
4. inspect the 3D preview;
5. export the heart 3MF;
6. import it into Bambu Studio;
7. assign white, black, and red materials;
8. slice with the documented P2S profile;
9. confirm estimated print time is below 30 minutes;
10. print it and confirm actual wall-clock time is below 30 minutes;
11. capture the final slice screenshot and physical photograph;
12. verify every README and sample link from a logged-out browser session.

Any failure blocks the public announcement. It does not justify an unrelated feature expansion.

## Launch sequence

The planned release sequence uses America/New_York time:

- **2026-08-28:** print and photograph the heart, record actual time and material details.
- **2026-08-29 through 2026-08-31:** finish the repository, Pages demo, README, release artifacts, and logged-out verification. This is a quiet validation period, not a promotional launch.
- **2026-09-01 morning:** publish `v0.1.0` and submit a Show HN with the live demo.
- **Following days:** enter at most one targeted community per day, beginning with Bambu and 3D-printing communities. Re-read each community's current rules and rewrite the post for that audience before submitting.
- **Second week:** consider Product Hunt only if the account is eligible and the required launch assets are ready. Product Hunt is not a release dependency.

The Show HN title is factual and the project is directly usable. The first comment explains the personal problem, local-browser design, standard grouped 3MF decision, Bambu validation, and known limitations. The maintainer remains available to answer substantive questions during the first two hours.

Every post uses the same core story:

> I wanted a fast way to turn one image into an editable, printable multicolor bead relief without uploading the image or depending on proprietary slicer metadata.

Posts ask people to try the project and share feedback. They do not ask for upvotes, coordinate votes, mass-message strangers, or paste identical promotion into multiple communities.

Relevant platform guidance:

- [Show HN Guidelines](https://news.ycombinator.com/showhn.html)
- [Product Hunt Launch Guide](https://www.producthunt.com/launch)
- [Product Hunt promotion rules](https://www.producthunt.com/launch/sharing-your-launch)

## Success measures

The first 30-day success floor is:

- 100 genuine GitHub stars;
- 10 substantive external feedback items;
- three external users reporting successful Bambu Studio import;
- at least one external user completing a physical print.

These are validation thresholds, not ceilings. Star count remains the primary outcome, while successful external fabrication prevents optimization for empty attention.

If the launch misses the floor, the first response is to inspect GitHub referrers, README clarity, demo failures, and public feedback. It is not to add speculative features.

## Non-goals for v0.1.0 launch

- accounts, cloud storage, sharing backend, or image upload service;
- analytics or tracking scripts in the demo;
- AI image generation;
- a separate marketing site;
- PWA or offline-install packaging;
- crop and advanced source-image framing;
- automatic printer upload;
- Bambu private 3MF metadata or stored printer presets;
- a full Bambu setup wizard;
- new printing modes, filament libraries, or calibration systems;
- Playwright, Cypress, or another browser-test dependency;
- compression or large-model geometry redesign;
- generic governance and community boilerplate.

## Acceptance criteria

The launch design is complete only when:

- the independent repository has one canonical identity and no visitor-facing link points to the upstream repository as Pingdou's home;
- the Pages demo works without installation, login, or server image upload;
- a first-time visitor can generate the heart example within sixty seconds and export a 3MF within three minutes;
- manual edits cannot be silently replaced by automatic regeneration;
- destructive reset paths protect existing work;
- `Export 3MF` is the primary export action;
- the README and live demo provide one unobtrusive path back to GitHub after showing the result;
- the README shows the complete source-to-editor-to-Bambu-to-print proof chain above the detailed setup instructions;
- the heart source, editable project, deterministic 3MF, Bambu slice, and real print photograph are downloadable and rights-cleared;
- both estimated and actual heart print time are below 30 minutes;
- CI verifies the build, tests, deterministic samples, and ZIP integrity before Pages deployment;
- imported project settings cannot bypass supported print ranges;
- v0.1.0 limits 3MF export to 32 × 32 cells and explains that limit;
- official Bambu Studio imports and slices the release artifact successfully;
- the public announcement waits until every release gate passes;
- launch posts request use and feedback, never coordinated votes.
