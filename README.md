# Salon

Search a museum's open collection and a gallery builds itself around you, every work at its
real size. Walk it on a phone, a desktop or in a headset. Then press AR and hang the same
works on your own wall, at true size.

A showcase for [gad xr-kit](https://github.com/gad-sh/xr-kit): one web page, one set of
components, three kinds of device.

## Run it

```sh
pnpm install
pnpm dev        # https://localhost:5173
pnpm dev:lan    # the same, reachable from a phone or a headset on your network
```

The kit lives in `kit/` (not committed): a clone of xr-kit's `main`, until the packages it
needs are on npm. `scripts/setup-kit.sh` makes it again from GitHub. A phone or headset will warn
about the dev certificate once; accept it.

`pnpm test` runs the layout and museum-data tests, `pnpm check` type-checks, `pnpm build`
builds a static site. A host has to forward `collection/*` and `art/*` (beside the page) to the
museum (`vercel.json` does it on Vercel; `src/museum.ts` says why).

The build is relative, so it runs at a site's root or under a path. To mount it at
`gad.sh/museum/`, the gad.sh project forwards `/museum/:path*` here as `/:path*`, and
redirects `/museum` to `/museum/` (without the closing slash the relative URLs miss).

## What it shows off

| | Kit feature |
| --- | --- |
| Search panel and work details are HTML on a screen, 3D panels in a headset | `Surface` (`screen` / `vr="hand"` / `vr="follow"`), `Panel`, `Input`, `Button`, `Tag`, `Checkbox`, `Stack` |
| Typing a search in VR | 3D `Input` + `Keyboard` |
| Tap or click the floor to walk | `@gadxr/aframe-tap-to-move` |
| Teleport in VR | `@gadxr/aframe-blink-controls` |
| Hold E / the right grip to swap the whole show | `RadialMenu`, both ways |
| Hang a work on a real wall | A-Frame `ar-hit-test`, following the AR template PR (#7) |
| Camera glides that keep running in a headset | `everyFrame` |
| Wall labels and the title on the far wall | `Text`, used on its own in the scene |
| QR hand-off from desktop to phone or headset | `Modal` |
| Toasts in every mode | `Toaster` in a `Surface` |

And the web's part: the collection is a live API (The Cleveland Museum of Art, Open Access,
CC0), and the URL is the state. `?q=monet&art=135382` opens that show at that work on any
device, which is what the QR code carries.

## A shot list for the video

1. **Desktop.** Load the page: the Monet hall pops in, reflected in the floor. Click the
   floor to walk, click the Water Lilies (4.3 m wide, true size).
2. Type `hokusai` (or hold **E** and flick to it): the hall rebuilds. Turn on **Tour**.
3. Press **V**: the HTML panels become 3D panels in place. Press V again.
4. Click a work, then **Hang on my wall**: a QR code. Scan it with a phone.
5. **Phone.** The same work opens. Drag to look, tap the floor to walk.
6. **Quest, VR.** Open the link, press VR. Teleport with the left stick, pick works with the
   laser, search from your wrist with the VR keyboard, hold the right grip to change shows.
7. **Quest, AR.** Press AR: the hall is gone and the work floats in your room. Hold the
   trigger on a wall and release: it hangs there at its real size. `›` on your wrist, hang
   another. Fill the wall.

## Where things are

- `src/App.svelte`: the page. State, moving, AR, and the markup.
- `src/Hanging.svelte`: one framed work (hall, reflection, your wall).
- `src/museum.ts`: the API and turning a record into a work with a size in meters.
- `src/layout.ts`: where works hang in the hall, and how one sits on a real surface.
- `src/picture.ts`: two small A-Frame components, `picture` and `halo`.

## Not yet tried on real hardware

Checked in a desktop browser, an emulated phone, the kit's VR preview (V) and a faked AR
session. Still to try on devices: a real Quest in VR and AR (hit testing needs the room's
Space Setup), and AR on an Android phone, where taps should both click the panel and hang.
