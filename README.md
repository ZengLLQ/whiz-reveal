# WhizReveal

**WhizReveal by JAYCEE 曾令强** is a Windows and macOS raffle application built with Tauri 2, Rust, React, TypeScript, Tailwind CSS 4, and Framer Motion. A controller manages the pool and session; a separate fullscreen display presents the numbers to an audience.

Choose **Guide** beside **UI text**, then select **English**, **中文**, or **Bahasa Indonesia**. The built-in guide works offline and includes setup, presentation, shortcuts, and session help. The earlier [PDF manual for v1.1.3](output/pdf/WhizReveal-User-Manual-EN-ID-ZH.pdf) remains available as an archive; use the in-app guide for the current controls.

Local release packages are generated in `release/`: `WhizReveal.exe`, a portable ZIP, and the NSIS setup executable. Generated packages are excluded from the source repository. The app needs WebView2, but does not need Node.js or Rust installed. See [verification results](docs/verification.md) for the checks performed.

## Run from source on Windows

Install these development prerequisites:

- Node.js 22.12 or newer with npm. Vite 7 also supports Node.js 20.19+. See the [Vite requirements](https://vite.dev/blog/announcing-vite7).
- The current stable Rust toolchain with the Windows MSVC target, installed through [rustup](https://rustup.rs/).
- Microsoft C++ Build Tools with **Desktop development with C++** and a Windows SDK.
- Microsoft Edge WebView2 Runtime.

The [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) describe the native dependencies. Open a new PowerShell terminal after installing them, then run these commands from this project directory:

```powershell
npm ci
npm run desktop
```

The Tauri command starts Vite and opens **WhizReveal - Controller**. The initial Cargo build downloads and compiles native dependencies; later builds reuse the cache.

## Use the application

1. Enter **Total Samples** and **Number of Draws**, then choose **Apply settings**. A sample count of 250 creates the inclusive pool `1–250`; the draw count is the number of winners in one action.
2. Set **No Duplicates**. When enabled, every number already drawn during the current session is excluded, including results drawn earlier while the toggle was off. When disabled, each position is sampled with replacement: repeats can occur both within one draw and across draws.
3. Choose **Launch display**. The native app uses the first available monitor other than the controller's current monitor, falling back to the current monitor when no other display is available. Configure Windows to extend the desktop for a separate audience screen. The button changes to **Close display**; click it again to close the audience window while preserving the session. Reopen it at any time. Closing the audience window manually also resets the button.
4. Choose **Draw**, or press **Enter** with controls unfocused. Decorative numbers cycle for the selected **Draw duration** (1–30 seconds; initially 1.6 seconds), then the committed winners appear with a staggered spring reveal. Both windows receive the same result.
5. Use **Current Draw** / **Full History** and the **Display scale** slider to update the audience screen live. Scale ranges from 50% to 200%. The controller preview remains compact; large draws and history can be scrolled vertically.
6. Use the controller's **A−** and **A+** text controls to reduce or enlarge interface text from 90% to 150% in 10% steps. Select the percentage to reset to 100%. This preference is saved on the current device and changes controller text independently of the audience display scale and preview numbers.

On the display, **Escape** exits fullscreen and **F11** toggles fullscreen. A fullscreen control becomes visible when hovering or focusing the top-right corner. Use **Alt+F4** to close the focused native window. Closing the controller also closes its display.

The display canvas has no app branding or main title. Full history groups results under ordinal labels such as **1st Draw** and **2nd Draw**. Both views center every row, including the final incomplete row. The interface uses these five design colors:

| Role | Color |
| --- | --- |
| Background | `#0B0D10` |
| Panels | `#171C22` |
| Borders | `#2A333D` |
| Muted text and accents | `#5D6F82` |
| Primary text and highlights | `#E7EEF5` |

The controller pairs quiet controls with an interactive 3D sculpture inspired by [Lusion](https://lusion.co/). The sculpture recedes when results are present. It is rendered locally with Three.js, respects reduced motion, pauses when offscreen, and has a static fallback when WebGL is unavailable. Compact utility actions use uppercase; labels and guide text use sentence case. Scrollbars use the same palette. See the [design notes](docs/design.md).

**Aeonik** is the default app font. Regular, Medium, and Bold are bundled locally, so the installed and portable apps render without font downloads. The setup installer also registers these fonts for the current Windows user, preserving existing Aeonik installations. Chinese text uses Windows glyph fallbacks. See [font provenance and installation](docs/font-license.md).

## Export a session as PDF

Choose **Export PDF** below **Session history**, then select where to save the report. The button becomes available after a draw finishes. Reports include the session ID, sample count, number of draws, UTC timestamps, and every result grouped by **1st Draw**, **2nd Draw**, and so on. Long draws continue automatically across A4 pages; number order and repeated results are preserved.

PDFs are generated offline with embedded Aeonik fonts. The native Windows and macOS app opens a Save dialog; the browser preview downloads the file. Canceling the dialog leaves the session unchanged. Each export captures the completed results at the time you click the button.

**Export before choosing New session.** The app stores the current session, not an archive of previous sessions. Keep one PDF per session to retain past results. See the [sample session report](output/pdf/WhizReveal-Session-Report-Sample.pdf).

## Session behavior

- Total Samples accepts `1–1,000,000`; Number of Draws accepts `1–500`.
- Total Samples is locked after the first draw. Choose **New session**, confirm the reset, and then change the pool.
- New session clears all history, resets draw numbering, and makes the entire pool available. It preserves the draw configuration and presentation settings.
- With No Duplicates enabled, a draw is rejected if fewer eligible numbers remain than requested. Reduce Number of Draws or start a new session.
- Drawing blocks another draw, configuration changes, and reset until the reveal finishes. View and scale changes remain available.
- Settings and history are saved locally. Reopening the app restores them. An interrupted reveal does not discard its committed winners or replay the suspense animation.

Native data is stored in Tauri's local application data directory, normally:

```text
%LOCALAPPDATA%\com.jaycee.whizreveal\session.json
```

Only one native process may own this session at a time. Draw results are saved before the UI receives them. If a save fails, the draw is not accepted. If the saved file is unreadable, the application preserves it and reports the problem. Close WhizReveal before backing up or moving that file.

## Build the Windows application

```powershell
npm run desktop:build
```

The configured bundle target is a per-user NSIS installer. With the default Cargo target directory, a successful build produces:

```text
src-tauri\target\release\whizreveal.exe
src-tauri\target\release\bundle\nsis\WhizReveal_<version>_x64-setup.exe
```

The installer version follows `src-tauri/tauri.conf.json`, and its suffix follows the build architecture. The installed application does not require Node.js or Rust; it uses the Windows WebView2 Runtime. Packaging details are documented in [Tauri's Windows installer guide](https://v2.tauri.app/distribute/windows-installer/).

The setup executable and uninstaller use the same WhizReveal W icon as the application. These are configured explicitly with `bundle.windows.nsis.installerIcon` and `uninstallerIcon`, both pointing to `src-tauri/icons/icon.ico` relative to the repository root.

## Browser preview

```powershell
npm run dev
```

Open [the local preview](http://127.0.0.1:1420). The controller is marked **Browser preview**. **Launch Display** opens a separate popup; allow popups for the local site. A direct display preview is available at [the display route](http://127.0.0.1:1420/?window=display).

Browser preview uses Web Crypto, browser storage, and a same-origin synchronization channel. Its data is separate from native app data. Browser fullscreen and popup behavior depend on browser permissions; automatic monitor placement is available in the native app. A browser preview does not validate Tauri IPC, Windows packaging, or physical multi-monitor behavior.

To preview the compiled frontend:

```powershell
npm run build
npm run preview
```

## Checks

```powershell
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

JavaScript tests exercise preview sampling, constraints, revision ordering, synchronization, and controller text-size preference normalization. Rust tests exercise native drawing, validation, session persistence, recovery, and file locking. These checks do not replace native UI testing on the intended presentation monitors.

See [the architecture notes](docs/architecture.md) for the project layout and IPC contract.

## Sound and macOS

The controller plays a click, shuffle ticks, and a result chime. Use **Sound on/off** in the top bar to mute or enable all cues. Sound is synthesized offline and never duplicated by the audience display. The preference is saved locally.

See [macOS build and signing notes](docs/macos.md) for the universal Intel / Apple Silicon package.

Draw duration in Draw setup selects 1, 1.6, 3, 5, 10, 15, 20 or 30 seconds. It saves with the session, applies to the next draw, and synchronizes shuffle animation and sound across the chosen duration. Older sessions without this setting retain the original 1.6 seconds. Pending parameter edits must be applied first.
