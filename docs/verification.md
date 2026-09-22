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

## History display update, 1.1.2

The Full History display now labels each section with its ordinal draw name, such as `1st Draw`, `2nd Draw`, and `3rd Draw`. Number tiles are centered within each draw section, including incomplete rows, and an active section also shows a small `Drawing` state label.

- TypeScript strict checking, 44 frontend tests, Vite production build, and the browser visual check passed.
- The source update is committed and pushed to `main` before the 1.1.2 Windows package build.
