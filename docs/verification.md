# Verification

The following results were recorded on Windows during the initial 1.0.0 build. They establish the native raffle and presentation baseline; they do not certify subsequent controller typography or visual changes.

| Check | Result |
| --- | --- |
| TypeScript strict type checking | Passed |
| Vite production build | Passed |
| TypeScript model and synchronization tests | 34 passed |
| Rust engine and persistence tests | 14 passed |
| Native release executable and NSIS installer | Built successfully |
| npm dependency audit | No known vulnerabilities reported |
| Native controller launch | Correct title, branding, controls, and initial pool |
| Native display launch | Borderless fullscreen, numbers only |
| Native draw and IPC | Controller drawing phase completed; the display received the saved Rust result |
| Native persistence | Saved JSON contained the same winners shown on the display |
| Native Escape / F11 | Windowed mode with decorations, then borderless fullscreen |
| Browser controller/display agreement | Matching results in both windows |
| Large browser draw | 30 unique numbers, scrollable canvas, no horizontal overflow |
| History at 200% scale on 800 × 600 viewport | 35 numbers retained; 300 px tiles and 156 px text; vertical scrolling |
| Unapplied configuration | Preserved through presentation view changes |

The installer was built, but installing it was not part of verification. Automatic placement on a separate physical monitor is implemented; routing across multiple physical monitors and mixed DPI setups should also be checked on the intended event equipment. Browser tests use a separate preview session and do not substitute for the native IPC checks above.

The initial 1.0.0 native smoke-test session was archived under `artifacts/qa/`. Release packages contain no session data; an existing user's saved session is preserved.

## Typography and immersive design acceptance

The 1.1.0 interface adds a persistent 90–150% controller text preference and a layered visual treatment. The following checks have been run for this update:

| Check | Result |
| --- | --- |
| TypeScript strict checking and Vite production build | Passed |
| TypeScript model, synchronization, and text-size tests | 44 passed |
| Rust engine and persistence tests | 14 passed |
| Rust formatting check | Passed |
| npm dependency audit | No known vulnerabilities reported |
| Documentation local links, heading anchors, and npm script references | Passed |
| npm, Cargo, lockfile, and Tauri version metadata | Consistent at 1.1.0 |
| Browser controller text size | A+ reaches 150%; A− reaches 90%; percentage resets to 100% |
| Browser text preference persistence | 150% restored after controller reload |
| Browser text/number size independence | History number text stayed at 42 px while controller text changed |
| Browser scrollable preview at 1200 px width | Canvas remained 390 px high with 1,976 px scroll content; no horizontal overflow |
| Inter font license | Bundled plain-text notice is byte-for-byte identical to the upstream license |
| Native 1.1.0 release executable and NSIS installer | Built successfully; executable product version is 1.1.0 |
| Native 1.1.0 visual smoke check | Controller rendered with the new typography controls, dimensional panels, and number cards |
| Figma design | Four editable screens visually inspected, including 150% Controller text and numbers-only Display views |

Remaining device acceptance checks (not claimed as tested for 1.1.0):

- Native A− and A+ move in 10% increments, respect both limits, and the percentage control resets to 100%.
- The native preference survives reopening the controller, and unavailable or malformed local storage falls back to 100%.
- Labels, inputs, buttons, sidebar history, and reset dialog remain usable at 150%, including at the minimum controller window size.
- Controller text changes do not resize preview numbers or the audience window. The audience scale still works independently.
- Reduced-motion mode suppresses spatial decoration and cycling; the committed result still appears after the same draw duration.
- Current Draw and Full History retain vertical scrolling without horizontal overflow at large number counts and display scales.

The bullets above are interface acceptance checks to perform for the update, not additional recorded test results.

## Windows installer icon, 1.1.1

The setup executable now uses the existing WhizReveal W app icon. The NSIS installer and uninstaller icon paths are configured explicitly.

- TypeScript strict checking, the Vite production build, and the native Windows/NSIS release build passed.
- The generated NSIS script references `icons/icon.ico` for both `MUI_ICON` and `MUI_UNICON`.
- All six icon images embedded in the setup executable (16, 24, 32, 48, 64, and 256 px, 32-bit) match the source ICO payloads byte-for-byte by SHA-256. The earlier 1.1.0 setup contained the default NSIS icon instead.
- The application and setup report version 1.1.1. The portable ZIP's executable matches the built application by SHA-256.

Verification read executable resources without running the installer. Installation and the generated uninstaller were not exercised, and the existing installed application and saved session were left unchanged. Application behavior did not change in this packaging update; the earlier test results remain historical results rather than new test runs.

## History display update, 1.1.3

The Full History display now labels each section with its ordinal draw name, such as `1st Draw`, `2nd Draw`, and `3rd Draw`. Number tiles are centered within each draw section, including incomplete rows, and an active section also shows a small `Drawing` state label.

