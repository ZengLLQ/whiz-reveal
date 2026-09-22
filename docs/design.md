# Design

Editable screens: [Controller](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=5-10), [Controller at 150% text](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=10-77), [Current Draw display](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=10-31), and [Full History display](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW?node-id=10-43). The Figma file includes palette variables, typography, component variants, and usage notes. These are editable screen designs; motion and live controls run in the application.

WhizReveal brings a sense of depth to a focused raffle workflow. The operator configures a pool on the left, runs and previews draws in the center, and reviews session history on the right. Text-size controls sit with the controller's global actions so the operator can adjust readability without changing the audience presentation.

The editable screens and design foundations are in the [WhizReveal Figma file](https://www.figma.com/design/nsTQnUj3rHsi5tY68xGoXW).

The visual direction takes inspiration from the depth, layering, and interaction described in Figma's [3D and immersive elements trend](https://www.figma.com/resource-library/web-design-trends/#trend-1-3d-and-immersive-elements). Layered panels, dimensional number surfaces, and restrained motion create depth while keeping the interface practical during a live event.

## Color and hierarchy

The design uses five color tokens throughout:

| Token | Color | Use |
| --- | --- | --- |
| Canvas | `#0B0D10` | Main background and deepest surfaces |
| Surface | `#171C22` | Panels and controls |
| Edge | `#2A333D` | Borders and structural depth |
| Muted | `#5D6F82` | Secondary details and accents |
| Primary | `#E7EEF5` | Numbers, readable labels, and highlights |

Depth comes from positioning, layers, edges, and shadows using these tokens. Numbers carry the strongest visual emphasis. The secondary Display window contains no visible title, branding, or section header.

## Readability and motion

Controller text can be reduced to 90% or enlarged to 150% in 10% steps. The percentage control returns it to 100%, and the preference is saved locally. Text scaling covers labels, controls, history, and dialogs. It does not change number sizing in the controller preview or secondary display.

The audience display has a separate 50–200% scale control. Both display views wrap numbers and allow vertical scrolling, with custom scrollbars from the palette.

Inter Variable is bundled with the application. Mouse movement subtly shifts the controller preview's decorative backdrop while the drawn numbers stay fixed and readable.

Drawing uses approximately 1.6 seconds of rapid 2D number cycling, followed by a staggered spring reveal. The depth treatment does not turn this into a slot-machine animation. Reduced-motion preferences suppress decorative movement and entrance animation, using a quiet placeholder during the draw before showing the committed result.

The [verification notes](verification.md) distinguish completed checks from acceptance work for the updated interface.
