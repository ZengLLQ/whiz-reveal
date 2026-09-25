# Design

The editable [Controller](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=5-10), [150% controller](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=10-77), and [Full history](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=10-43) were updated with quieter controls, centered results, sound controls and ordinal history labels. The [guide chooser](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=19-84) and [sound interaction notes](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=18-90) document the new behavior. The connected Figma font catalog does not include Aeonik, so editable Figma text retains Inter; the application continues to embed Aeonik. Figma is a layout specification, not a running audio or WebGL prototype.

WhizReveal brings a sense of depth to a focused raffle workflow. The operator configures a pool on the left, runs and previews draws in the center, and reviews session history on the right. Text-size controls sit with the controller's global actions so the operator can adjust readability without changing the audience presentation.

The editable screens and design foundations are in the [WhizReveal Figma file](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW).

The v1.2 visual direction takes inspiration from [Lusion](https://lusion.co/): generous space, an interactive sculptural object, rounded utility actions, and a clear typographic hierarchy. A locally generated torus-knot mesh responds gently to the pointer. Its shader shades the form from the existing five-color palette, with no downloaded model or texture. The sculpture moves into the background once a draw exists. The surrounding controls use simpler surfaces and fewer decorative borders, shadows, icons, and hints.

Utility actions such as Guide, Launch display, and New session use compact uppercase styling. Labels and longer text use sentence case; the WhizReveal wordmark retains its spelling. Guide opens a language chooser followed by an accessible, scrollable dialog containing English, Simplified Chinese, or Indonesian instructions. Escape closes it and restores focus. The controller's Enter shortcut is blocked while any dialog is open.

## Color and hierarchy

The design uses five color tokens throughout:

| Token | Color | Use |
| --- | --- | --- |
| Canvas | `#0B0D10` | Main background and deepest surfaces |
| Surface | `#171C22` | Panels and controls |
| Edge | `#2A333D` | Borders and structural depth |
| Muted | `#5D6F82` | Secondary details and accents |
| Primary | `#E7EEF5` | Numbers, readable labels, and highlights |

Depth comes from mesh lighting, positioning, edges, and restrained shadows using these tokens. Numbers carry the strongest visual emphasis. The secondary Display window contains no app title or branding; Full history uses ordinal draw labels. Flex wrapping centers incomplete rows and adapts to the available canvas width and selected display scale.

## Readability and motion

Controller text can be reduced to 90% or enlarged to 150% in 10% steps. The percentage control returns it to 100%, and the preference is saved locally. Text scaling covers labels, controls, history, and dialogs. It does not change number sizing in the controller preview or secondary display.

The audience display has a separate 50–200% scale control. Both display views wrap numbers and allow vertical scrolling, with custom scrollbars from the palette.

Aeonik Regular, Medium, and Bold are bundled with the application. CJK glyphs fall back to Windows fonts. The installer also registers the supplied fonts for the current Windows user without overwriting existing Aeonik registrations. The portable app renders from the bundled fonts without requiring that registration.

Three.js is loaded asynchronously. Rendering is capped at 30 frames per second and 1.5 device pixel ratio, suspended in a hidden document or offscreen canvas, and rendered without animation for reduced-motion users. A static CSS sculpture remains if WebGL is unavailable or its context is lost. Geometry, materials, renderer resources, listeners, and observers are released on unmount. Number results keep a stable reading plane.

Drawing uses approximately 1.6 seconds of rapid 2D number cycling, followed by a staggered spring reveal. The depth treatment does not turn this into a slot-machine animation. Reduced-motion preferences suppress decorative movement and entrance animation, using a quiet placeholder during the draw before showing the committed result.

The [verification notes](verification.md) distinguish completed checks from acceptance work for the updated interface.

## v1.3.1

The audience Display now shares the locally rendered 3D sculpture, behind current results and full history. Its decorative layer stays fixed while numbers scroll, uses the existing palette, and inherits reduced-motion and WebGL fallback support. Fresh sessions without saved data start at 100 total samples and 10 winners per draw. Existing saved configuration remains unchanged.
