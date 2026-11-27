# SŌMNA — The Launch (presentation)

A standalone, web-based keynote for the SŌMNA final project: **Part I — the pitch**, **Part II — behind the scenes**.
25 slides, planned at **14:00** (the brief allows 15 minutes, including the live website demo).

The website in the parent folder is **not modified** by any of this. The deck is its own Vite app; it reuses the
site's fonts, brand data and its real-time 3D scenes through read-only imports (`@site/…`).

## The website's 3D, live

Four slides render the website's own 3D in real time: its scenes, models, materials, lighting, post-processing and
camera choreography, exactly as on the site.

| Slide | Website scene | What plays |
| --- | --- | --- |
| 03 · Introducing SŌMNA | `HeroScene` | the aircraft at night, along the hero's scroll path |
| 04 · Not selling flights | `CabinScene` | the dolly camera through the portal and down the aisle |
| 07 · The capsule | `ShowcaseScene` | the capsule showcase: drag to turn it, explode it, change tier and light |
| 13 · Close of Part I | `FinaleScene` | the aircraft flying into the sunrise |

How it works (`src/deck/live/`): one full-screen canvas sits behind the slides at the screen's own resolution.
The deck plays the part of the website's scroll, setting the active chapter and its progress, so the website's
cameras run as they do for a visitor.
* At load, every scene state is rendered once behind a veil, so no shader compiles while you present.
* The scene for the next slide is prepared one slide ahead.
* Rendering stops whenever no 3D slide is on screen, or when the live website demo is open.

If WebGL is not available, or with **`?lite`** in the URL (for a weak laptop), those slides play recorded clips instead.

The other website footage in the deck is recorded: the touchscreen, the dream sequence, the arrival, and the
cabin on slide 18. `scripts/record.mjs` records it at an exact 60 fps. It runs the website on a virtual clock
that advances 1/60 s per captured frame, so no frame is dropped or repeated.

## Run it

From the project root (`SŌMNA Airlines/`):

```powershell
npx vite --config presentation/vite.config.ts
```

Open <http://localhost:5180>. For the live demo, run the website as usual in a second terminal (`npm run dev`, port 5173),
or point the deck at the deployed site: `http://localhost:5180/?site=https://your-site-url`.

Production build (a static folder you can host anywhere):

```powershell
npx vite build --config presentation/vite.config.ts
```

```powershell
npx vite preview --config presentation/vite.config.ts
```

The build lands in `presentation/dist` (served on port 5181 by `preview`). It needs a web server (not `file://`).
**Present from the production build** (`build` then `preview`, open <http://localhost:5181>): it is lighter than the
dev server, which matters for the live 3D.

## Inside the website (`/presentation/`)

The deck is also published inside the website, so the website itself serves it:

| | Address |
| --- | --- |
| website dev server (`npm run dev`) | <http://localhost:5173/presentation/> (redirects to `…/presentation/index.html`) |
| deployed website | `https://<your-site>/presentation/` (keep the final slash) |

`public/presentation/` holds a copy of the built deck. It is the only thing added to the website: no website code,
design or behaviour changes, and the folder ships with the site when it is built and deployed (about 40 MB, mostly
video; it is only downloaded when someone opens the presentation). Served this way:
* The demo slide opens the same website the deck is served from, with no setup.
* The deck keeps its own state in session storage, so it never changes a visitor's saved journey on the website.

**After any change to the deck, publish it again:**

```powershell
node presentation/scripts/publish-to-site.mjs
```

This rebuilds the deck and replaces `public/presentation/`.

## Presenting

| Key | Action |
| --- | --- |
| → · Space · Page Down (clickers) | next build / next slide |
| ← · Page Up | back |
| Shift + → / ← | skip the builds of a slide |
| O · Esc | overview of all slides (click to jump) |
| **P** | **presenter view** in a second window: current + next slide, notes, timer, pace, who speaks, hand-over cues |
| F | full screen |
| B · . | black screen |
| 12 then Enter | go to slide 12 |
| Enter on slide 12 | opens the live website inside the deck · “Back to the presentation” (or Esc) returns |
| H · ? | shortcuts |

* The URL keeps the position (`#12.1` = slide 12, build 1), so a reload never loses your place.
* The cursor and the controls disappear after two seconds without mouse movement.
* If the website is not reachable, the demo slide plays a recorded walkthrough instead.
* Animations never block navigation: you can press → at any time.

**Before the day:** fill in `src/config.ts` (names, public URL, the missing material below), then run the export
again so the PDF and the overview thumbnails include them.

## PDF fallback & speaker notes

* `SOMNA-Presentation.pdf` — every slide, 1920 × 1080, for submission or emergencies.
* `SOMNA-Speaker-Notes.pdf` — each slide with its speaker, timing and talk track.

Regenerate both (and the overview thumbnails) with the deck running:

```powershell
node presentation/scripts/export.mjs
```

`scripts/qa.mjs` walks the whole deck with the keyboard and reports errors and frame pacing;
`scripts/qa-layers.mjs` tests the overview, help, live demo and presenter sync;
`scripts/qa-live.mjs` enters each live-3D slide as a presenter would and measures every frame;
`scripts/record.mjs` re-records the website clips (needs the website's dev server on port 5173).

## What is genuine (and where it comes from)

Part II uses only verifiable material:

* **Prompts** — quoted verbatim from the project conversation; word counts measured from it
  (2,105 · 498 · 1,290 · 744 words; this deck’s brief: 1,240).
* **Timestamps** — conversation log and file modification times (Rome time). First prompt Nov 25, 21:11;
  v1 screenshots 22:06; Codex changes 13:20–16:28 on Nov 26 (33 files); 19 h 17 min in total.
* **“Before” images** — screenshots the AI took of its own earlier versions during development
  (`public/media/history/`), plus our own 20-second screen recording (`clips/before_cabin.mp4`) and the broken-wordmark image we pasted.
* **Numbers** — 1,242 agent steps, 202 terminal commands, 126 in-page checks, 157 screenshots (counted from the log);
  14,015 lines of code in 57 files (counted from `src/`); no 3D model files in the project.
* **The product** — the live 3D slides run the website's own code. The other footage and stills were captured from the
  finished website at 1920 × 1080 in headless Chrome (`scripts/record.mjs`).
* **Photographs** — the eight Unsplash photographs used by the website (credited there and in the root README).

## Material we still need from the team

These appear on screen as dashed **“To add”** markers until filled in (`src/config.ts`):

1. **Team names** and who presents which part (`TEAM`; slides already assign speakers 1–4).
2. **How the idea came about** — and whether an AI tool helped brainstorm or name it.
3. **Who drafted the 2,105-word creative brief**, and with which tool.
4. **The prompts given to Codex** (we can see *what* changed, not what was asked).
5. **Any other GenAI tools** used (naming, images, audio…).
6. The **capsule-hotel reference image** the first brief mentions (it is not in the project history).
7. The **public website URL** for the closing slides and the teachers (`PUBLIC_URL`).

## Structure

```
presentation/
  index.html · vite.config.ts · tsconfig.json
  src/config.ts            team, URLs, missing material
  src/slides/partOne.tsx   Part I — 13 slides (pitch)
  src/slides/partTwo.tsx   Part II — 12 slides (behind the scenes)
  src/deck/                engine, presenter view, components
  src/deck/live/           the website's live 3D behind the slides (scenes imported from the site)
  src/styles/deck.css      art direction (the website's palette and type)
  public/media/            clips, site stills, history, thumbnails
  scripts/                 capture tooling, PDF export, QA
```
