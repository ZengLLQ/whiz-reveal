# Architecture

WhizReveal has one Rust-owned native session and two React window roles. The controller performs mutations; the display renders snapshots. Both windows share the same frontend bundle, selected by the `?window=display` query parameter.

## Project layout

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Window role, session connection, fullscreen controls, error presentation |
| `src/components/Controller.tsx` | Inputs, apply action, draw trigger, session history, reset confirmation |
| `src/components/ControllerTextSize.tsx` | Accessible text-size controls for the controller |
| `src/components/ImmersiveStage.tsx` | Pointer-responsive decorative backdrop with reduced-motion support |
| `src/components/RevealCanvas.tsx` | Responsive number grid, decorative cycling, Framer Motion reveal, full history |
| `src/styles.css` | Five-color theme, layout, custom scrollbars, responsive rules |
| `src/immersive.css` | Layered surfaces, dimensional number tiles, and responsive depth treatment |
| `src/controller-typography.css` | Controller-only text scaling and responsive typography |
| `src/hooks/useRaffle.ts` | Subscribe-before-fetch connection, revision guard, action state and errors |
| `src/hooks/useControllerTextSize.ts` | Local text-size preference and persistence |
| `src/lib/bridge.ts` | Tauri invoke/events adapter and browser preview transport |
| `src/lib/controller-text-size.ts` | Text-size bounds, stepping, and stored-value normalization |
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
| `launch_display` | None | Creates or reuses the fullscreen display |
| `close_display` | None | Closes the display if present |

All mutation and display-management commands check the caller's native window label and require `controller`. After a successful mutation, Rust broadcasts `whizreveal://state` with the complete snapshot. The command response also returns that authoritative snapshot. The event is a notification, never an instruction to trust a frontend-selected winning number.

`useRaffle` installs the listener before fetching initial state so a mutation cannot fall into the connection gap. The revision guard rejects duplicate or older responses/events. A display opened during an active draw fetches the current state and participates in the remainder of the reveal.

## Draw lifecycle

1. Acquire the Rust session mutex and clone the current snapshot.
2. Validate the requested draw and require no other active draw.
3. Seed `StdRng` from operating-system randomness. With No Duplicates enabled, gather every previously used number, build the remaining inclusive pool, and perform partial Fisher–Yates sampling without replacement. With the toggle disabled, each position is an independent uniform sample from `1..=totalSamples`.
4. Add the winners to history and create `activeDraw` with a 1,600 ms duration.
5. Atomically save the candidate session. Only after a successful save, install the snapshot in memory and emit it to both windows.
6. A native completion timer clears the active draw and emits the final state. The session/draw ID guard prevents a stale timer from finishing another draw.

The animation never selects winners. Cycling values are decorative frontend values; the reveal renders committed backend numbers. The controller's visible history excludes the active draw until the reveal completes. Full History includes an animated row for an active draw and completed rows below it. Reduced-motion preferences keep a quiet placeholder during the same draw duration.

Total Samples is immutable once history exists, keeping every record within a stable pool. Turning No Duplicates back on excludes numbers from all prior draws, even draws made with replacement. It does not retroactively remove duplicate results. Reset clears history and unlocks the pool while retaining current settings.

## Persistence and recovery

The store holds an exclusive OS file lock for the process lifetime. A second process receives an error instead of writing to the same session.

`session.json` contains a versioned schema, revision, session ID, configuration, presentation settings, and history. It omits `activeDraw`: winners are durable before the suspense animation starts, and a restarted app shows the latest winners immediately. A same-directory temporary file is written and flushed before replacement. Failed persistence leaves the in-memory state unchanged. Unreadable or invalid saved data produces an error and remains untouched for recovery.

Animation completion is transient and is not independently written to disk. Its runtime revision therefore need not survive a process restart; no native window survives that restart either. The next persisted mutation records the current revision.

## Native presentation window

The controller is titled **WhizReveal - Controller**. The secondary window is titled **WhizReveal - Display**, uses no decorations, and starts fullscreen. The title is window metadata; it is never rendered into the audience canvas.

Rust selects the first enumerated monitor whose physical position differs from the controller's current monitor. It falls back to the current or first monitor. Position and size use physical coordinates to account for negative monitor origins and mixed DPI. The window is positioned while hidden, then shown fullscreen. Repeated launches reuse it, and controller destruction closes it.

The React display supports Escape to leave fullscreen, F11 to toggle fullscreen, and a discreet hover/focus control. CSS grid wraps numbers to the available width. Vertical scrolling remains available for large draws and history. The display scale changes number/tile sizing; it is not a transform that crops the scrollable canvas.

## Controller typography and visual depth

The controller's text preference ranges from 90% to 150% in 10% increments and resets to 100% through its percentage control. It is stored in local WebView/browser storage, outside the Rust session snapshot. Invalid or inaccessible storage falls back safely to the default. This device preference survives a new raffle session and does not travel over the presentation IPC channel.

Controller typography scales through scoped CSS rules instead of zooming the entire window. Form labels, buttons, history copy, and the reset dialog follow the preference. Preview numbers and audience numbers retain their own sizing rules; the existing presentation scale remains responsible for audience number sizing.

The interface uses layered surfaces and restrained spatial effects within the five-color palette. `ImmersiveStage` moves only its decorative backdrop in response to a mouse pointer; number results keep a stable plane. The audience view remains focused on numbers, and the draw animation remains rapid 2D number cycling followed by a spring reveal. Reduced-motion preferences suppress decorative motion. Inter Variable is bundled through `@fontsource-variable/inter/wght.css`, so typography does not require a remote font request. See [the design notes](design.md) for the rationale.

## Browser preview boundary

Outside Tauri, the bridge provides a local demonstration using the same UI and TypeScript snapshot contract. It stores snapshots under `whizreveal.preview.v1`, synchronizes through `BroadcastChannel` and storage events, and uses Web Locks when available to serialize writes across tabs. The fallback queue serializes only within the current tab, so browsers without Web Locks should use one controller tab.

Preview randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. Constraint and reset behavior mirror the native engine. Popups replace native windows; browser fullscreen requires a user gesture and permission. Browser data and native data are intentionally separate, and a working preview is not evidence that native IPC or physical monitor placement has been tested.

## Validation scope

Run the commands in the [README](../README.md#checks) for frontend type checks, preview unit tests, production frontend compilation, and native Rust tests. For release acceptance, also open the built Windows app and exercise the full controller/display flow, mixed-DPI monitor placement, fullscreen shortcuts, session restoration, pool exhaustion, and large scrollable draws. Build commands and expected output paths are instructions, not a record that a particular release has passed those checks.
