# Plan: sculpture from the Smithsonian

Status: planned, not started. Written 2026-11-17.

Salon hangs pictures from one museum. This adds 3D works (busts, statues, vases, objects)
from the Smithsonian's 3D collection, standing on plinths down the middle of the hall at
their real size, and on your floor or table in AR.

## What the Smithsonian gives us (checked against the live API)

- **Search, no key:** `https://3d-api.si.edu/api/v1.0/content/file/search?q=<query>&file_type=glb&rows=<n>&start=<n>`.
  It returns one row per *file*, not per model: `{ title, content: { usage, quality, uri,
  model_url: "3d_package:<uuid>", draco_compressed } }`. A model's rows come one after another.
  `start` pages. The `quality` and `usage` parameters are ignored, so filter on our side.
- **CORS is open** (`Access-Control-Allow-Origin: *`) on the API, the scene documents and the
  `.glb` files. Unlike Cleveland, this needs **no proxy** and no changes to `vite.config.ts` or `vercel.json`.
- **Each model comes in several sizes**, all Draco-compressed GLB:
  | usage / quality | faces / texture | e.g. bytes |
  | --- | --- | --- |
  | Web3D Thumb | 20k / 512 | 150 KB |
  | Web3D Low | 150k / 1024 | ~1–3 MB |
  | Web3D Medium | 150k / 2048 | |
  | Web3D High | 150k / 4096 | |
  | Web3D AR | 100k / 2048 | 1.5 MB |
  | iOSApp3D AR (usdz) | 150k | |