- TypeScript strict checking, 44 frontend tests, Vite production build, and the browser visual check passed.
- The source update is committed and pushed to `main` before the 1.1.3 Windows package build.

## Display toggle, guide, and Aeonik update, 1.2.0

- TypeScript strict checking and the Vite production build passed. Three.js is a lazy chunk; Vite reports its bundle-size advisory (approximately 747 kB before gzip).
- 52 frontend tests and 16 Rust tests passed. Rust formatting passed.
- Browser launch, close, and reopen checks preserved the same draw history. Bridge tests also cover manual popup closure, blocked popups, delayed closure, and concurrent requests.
- The controller uses the local Aeonik font family; the WebGL sculpture rendered successfully. Six-number results were centered as four tiles followed by two centered tiles, with no horizontal page overflow.
- English, Simplified Chinese, and Indonesian guide content was inspected. Language switching, Escape focus restoration, and scrollable guide layout at 150% text were checked. Enter on a guide heading did not trigger a draw. The previous text preference was restored after testing.
- The native Windows executable and NSIS installer built successfully and report version 1.2.0. The generated installer includes all three font resources and the install/uninstall hooks.
- All six installer icon images match the source W icon payloads.
- Seven isolated NSIS font-hook scenarios passed: fresh install, idempotent reinstall, upgrade retention, normal uninstall, existing user registration, existing Regular-family alias, and an existing reserved filename. Font hashes matched the supplied files; the test registry tree was removed afterwards. These checks used a unique test registry tree and workspace directory, not production font registry entries or an existing WhizReveal installation.

Physical multi-monitor placement and a complete installation on a second computer have not been exercised for this release. The archived PDF and Figma screens describe earlier versions; the built-in three-language guide describes 1.2.0.

## v1.3.0 sound and macOS

- Frontend: 58 tests passed, including restored-history silence, completion deduplication, reset cancellation, bounded shuffle scheduling, immediate mute cancellation and unavailable audio hardware.
- TypeScript build and production Vite build passed. Windows NSIS build passed; 16 native Rust tests passed on Windows.
- Browser preview on an isolated origin: draw completed, sound toggle changed state, mute persisted after reload, and toolbar wrapped without clipping at 150% text on a narrow viewport. No physical-speaker listening test has been performed.
- Updated Figma controller at 100% and 150%, centered history headings, guide chooser and sound behavior notes; screenshots reviewed. Aeonik is not offered by the connected Figma service, so Figma retains its previous Inter font while the app uses embedded Aeonik.
- macOS builds and tests run in `.github/workflows/macos.yml`; see the workflow result for build evidence. Real-Mac audio, external-monitor and Gatekeeper acceptance remains separate from compilation. The package is ad-hoc signed and not notarized.

macOS universal build [36090281684](https://github.com/ZengLLQ/WhizReveal/actions/runs/36090281684) passed on commit `16f5614`: 58 frontend tests, native Rust tests, universal app/DMG build, arm64 + x86_64 architecture check, strict ad-hoc signature check, embedded Aeonik resource check, and Info.plist validation. Downloaded artifacts are published with the v1.3.0 release. This does not replace real-device acceptance testing.

## Session PDF export, 1.4.0

- TypeScript checking, production frontend build, 62 frontend tests, and 20 Rust tests passed on Windows.
- The PDF pagination test preserves chronological draw order, repeated numbers, continuation offsets, and every recorded position without mutating the session.
- All pages of the one-page example and five-page stress report were rendered and visually inspected. Text extraction independently verified all 503 stress-test results, including repeated values and 1,000,000, in their original order.
- The isolated browser preview disabled export for an empty history and successfully downloaded a PDF after a completed draw. The original native session was not modified.
- Rust tests cover safe suggested filenames, PDF payload validation, extension handling, complete replacement, and preservation of existing files when saving fails. Native export is restricted to the controller and uses a user-selected path.
- Aeonik fonts are embedded from bundled local assets. The Content Security Policy permits same-origin font reads while preserving the existing external connection restrictions.

Native Save-dialog interaction, real-Mac Gatekeeper acceptance, and physical multi-monitor behavior are not claimed as tested by the automated checks.

## Cinematic stage and welcome, 1.5.0

- 64 frontend tests, 20 native Rust tests, TypeScript checking, and a Vite production build passed on Windows.
- The bundled Higgsfield-authored orbital GLB was loaded in the browser preview. Its fallback remains available for failed asset or WebGL loading.
- The welcome screen was checked visually at a desktop viewport: the W scene loaded without console errors, drag interaction remained available, Enter silently reached the controller, Escape skipped the entering transition, and Skip welcome next time persisted after reload.
- The browser audience display retained centered, readable number tiles over the dimmed sculpture. A live five-second draw completed and exposed its history as expected.
- Sound controls expose persisted Music and Effects sliders plus Test sound. Browser automation verified interaction and mute state; it cannot establish physical loudspeaker quality.
