# Aeonik font provenance and installation

WhizReveal uses the Aeonik files supplied by the project owner. The three TTF files are copied without modification from the supplied `aeonik-font` folder:

| File | Original font weight | UI mapping |
| --- | --- | --- |
| `Aeonik-Regular.ttf` | 400 | Regular (400) |
| `Aeonik-Medium.ttf` | 500 | Medium (500) |
| `Aeonik-Bold.ttf` | 700 | Bold (600–700) |

The font files contain these metadata fields:

- Copyright: `Mark Bloom and Joe Leadbeater (c) 2018`
- Manufacturer and designer: `Mark Bloom and Joe Leadbeater`
- License description: `This Is Our Shop EULA`
- License URL recorded in the files: `http://www.thisisourshop.com`

The supplied folder does not contain the full EULA or proof of a redistribution license. This note records provenance; it does not grant or assert additional license rights. The font files retain their original metadata and are not covered by any license applied to WhizReveal's source code.

## App rendering

The app bundles the TTFs with its frontend and loads them locally using `@font-face`. Aeonik therefore works offline, in the portable app, and when Windows font registration is unavailable. Segoe UI and Microsoft YaHei provide fallback glyphs, including Chinese characters not present in Aeonik.

## Windows installer

The NSIS installer also copies the fonts to the current user's `%LOCALAPPDATA%\Microsoft\Windows\Fonts` directory under names beginning `WhizReveal-Aeonik-`. It registers them under `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts`, with ownership records under `HKCU\Software\com.jaycee.whizreveal\InstalledFonts`. No administrator access is required. The installer does not change Windows' default system font.

Existing per-user or machine-wide registrations for each font are preserved. An existing file at a reserved destination is never overwritten or adopted. Upgrades preserve registrations owned by WhizReveal. A normal uninstall removes only matching registrations and files that WhizReveal recorded as its own; a file still in use may be removed after a Windows restart. Already-open applications may need to restart before their font menus refresh.

Implementation uses [Tauri's supported NSIS installer hooks](https://v2.tauri.app/distribute/windows-installer/#extending-the-installer) and [Windows font-resource registration](https://learn.microsoft.com/en-us/windows/win32/gdi/font-installation-and-deletion).