- **The scene document** `https://3d-api.si.edu/content/document/3d_package:<uuid>/document.json`
  (Voyager SVX) has everything else:
  - `models[0].units` (e.g. `"mm"`), `.translation`, `.rotation` (quaternion), and `.boundingBox`.
    The GLB alone is in raw scan units with an offset origin, so **true size depends on this**.
  - `models[0].derivatives[]`: each size's file name, `byteSize`, `numFaces` and `imageSize`.
    This means the search rows are needed only to find model ids.
  - `metas[0].collection.edanEntry`: the full collection record as a JSON string.
    `content.freetext.name` (Artist / Sitter / Maker), `.date`, `.physicalDescription` (Medium,
    and the museum's Dimensions text), `.objectType`, `.creditLine`;
    `content.descriptiveNonRepeating.record_link` (the museum's page), `.unit_code` (NPG, SAAM,
    NMNH…) and `.metadata_usage.access`.
  - Check case: the Hayes bust (NPG.76.27). The bounding box is 28 × 21 × 15 cm in mm, and the
    museum's text says "With Socle: 27.3 × 24.8 × 12.7 cm". The units match the object.
- **Size of the collection:** about 21,000 GLB rows, roughly 3,000 models. Art queries are thin:
  `monet` finds 0 and `sculpture` finds about 40 models. Natural history (skulls, specimens) and air
  and space objects make up much of it.

## Shape of the feature

- **One search, two museums.** A query hangs Cleveland's pictures on the walls, as now, and stands
  Smithsonian models on plinths along the middle of the same hall. Most searches find no models
  and look exactly like they do today. `statue`, `bust`, `washington` and `lincoln` light up.
- **Halls stay stable links.** Each hall takes a fixed slice of the Smithsonian rows, just as it
  takes a fixed slice of Cleveland's records, so `&hall=3` always holds the same sculptures. The
  number of halls is the larger of the two museums' counts.
- **Up to 4 sculptures per hall** (`PER_HALL_3D`). That's enough to give the hall a middle without
  blocking the walls or the door, and it fits the Quest budget below.

## Steps

### 0. Spike (half a day): settle the unknowns before building
1. **Licence.** The Hayes record's `metadata_usage.access` is "Usage conditions apply". Find the field that says the
   *3D media* is CC0. It may be a 3D entry in `online_media.media[].usage.access`, or something in
   the 3D package. Look at a handful of models. If few are CC0, decide whether to show only
   those or to show all of them with credit and a link.
2. **Stable order.** Run the same search a few times and confirm the rows come back in the same
   order. Halls depend on it.
3. **Loaders.** Confirm A-Frame 1.8 exposes `THREE.GLTFLoader` and `THREE.DRACOLoader`, or import
   them from `three/examples/jsm` against A-Frame's THREE. Copy the Draco decoder into `public/draco/`
   so it's served relative to the page (the build is under `./`) and doesn't depend on gstatic.
4. **Quest budget.** Put 4 Low models and the 14 pictures in one hall on a Quest 3 and check the frame
   rate. Fall back to Thumb for any model you're not near if it struggles.

### 1. Data: `src/smithsonian.ts` and `tests/smithsonian.test.mjs`
- `searchUrl3d(query, rows, start)`, and `models(rows)`: group rows by `model_url` in order.
  A slice owns a model only if the model's first row falls inside it: fetch one row before
  the slice, and drop a model that was already showing in that row.
- `normalizeScene(uuid, svx): Sculpture | null`:
  - Unit scale (`mm` 0.001, `cm` 0.01, `m` 1, `in` 0.0254). Apply the model's rotation, then measure its
    world box in metres: width, depth, height.
  - The Web3D Thumb/Low/Medium/High and AR file URLs from `derivatives`.
  - Title. Maker: the first `name` entry labelled Artist, Maker or Manufacturer, with the dates removed
    (as `museum.ts` does with "Monet (French…)"). Date, medium, `record_link`, `unit_code`.
  - `size`: the museum's own Dimensions text if there is one ("27.3 × 24.8 × 12.7 cm"), otherwise the
    box in cm. `measured: true` whenever `units` is present.
  - The licence, from step 0. Return null for a model we can't show.
- `searchHall3d(query, hall, signal)` returns `{ sculptures, halls }`. It fetches the slice, then
  the scene documents in parallel. A record that fails is skipped, not fatal.
- `sculpture(uuid)` handles a link to a model that has drifted out of its hall, like `artwork(id)`.
- Tests run on a trimmed copy of the Hayes `document.json` and a few search rows saved under
  `tests/fixtures/`: grouping, slice ownership, unit and rotation conversion, maker parsing,
  licence filtering.

### 2. Types: one list of works, two kinds
- `museum.ts`: `Artwork` gets `kind: 'picture'`. A `Sculpture` type (`kind: 'sculpture'`,
  `id: string` such as `si:<uuid>`, `width/depth/height`, `models: { thumb, low, medium, ar, usdz? }`,
  `museum`, `licence`) and `Work = Artwork | Sculpture`.
- Every work gets a `museum` and a `licence`, so the details panel stops hard-coding `MUSEUM` and
  the `CC0` tag (`App.svelte` around lines 37, 400 and 580).

### 3. The model on screen: `sculpture` component (in `picture.ts`, or a new `model.ts`)
- `sculpture="<glb url>"` loads the GLB with Draco, caches it by URL and counts its users (like
  `picture`). The work and its reflection share one parsed scene, cloned, and it's freed when
  the last one goes.
- It applies the model's rotation, converts to metres, centres it on x/z and puts its base at
  y = 0, so the entity's origin is the middle of the base. Until it loads it shows a dim box
  of the right size, and it emits `sculpture-loaded` or `sculpture-error`.
- Swapping the URL swaps the size in place: Low to Medium when selected, and back.

### 4. `src/Sculpture.svelte`
- A plinth (an `a-box` in the frame's materials) sized to the work, with the model on it. Small
  objects stand on a tall plinth so their middle is near eye level (about 1.2 m). Big ones get a
  low base. A pool of light on the floor stands in for the picture's `halo`.
- A label on the plinth's front, set in `Text` like `Hanging`'s, and the size note when it's scaled down.
- `RAYCASTABLE` on the model, with hover and selected states as in `Hanging`.
- The reflection uses the Thumb file (20k faces) rather than the full model.

### 5. Layout: `layout.ts` and `tests/layout.test.mjs`
- `layoutGallery(works)` lays out the pictures as now, and `layoutPlinths(sculptures, room)` puts
  sculptures on the centre line between `lead` and `length - tail`, spaced evenly. They're
  turned to face the entrance, slightly towards the side you walk past.
- Size limits: `maxSculptureHeight` about 3.6 m (the hall is 4.2 m) and a footprint of about 2.2 m,
  scaled down past those and noted with `sizeNote`. This leaves walkways of 1.9 m or more on each side,
  and the next door (right wall, near the far end) stays clear.
- The hall's length is the larger of what the walls need and what the plinths need.
- `view` for a sculpture: stand in front of it, a little to one side, at `viewDistance` from its footprint.
- `tourOrder`: on the way down the left wall, visit each sculpture at its place along the hall.
  Then come back up the right wall as now. `tourStep` and `tourLeaves` take the mixed list.
- `throughDoor` is unchanged. Add a test that no plinth sits within `DOOR.reach` of either door.

### 6. `App.svelte`
- `open()` fetches both museums' halls in parallel (`fetchHall` caches both). It shows whatever
  arrives, and a hall shows "nothing" only if both are empty. The fade and prefetching are unchanged.
- `?art=` takes either kind of id: `135382` for Cleveland, `si:<uuid>` for the Smithsonian. Fix the
  `Number(params.get('art'))` calls at about lines 145 and 299.
- `select()`: for a sculpture, walk to its `view` and look at its middle.
- The details panel shows maker, date and medium, the museum's size text, a True size tag, the
  museum, the licence and a link to the record. "Hang on my wall" becomes "Stand it in my room".
- Text: the subtitle and status count works from both museums ("14 works · 3 sculptures").
- Blink teleport: add the plinths to the teleport collision check, or move a landing spot off a plinth,
  so you never land inside one.

### 7. AR
- In AR, a sculpture uses the AR file (100k faces, 2048 px).
- `placeOnSurface`: on a floor or table, put a sculpture's *base* on the hit point (not `height / 2` above
  it), turned to face you. On a wall hit, show a toast: "Aim at the floor or a table". Add a test.
- `hang()` and `Hung` take a `Work`. The AR panel's "Hang here" becomes "Place here" for a sculpture.
- iPhone, optional: no WebXR AR there, but the `usdz` file opens in Quick Look. "Stand it in my room"
  on iOS Safari could link to it (`<a rel="ar">`) instead of showing the QR code.

### 8. Finish
- Loading state per model, so a failed GLB shows a placeholder rather than an empty plinth.
- README: the new table row (3D works, true size), the second museum and its licence, and a
  shot list line ("search `bust`").
- `pnpm test`, `pnpm check`, and a run on desktop, phone and Quest (VR and AR).

## Open questions
- **Which units to include.** Allow all of them, or only the art and history museums (NPG, SAAM,
  HMSG, CHNDM, NMAH, NMAAHC, FSG)? Recommendation: art and history only at first. A search
  for `cats` finding a skull is funny once, then off-theme.
- **The licence result from step 0**, which may shrink the collection noticeably.
- **Show mode.** Should the radial menu and the four show buttons get a sculpture show (e.g. `Bust`) so
  the feature can be found?

## Estimate
About 4–6 days: half a day for the spike, 1 day for data and types, 1–1.5 for the component and
`Sculpture.svelte`, 1 for layout and tour, 1 for App wiring and AR, and half a day to test on
devices and update the README.
