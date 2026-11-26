# Architecture

WhizReveal has one Rust-owned native session and two React window roles. The controller performs mutations; the display renders snapshots. Both windows share the same frontend bundle, selected by the `?window=display` query parameter.

## Project layout

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Window role, session connection, fullscreen controls, error presentation |
| `src/components/Controller.tsx` | Inputs, apply action, draw trigger, session history, reset confirmation |
| `src/components/ControllerTextSize.tsx` | Accessible text-size controls for the controller |
| `src/components/ImmersiveStage.tsx` | Stable preview composition and pointer input for the sculpture |
| `src/components/StageSculpture.tsx` | Lends a container to the shared renderer, reduced-motion input and CSS fallback; its `data-scene-source` attribute reports what is showing (`shader`, `physical` or `fallback`) |
| `src/lib/stage-renderer.ts` | One lazily loaded Three.js renderer per window: palette shader (or the `?stage=physical` comparison), light pool, dust, camera dolly, frame budget, render resolution, draw choreography |
| `src/lib/stage-motion.ts` | Pure, tested helpers: damping, draw energy, the pre-reveal breath, reveal detection (shared with the score and the tile sheen), sweep, push, glow and dolly timing, layout targets, when the choreography has settled |
| `src/lib/stage-look.ts` | Reads the `?stage=physical` comparison flag |
| `src/lib/stage-dust.ts` | Pure, tested dust helpers: the seeded field (positions, palette tones, sizes and phases) and the depth band over which specks clear the form's outline |
| `src/lib/sculpture-geometry.ts` | The sculpture's knot dimensions, its furthest reach, and the outline the camera sees; the renderer builds the knot from them and the dust clears that outline |
| `src/lib/stage-resolution.ts` | Render resolution: the 1.5 pixel-ratio cap, and a pixel budget for software (CPU) WebGL renderers, detected from the renderer's name |
| `src/lib/draw-sound.ts` | Local Web Audio score; its cues reuse the stage's reveal detection and breath |
| `src/lib/tile-reveal.ts` | Spring and sheen timing for revealed number tiles, and which reveals get the sheen (none above 40 numbers or under reduced motion) |
| `src/lib/number-grid.ts` | Pure, tested grid helpers: the cycling cadence and frame, the decorative cycling value of each tile, and the by-content comparison that lets memoised grids skip unchanged draws |
| `src/components/ManualGuide.tsx` | Language chooser, accessible modal, guide navigation and focus restore |
| `src/lib/manual-content.ts` | Offline English, Indonesian, and Simplified Chinese guide copy |
| `src/fonts.css` | Local Aeonik font faces and weights |
| `src-tauri/windows/font-hooks.nsh` | Per-user font registration, preservation, and owned-file cleanup |
| `src/components/RevealCanvas.tsx` | Responsive number grid, decorative cycling (plain tiles rewritten in place), Framer Motion reveal and tile sheen, full history |
| `src/reset.css` | Element reset in a cascade layer (see [CSS architecture](#css-architecture)) |
| `src/styles.css` | Global defaults, controller shell and its text-scale tokens, number tiles and reveal sheen, history, dialogs, audience display, controller breakpoints |
| `src/controller-typography.css` | Controller-only text sizes, the layout adjustments that let larger text fit, and the text-size control |
| `src/cinematic-scene.css` | The stage: sculpture host, CSS fallback, and how strongly the sculpture reads in each mode and draw state |
| `src/hooks/useRaffle.ts` | Subscribe-before-fetch connection, revision guard, action state and errors |
| `src/hooks/useControllerTextSize.ts` | Local text-size preference and persistence |
| `src/lib/bridge.ts` | Tauri invoke/events adapter and browser preview transport |
| `src/lib/controller-text-size.ts` | Text-size bounds, stepping, and stored-value normalization |
| `src/lib/color-contrast.ts` | WCAG contrast arithmetic, the palette, and the derived muted text tone (`--color-muted-text`) |
| `src/lib/types.ts` | Shared TypeScript snapshot shape |
| `src/lib/preview-model.ts` | Browser-only sampling and pure session transitions |
| `src-tauri/src/lib.rs` | Native commands, serialized mutations, event publication, window lifecycle |
| `src-tauri/src/engine.rs` | Native model, validation, sampling, draw lifecycle |
| `src-tauri/src/storage.rs` | File lock, validated loading, atomic session saves |
| `src-tauri/tauri.conf.json` | Controller window, CSP, frontend commands, NSIS bundle |
| `src-tauri/capabilities/` | Separate controller/display event and window permissions |

## Native state and IPC

The payload is a camelCase `Snapshot`:

```typescript
interface Snapshot {
  revision: number;
  sessionId: string;
  config: {
    totalSamples: number;
    drawCount: number;
    noDuplicates: boolean;
  };
  presentation: { scale: number; view: 'current' | 'history' };
  history: Array<{ id: number; numbers: number[]; createdAt: number }>;
  activeDraw: {
    draw: { id: number; numbers: number[]; createdAt: number };
    startedAt: number;
    durationMs: number;
  } | null;
}
```

History is newest first. Timestamps are Unix milliseconds. Draw IDs start at one in each session. Revisions increase for accepted changes and remain monotonic across session resets during the running process.

| Command | Arguments | Result |
| --- | --- | --- |
| `get_snapshot` | None | Current snapshot; readable by both windows |
| `update_config` | `{ config }` | Persisted snapshot with validated parameters |
| `update_presentation` | `{ presentation }` | Persisted snapshot with view/scale |
| `draw` | None | Persisted winners and active reveal |
| `reset_session` | None | New session ID and empty history, retaining settings |
| `get_display_status` | None | `{ open, revision }`; readable by both windows |
| `launch_display` | None | Creates or reuses the fullscreen display, returns its status |
| `close_display` | None | Waits for window destruction and returns its status |

All mutation and display-management commands check the caller's native window label and require `controller`. After a successful mutation, Rust broadcasts `whizreveal://state` with the complete snapshot. The command response also returns that authoritative snapshot. The event is a notification, never an instruction to trust a frontend-selected winning number.

`useRaffle` installs the listener before fetching initial state so a mutation cannot fall into the connection gap. The revision guard rejects duplicate or older responses/events. A display opened during an active draw fetches the current state and participates in the remainder of the reveal.

## Draw lifecycle

1. Acquire the Rust session mutex and clone the current snapshot.
2. Validate the requested draw and require no other active draw.
3. Seed `StdRng` from operating-system randomness. With No Duplicates enabled, gather every previously used number, build the remaining inclusive pool, and perform partial Fisher–Yates sampling without replacement. With the toggle disabled, each position is an independent uniform sample from `1..=totalSamples`.
4. Add the winners to history and create `activeDraw` with the configured draw duration (1–30 seconds, 1,600 ms by default).
5. Atomically save the candidate session. Only after a successful save, install the snapshot in memory and emit it to both windows.
6. A native completion timer clears the active draw and emits the final state. The session/draw ID guard prevents a stale timer from finishing another draw.

The animation never selects winners. Cycling values are decorative frontend values; the reveal renders committed backend numbers. Cycling tiles are plain elements: React renders them once, then one animation-frame loop per cycling grid rewrites the digits of the tiles on or near screen every 68 ms in their existing text nodes (`number-grid.ts` computes the values), so even a 500-number draw causes no React render while it cycles. Framer Motion components mount only for the reveal. The controller's visible history excludes the active draw until the reveal completes. Full History includes an animated row for an active draw and completed rows below it. Reduced-motion preferences keep a quiet placeholder during the same draw duration.

Total Samples is immutable once history exists, keeping every record within a stable pool. Turning No Duplicates back on excludes numbers from all prior draws, even draws made with replacement. It does not retroactively remove duplicate results. Reset clears history and unlocks the pool while retaining current settings.

## Persistence and recovery

The store holds an exclusive OS file lock for the process lifetime. A second process receives an error instead of writing to the same session.

`session.json` contains a versioned schema, revision, session ID, configuration, presentation settings, and history. It omits `activeDraw`: winners are durable before the suspense animation starts, and a restarted app shows the latest winners immediately. A same-directory temporary file is written and flushed before replacement. Failed persistence leaves the in-memory state unchanged. Unreadable or invalid saved data produces an error and remains untouched for recovery.

Animation completion is transient and is not independently written to disk. Its runtime revision therefore need not survive a process restart; no native window survives that restart either. The next persisted mutation records the current revision.

## Native presentation window

The controller is titled **WhizReveal - Controller**. The secondary window is titled **WhizReveal - Display**, uses no decorations, and starts fullscreen. The title is window metadata; it is never rendered into the audience canvas.

Rust selects the first enumerated monitor whose physical position differs from the controller's current monitor. It falls back to the current or first monitor. Position and size use physical coordinates to account for negative monitor origins and mixed DPI. The window is positioned while hidden, then shown fullscreen. Repeated launches reuse it, and controller destruction closes it.

The React display supports Escape to leave fullscreen, F11 to toggle fullscreen, and a discreet hover/focus control. Flex wrapping fits numbers to the available width and centers incomplete rows. Vertical scrolling remains available for large draws and history. The display scale changes number/tile sizing; it is not a transform that crops the scrollable canvas.

## Controller typography and visual depth

The controller's text preference ranges from 90% to 150% in 10% increments and resets to 100% through its percentage control. It is stored in local WebView/browser storage, outside the Rust session snapshot. Invalid or inaccessible storage falls back safely to the default. This device preference survives a new raffle session and does not travel over the presentation IPC channel.

Controller typography scales through scoped CSS rules instead of zooming the entire window. Form labels, buttons, history copy, and the reset dialog follow the preference. Preview numbers and audience numbers retain their own sizing rules; the existing presentation scale remains responsible for audience number sizing.

The interface uses layered surfaces and restrained spatial effects within the five-color palette. `ImmersiveStage` moves only its decorative backdrop in response to a mouse pointer and the draw lifecycle; number results keep a stable plane. The score (`draw-sound.ts`) and the stage take the reveal moment and the silent pre-reveal breath from the same `stage-motion.ts` helpers, so sound and light cannot disagree about when a draw is revealed. `RevealCanvas` uses the same detector for the tile sheen, so the sheen plays only for a reveal that window watched, never for restored results, a view switch or a remount. It remembers only reveals that will actually sheen, and its number grids are memoised by content (every snapshot arrives as new objects, so a draw's numbers are compared value by value), so starting a draw, ending one, and starting or ending a sheen re-render only the grid whose draw or state changed, never a large draw or the rest of Full history. The audience view remains focused on numbers, and the draw animation remains rapid 2D number cycling followed by a spring reveal. Reduced-motion preferences suppress decorative motion. Aeonik is bundled through `src/fonts.css`, so typography does not require a remote font request. The installer also registers the fonts for the current Windows user; see the font provenance document. See [the design notes](design.md) for the rationale.

## CSS architecture

The interface is styled with plain CSS; Vite bundles and minifies it into one stylesheet. Each selector has one rule, in the file that owns it, plus its overrides in that file's breakpoint blocks. The one deliberate exception is `controller-typography.css`, which adds a `.controller-shell`-scoped rule to some `styles.css` selectors (`.app-footer`, `.draw-button`, `.input-shell` and others) for their text size and the spacing and wrapping that larger text needs. In cascade order:

| File | Imported by | Owns |
| --- | --- | --- |
| `src/cinematic-scene.css` | `ImmersiveStage.tsx` | The stage, the sculpture host and CSS fallback, sculpture opacity per mode and draw state, the preview's bottom fade |
| `src/manual-guide.css` | `ManualGuide.tsx` | Guide trigger and dialog |
| `src/history-export.css` | `HistoryExportButton.tsx` | Export PDF button and status |
| `src/controller-typography.css` | `Controller.tsx` | Controller text sizes; the spacing, wrapping and shrinking that let larger text fit; the text-size control's own styling |
| `src/sound-controls.css` | `SoundControls.tsx` | Sound settings trigger and dialog |
| `src/welcome.css` | `WelcomeScreen.tsx` | Welcome screen, including its full-screen stage |
| `src/fonts.css`, `src/reset.css`, `src/styles.css` | `main.tsx` | Fonts; the element reset; everything else (global defaults, controller shell, buttons, parameters, preview panel, number tiles and sheen, history, footer, dialogs, display, loading screen) |

`main.tsx` imports `App` before its own stylesheets, and modules evaluate their imports first, so the component stylesheets precede `styles.css` in development and in the built CSS alike. A component stylesheet that adjusts a class from `styles.css`, such as `.secondary-button`, therefore needs a more specific selector; `controller-typography.css` scopes its rules under `.controller-shell` for this reason. Within `styles.css`, variants follow the rule they refine (`.launch-button` and `.sound-button` after `.secondary-button`). `reset.css` keeps only those rules of Tailwind's preflight that reach elements the app renders, inside `@layer base`, so any app rule overrides it.

Controller text sizes come from tokens declared on `.controller-shell`: `--controller-text-sm` to `--controller-text-lg` (11 to 14 px) times `--controller-text-scale`; 11 px is the minimum for informative text, so there is no smaller token. Most are assigned in `controller-typography.css`; a few stay with their rule in `styles.css`: `.duration-select` and `.stage-welcome p` scale their own 13 and 12 px, and some text keeps a fixed size that does not follow the text-size preference, such as the stage heading (`.stage-welcome h1`), the history view's draw state (11 px) and the error toast. Informative secondary text takes `--color-muted-text`, declared on `:root` in `styles.css` and used wherever such text is styled; `src/lib/color-contrast.ts` derives the same value from the palette, and its tests check the stylesheet's declaration, its contrast on Canvas and Surface, the 11 px token minimum, and that no stylesheet sets a pixel font size below 11 px. The display sizes numbers from its own variables, set by `RevealCanvas` (`--tile-height`, `--number-font`, `--grid-*`, `--display-scale`).

| Breakpoint | Used by | Change |
| --- | --- | --- |
| `min-width: 1500px` | Controller, welcome | Wider side columns and gaps, taller preview; more room around the welcome copy |
| `max-width: 1150px` | Controller | Narrower fixed side columns, tighter preview padding |
| `max-width: 1000px` | Controller, Export PDF | Session history moves below the parameters and draw area; its entries form a grid |
| `max-width: 900px` and `min-width: 701px` | Welcome | Tighter two-column welcome |
| `max-height: 720px` and `min-width: 701px` | Welcome | Compact vertical spacing |
| `max-width: 700px` | Welcome | One centered column |
| `max-width: 640px` | Guide dialog | Near full-width dialog, one-column language list |
| `max-width: 620px` | Controller, its text sizes, Guide trigger | One column; the top-bar actions take a full row |
| `max-width: 420px` | Welcome | Entry buttons stack |

The controller no longer uses 900 px: its one remaining effect, the empty history spanning the history grid, now applies from 1000 px, where that grid starts, with the same layout. Moving the welcome's 900, 700 and 420 px or the guide dialog's 640 px onto the controller's breakpoints would change those layouts at the widths in between, so they remain; they are the candidates for merging in a later change that may alter visuals.

Tailwind CSS was removed. The app used only three of its utilities (`sr-only`, now a plain rule in `styles.css`; `mt-5` and `mt-6`, now the field-group spacing rules beside `.field-label`), its preflight (now `reset.css`), and a theme declaring the palette and font stack, which `styles.css` already spelled out. Its scanner also generated about twenty unused utility classes from words in the source, and its build step ran an extra Lightning CSS pass over `styles.css` alone; that pass added no vendor prefixes (it only dropped redundant ones), so WebKit on macOS receives the same declarations. Keeping Tailwind for its preflight alone would have kept a build plugin, two dependencies and those generated classes for about fifteen lines of reset. The switch was checked against the previous build with screenshots and every element's computed style at nine window sizes, from 1920×1080 to 400×800: the pixels match apart from software-rendering noise, and the computed styles differ only in Tailwind's unused custom properties, the grid template of `.number-grid` (a flex container, so it never applied), and how the stacked history grid at 901–1000 px sizes its empty tracks, with the same layout.

## Browser preview boundary

Outside Tauri, the bridge provides a local demonstration using the same UI and TypeScript snapshot contract. It stores snapshots under `whizreveal.preview.v1`, synchronizes through `BroadcastChannel` and storage events, and uses Web Locks when available to serialize writes across tabs. The fallback queue serializes only within the current tab, so browsers without Web Locks should use one controller tab.

Preview randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. Constraint and reset behavior mirror the native engine. Popups replace native windows; browser fullscreen requires a user gesture and permission. Browser data and native data are intentionally separate, and a working preview is not evidence that native IPC or physical monitor placement has been tested.

## Validation scope

Run the commands in the [README](../README.md#checks) for frontend type checks, preview unit tests, production frontend compilation, and native Rust tests. For release acceptance, also open the built Windows app and exercise the full controller/display flow, mixed-DPI monitor placement, fullscreen shortcuts, session restoration, pool exhaustion, and large scrollable draws. Build commands and expected output paths are instructions, not a record that a particular release has passed those checks.

## Display toggle lifecycle

Display visibility is a separate revisioned `{ open, revision }` state broadcast as `whizreveal://display`. The controller subscribes before fetching the initial status and ignores older responses. Launch/close errors appear through the normal error toast. `toggleDisplay` reads the authoritative status; rapid requests are coalesced by the bridge and the hook immediately marks the operation pending. The button uses independent `displayBusy` state so closing a presentation does not block raffle processing.

Rust serializes window creation/closure with an atomic guard. Closure waits off the UI thread until the display's Destroyed event publishes a closed status, allowing the same label to be reopened. Manual window closure uses the same event. Neither command modifies the raffle snapshot or persisted history. Browser preview checks the popup handle for manual closure and preserves the user gesture when opening a popup.
