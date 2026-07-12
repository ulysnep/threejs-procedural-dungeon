# Habitat

Habitat is a deterministic residential floorplan generator rendered live with Three.js. Choose a
seed, bedroom and bathroom counts, a finish palette, and a furnishing density to create a repeatable
single-story house plan.

Each plan is more than a collection of renamed rectangles. Habitat builds a bounded house footprint,
separates public and private zones, creates a central circulation spine, connects rooms through shared
walls, places windows only on exterior walls, and furnishes every space according to its purpose.

## Features

- Deterministic generation: the same seed and controls always create the same plan.
- Residential space planning with an entry, living room, dining room, kitchen, bedrooms, bathrooms,
  laundry, circulation, and an optional study.
- Bedroom and bathroom controls for one-to-five-bedroom and one-to-three-bathroom homes.
- Explicit doors, exterior windows, interior partitions, room dimensions, and estimated area.
- Five material palettes: Modern, Warm, Coastal, Sage, and Slate, plus a seed-selected Auto mode.
- Purpose-built procedural furniture for living, dining, sleeping, kitchen, bath, laundry, and office
  spaces.
- Toggleable furniture, fixtures, accents, wet-area, lighting, adjacency, and zoning layers.
- Animated six-stage build: program, zone, split, connect, openings, and furnish.
- Pan, zoom, and orbit controls with a responsive control panel.

## Quick start

Requires Node.js `20.19+` or `22.12+`.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>.

To test the production bundle locally:

```bash
npm run build
npm run preview
```

Open <http://localhost:4173>.

## Controls

| Action | Input |
| --- | --- |
| Pan | drag |
| Zoom | scroll wheel |
| Orbit | shift-drag |
| Generate a new seeded plan | `R` |
| Cycle design style | `T` |
| Toggle room adjacency | `G` |
| Toggle space zoning | `H` |
| Toggle rendered view | `P` |
| Skip the build animation | `space` |

The left panel lets you enter an exact seed or randomize it, choose a style, set bedroom and bathroom
counts, tune furnishing density, and toggle individual presentation layers.

## How generation works

1. **Program.** Build the room schedule from the requested bedroom and bathroom counts.
2. **Zone.** Reserve a public front wing and a quieter private wing around a circulation spine.
3. **Split.** Divide both sides of the private wing into integer rectangular rooms while preserving
   minimum usable depths.
4. **Connect.** Add explicit shared-wall connections from the entry through the public rooms and from
   the hall to every private room. The primary suite receives an additional internal connection.
5. **Openings.** Cut doors through shared walls and place room-appropriate windows only on exterior
   walls, including frosted bathroom glazing.
6. **Furnish.** Place low-poly procedural furniture and fixtures based on each room's purpose and the
   selected furnishing density.

The result is a deliberately constrained concept plan rather than a permit-ready architectural
drawing. Dimensions and area are useful planning estimates; structural, accessibility, mechanical,
egress, and local building-code requirements still need professional review.

## Project structure

```text
habitat/
├── index.html          # control panel, project summary, and canvas entry
├── src/
│   ├── main.js         # generator, Three.js model, interaction, and animation
│   └── ui/
│       └── styles.css  # responsive architectural UI
├── vite.config.js      # relative-path production bundle
└── public/
```

The production build uses relative asset paths, so the contents of `dist/` can be deployed to any
static host.

## Built with

- [Three.js](https://threejs.org/) for the procedural architectural model.
- [Vite](https://vitejs.dev/) for local development and static production builds.

## License

[MIT](LICENSE) © 2026 Majid Manzarpour.
