// The collection: the Cleveland Museum of Art's Open Access API (CC0 works, no key).
// It gives each work's real size in meters, which is what lets the gallery, and your wall,
// show it at true scale. Kept free of the DOM and A-Frame, so it's tested in Node.
//
// Both the API and the pictures are reached through this page's own origin (collection/
// and art/ beside the page, proxied in vite.config.ts and vercel.json). The picture CDN sends no CORS headers,
// which WebGL textures need. The API does, but its cache keeps whichever response came
// first for a URL, so after a request without an Origin header (any script) a browser's
// request for the same search is refused.

export type Artwork = {
	id: number;
	title: string;
	artist: string;
	date: string;
	medium: string;
	type: string;
	// The museum's page for the work.
	url: string;
	// Same-origin path of the picture, and of its print-size version (up to 3400 px; the
	// picture again when there is none), for AR Quick Look on an iPhone.
	image: string;
	print: string;
	// Size in meters of the picture as shown: the photo, scaled so what it shows is life size.
	width: number;
	height: number;
	// False when the museum gave no usable size and it's a guess.
	measured: boolean;
	// The museum's own measurement, as text: "99 × 79.8 cm", "70.2 cm long".
	size: string;
};

export const MUSEUM = 'The Cleveland Museum of Art';
const CDN = 'https://openaccess-cdn.clevelandart.org';

// The folder the page is served from: '/' at a site's root, '/museum/' under gad.sh/museum.
// The museum's two paths sit in it, so the page works wherever it's mounted. main.ts sets it.
let base = '/';
export function setBase(path: string) {
	base = path.endsWith('/') ? path : path + '/';
}
const apiBase = () => `${base}collection`;
const imageBase = () => `${base}art`;

// The museum measures a work part by part: { unframed: { height, width }, framed: … } for a
// painting, { overall: { length }, blade: { length }, grip: … } for a sword, { overall:
// { height }, diameter: { width } } for a vase. These are the parts that are the whole thing
// in the photo, best first: the picture before its frame or mount, then the object overall.
// Any other part (a blade, a foot, a lid) is never the work's size.
const WHOLE = ['unframed', 'painting only', 'painting', 'image', 'sheet', 'platemark', 'plate', 'page', 'leaf', 'panel', 'overall', 'diameter', 'outer diameter', 'height', 'mounted', 'framed'];

type Box = { width: number; height: number; size: string };
const cm = (meters: number) => String(Math.round(meters * 1000) / 10);

// The room one measurement leaves the photo, and how to say it. A side it says nothing
// about is Infinity. `wide` is whether the photo is wider than tall: a length is the
// object's longest side, so it goes to the photo's longer one.
export function measure(part: string, d: any, wide: boolean): Box | null {
	const has = (n: unknown): n is number => typeof n === 'number' && n > 0;
	if (!d) return null;
	if (part.includes('diameter')) {
		const across = [d.width, d.height, d.length].find(has);
		return across ? { width: across, height: across, size: `${cm(across)} cm across` } : null;
	}
	if (has(d.height) && has(d.width)) return { width: d.width, height: d.height, size: `${cm(d.height)} × ${cm(d.width)} cm` };
	if (has(d.length)) {
		const other = [d.width, d.height].find(has) ?? Infinity;
		const size = other === Infinity ? `${cm(d.length)} cm long` : `${cm(d.length)} × ${cm(other)} cm`;
		return wide ? { width: d.length, height: other, size } : { width: other, height: d.length, size };
	}
	if (has(d.height)) return { width: Infinity, height: d.height, size: `${cm(d.height)} cm high` };
	if (has(d.width)) return { width: d.width, height: Infinity, size: `${cm(d.width)} cm wide` };
	return null;
}

// Works that hang on a wall come first; photos of objects follow.
const FLAT = new Set(['Painting', 'Print', 'Drawing', 'Photograph', 'Miniature', 'Mixed Media']);
// The height given to a work with no recorded size.
const GUESS_HEIGHT = 0.6;

/* eslint-disable @typescript-eslint/no-explicit-any */

