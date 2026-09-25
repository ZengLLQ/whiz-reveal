# macOS

WhizReveal builds as a universal macOS application for Apple Silicon and Intel, with macOS 11 or newer configured as the minimum. The interface, draw engine, local history, presentation window, guides and synthesized sound effects share the Windows implementation.

## Build on a Mac

Install Xcode Command Line Tools, Node.js 22 and Rust, then run:

```sh
npm ci
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri -- build --target universal-apple-darwin --bundles app,dmg
```

Tauri automatically merges `src-tauri/tauri.macos.conf.json`. The macOS universal build GitHub Actions workflow runs frontend and Rust tests, builds the DMG and app, verifies both binary architectures and the ad-hoc signature, and uploads artifacts with SHA-256 checksums.

Open the DMG and drag WhizReveal to Applications. Aeonik is embedded in the application and works without installing fonts system-wide. This macOS package does not register fonts in Font Book.

## Signing and acceptance

The current build uses an ad-hoc signature and is **not Apple-notarized**. Gatekeeper may block first launch. This is a test distribution, not an App Store release. A Developer ID certificate and Apple notarization credentials are required for a signed, notarized public distribution; do not commit credentials to the repository.

Manual acceptance on a real Mac must still cover opening the downloaded app, audio playback on the selected output, external display placement/fullscreen behavior, window close/reopen, and persisted sessions. A CI build does not prove these interactions.

References: [Tauri DMG packaging](https://v2.tauri.app/distribute/dmg/) and [macOS signing](https://v2.tauri.app/distribute/sign/macos/).
