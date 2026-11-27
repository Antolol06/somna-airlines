# SŌMNA — The Art of Arriving

A cinematic, interactive WebGL concept site for **SŌMNA**, a fictional premium airline that replaces seats with private sleeping capsules.
*Fall asleep here. Wake up anywhere.*

> SŌMNA is fictional. Aircraft, capsules and cabin layouts are design concepts, not certified aviation designs. All routes, schedules, durations and prices are conceptual demonstration data. No payments are processed.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build
```

## The journey

| # | Chapter | What happens |
|---|---------|--------------|
| 01 | Beyond flying | Dark opening, a beacon, a moonlit procedural aircraft above an ocean of shader clouds. Scroll flies the camera into an illuminated window (interior-mapped glass). |
| 02 | The cabin | An architectural walkthrough of three cabins joined by walnut archways — **Essential** (two-tier gallery, ivory bezels, ribbed acoustic panels), **Signature** (single level, wider capsules, walnut slats and leather) and **Grand** (suites behind champagne-metal portals, navy wool felt). The camera is stable: scroll glides it between composed shots (no walking, bob or sway), each cabin's featured capsule opens its shade as its shot arrives, and a panel compares size, bed, layout, materials, comfort and fare. |
| 03 | The capsule | Open three-quarter product view with live Relax / Dream / Wake lighting, drag to rotate, free exploration with zoom, and an optional exploded view that highlights any of eight systems. |
| 04 | Destinations | Interactive Earth (NASA Blue/Black Marble, procedural clouds, atmosphere, terminator, city lights). Pick cities on the globe or by search; flight arc, miniature aircraft, duration, sleep window and local arrival time. **Dream me there** launches the dream. |
| — | The Dream Sequence | Board the capsule, then drag or use the arrow keys to look around while **SŌMNA OS** adjusts lighting, climate, window tint, sound and sunrise settings live. Good night starts the dream. Wake to a photograph of your destination and open the full cabin map to pick a capsule. |
| 05 | Find your space | Browse all 62 capsules across Grand, Signature and Essential on the cabin map, or select directly in the 3D cutaway with angled, top and lower-tier views. |
| 06 | Book your dream | Review the selected capsule, route and saved sleep preferences, return to the cabin map to change your choice, and confirm a demonstration reservation. |
| 07 | Arrive | The aircraft flies into the sunrise as the camera pulls away. |

## Stack

React 19 · TypeScript · Vite · three.js · React Three Fiber · Drei · postprocessing (bloom, depth of field, AgX tone mapping, vignette, grain) · GSAP · Lenis · Zustand (persisted journey state) · Web Audio (all sound is synthesised — no audio files).

Every model — aircraft, capsule, cabin — is built procedurally in code. The only bitmap assets are the Earth textures and the eight arrival photographs (`public/destinations/`), which are rendered through a full-screen shader (slow push-in with sky/city depth separation, sun bloom, morning haze, grain) outside the tone-mapping chain so their colours stay true.

## Structure

```
src/
  App.tsx               app shell, audio mix, chapters
  state/                Zustand store (persisted) + per-frame runtime state
  data/                 cities & journey maths, capsule tiers & cabin layout
  lib/                  scroll (Lenis + ScrollTrigger), audio engine, quality detection
  three/
    Experience.tsx      single Canvas, director, shared light rig, post-processing
    core.ts             scene director, environments, camera lens shift
    models/             Aircraft, CapsuleModel, atmosphere (sky, clouds, stars, moon)
    scenes/             Hero, Cabin (+ cabinShading, DreamCapsule), Showcase, Globe (lazy),
                        Selection, Booking, Finale, Dreamscape, Destination (photo stage)
  ui/                   overlays, controls, SŌMNA OS capsule panel, dream director (GSAP timeline)
```

## Brand wordmark

The “Ō” is drawn, not typed (`src/ui/Wordmark.tsx`): web fonts split into Latin / Latin-Extended subsets can't reliably compose the macron over the O, so the macron is a precise bar centred over a plain O — in the UI (`<Wordmark />`, `<Brand />`) and on the aircraft livery.

## Accessibility & performance

- Reduced-motion mode (system setting or the toggle in the menu / footer): no smooth-scroll inertia, shorter dream sequence, no word animations.
- Sound is off until the visitor opts in; toggle any time.
- "Skip to booking" link and nav access to booking at any point — no animation has to finish first.
- Device tiers: lower DPR, fewer particles, no DOF/MSAA on low-end and mobile; adaptive resolution that only ever steps down (at most twice, never while dragging), so it cannot oscillate.
- Globe stability: the composer resizes in the same frame as the canvas, textures decode off-thread (`ImageBitmapLoader`) and upload during idle time, HDR output is clamped before bloom, overlapping markers use polygon offset, and every shader avoids undefined `pow()` on negative bases.
- The globe and its textures are lazy-loaded and uploaded to the GPU as soon as they arrive. Its cloud layers are baked once into a texture on the GPU instead of evaluating 3D noise per pixel every frame; drag uses screen-to-sphere mapping with time-based inertia.
- Post-processing is built directly on `postprocessing`: the depth-of-field pass is skipped entirely in scenes that don't use it.
- Hidden scenes are not rendered and their per-frame work is skipped; raycasting is limited to the active chapter.
- Without WebGL 2 a styled, fully functional fallback (including booking) is shown.

## Credits

Earth textures: NASA Blue Marble & Black Marble (public domain), as packaged in [three-globe](https://github.com/vasturiano/three-globe) (MIT). Fonts: Jost and IBM Plex Mono (SIL OFL) via Fontsource.

Arrival photographs — all under the [Unsplash License](https://unsplash.com/license) (free to use; credited on screen during the arrival):

| City | Photographer | Source |
|------|--------------|--------|
| Tokyo | Alexandre Lallemand | https://unsplash.com/photos/aerial-view-of-city-buildings-during-daytime-UtPC_kz8CAc |
| New York | Luca Bravo | https://unsplash.com/photos/panoramic-photography-of-brooklyn-bridge-_QdFx92MO2U |
| Paris | Timelab | https://unsplash.com/photos/the-eiffel-tower-towering-over-the-city-of-paris-uYrACAHq6jI |
| Rome | Wyatt Simpson | https://unsplash.com/photos/cityscape-of-rome-with-beautiful-architecture-zvN8ZiBa6Iw |
| London | Jaanus Jagomägi | https://unsplash.com/photos/london-cityscape-with-st-pauls-cathedral-Dymu1WiZVko |
| Dubai | James Watson | https://unsplash.com/photos/the-sun-is-setting-over-the-city-skyline-7bknZdECbqY |
| Singapore | Kirill Petropavlov | https://unsplash.com/photos/marina-bay-sands-hotel-during-daytime-vmGwPt9gpV0 |
| Los Angeles | Riccardo Tuninato | https://unsplash.com/photos/a-view-of-a-city-with-tall-buildings-and-palm-trees-1Xnzs_WKV1s |