// One API record as an Artwork, or null when it has no picture we can show.
export function normalize(raw: any): Artwork | null {
	const web = raw?.images?.web;
	const pixels = { width: Number(web?.width), height: Number(web?.height) };
	if (!web?.url?.startsWith(CDN) || !(pixels.width > 0) || !(pixels.height > 0)) return null;
	const aspect = pixels.width / pixels.height;

	const dimensions = raw.dimensions ?? {};
	const box = WHOLE.map((part) => measure(part, dimensions[part], aspect >= 1)).find((found) => !!found);
	// Keep the photo's proportions, inside the measured box (the two can differ a little,
	// e.g. a sheet with margins photographed without them).
	const height = box ? Math.min(box.height, box.width / aspect) : GUESS_HEIGHT;
	const width = height * aspect;

	const creator = raw.creators?.[0]?.description ?? raw.culture?.[0] ?? 'Unknown maker';
	return {
		id: raw.id,
		title: String(raw.title ?? 'Untitled').trim(),
		// "Claude Monet (French, 1840–1926)" → "Claude Monet"
		artist: String(creator).split(' (')[0].trim(),
		date: raw.creation_date ?? '',
		medium: raw.technique ?? '',
		type: raw.type ?? '',
		url: raw.url ?? '',
		image: imageBase() + web.url.slice(CDN.length),
		print: imageBase() + (raw.images.print?.url?.startsWith(CDN) ? raw.images.print.url : web.url).slice(CDN.length),
		width,
		height,
		measured: !!box,
		size: box?.size ?? 'Size unknown',
	};
}

// The works for a show: paintings first, then other flat works, then the rest (each in the
// API's order, by relevance).
export function pick(records: any[], limit: number): Artwork[] {
	const works = records.map(normalize).filter((work): work is Artwork => !!work);
	const rank = (work: Artwork) => (work.type === 'Painting' ? 0 : FLAT.has(work.type) ? 1 : 2);
	return [0, 1, 2].flatMap((group) => works.filter((work) => rank(work) === group)).slice(0, limit);
}

// A show is split into halls, each hung from its own fixed slice of the search results: hall
// 1 from the first PAGE records, hall 2 from the next, and so on. The museum returns a search
// in the same order every time, so hall 3 of "flowers" is always the same works (and a link
// to it opens the same hall), without fetching the halls before it.
export const PER_HALL = 14;
// Records looked at per hall: more than are hung, as some have no usable picture.
export const PAGE = PER_HALL * 3;

export function searchUrl(query: string, limit: number, skip = 0): string {
	const params = new URLSearchParams({ q: query, has_image: '1', cc0: '1', limit: String(limit) });
	if (skip) params.set('skip', String(skip));
	return `${apiBase()}/api/artworks/?${params}`;
}

// How many halls a search fills, from the number of records it matches.
export function hallCount(total: number): number {
	return Math.max(1, Math.ceil(total / PAGE));
}

export type Hall = { works: Artwork[]; hall: number; halls: number };

// One hall of a show (`hall` counts from 1).
export async function search(query: string, hall = 1, signal?: AbortSignal): Promise<Hall> {
	const response = await fetch(searchUrl(query, PAGE, (hall - 1) * PAGE), { signal });
	if (!response.ok) throw new Error(`The museum answered ${response.status}`);
	const body = await response.json();
	return { works: pick(body.data ?? [], PER_HALL), hall, halls: hallCount(Number(body.info?.total) || 0) };
}

// One work by its id, or null: for a link to a work its hall no longer has (the museum adds
// works, and the slices shift a little).
export async function artwork(id: number, signal?: AbortSignal): Promise<Artwork | null> {
	const response = await fetch(`${apiBase()}/api/artworks/${id}`, { signal });
	if (!response.ok) return null;
	return normalize((await response.json()).data);
}

// The museum's measurement of a work: "99 × 79.8 cm", "70.2 cm long", "Size unknown".
export function sizeLabel(work: Pick<Artwork, 'size'>): string {
	return work.size;
}
