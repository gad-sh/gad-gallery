// Where things hang: the gallery's layout for a list of works, and how a work sits on a real
// surface found by an AR hit test. Plain math, no three.js, so it's tested in Node.

export type Sized = { width: number; height: number };

export type Hang = {
	index: number;
	// Center of the picture, and the yaw (degrees) that turns its face into the room.
	x: number;
	y: number;
	z: number;
	yaw: number;
	// Size as shown, in meters, and that size over the real one (1 = true size).
	width: number;
	height: number;
	scale: number;
	// Where to stand to look at it, and the yaw (degrees) a camera there faces it with.
	view: { x: number; z: number; yaw: number };
};

export type Room = {
	// The hall runs from z = back (behind where you start) to z = -length, between x = ±width/2.
	width: number;
	length: number;
	back: number;
	height: number;
	hangs: Hang[];
};

export const ROOM = {
	width: 6,
	height: 4.2,
	back: 4,
	// Where the first work starts, and the wall left free at the far end.
	lead: 2,
	tail: 3.5,
	gap: 1.1,
	// The height of a picture's center: museums hang at about eye level.
	eye: 1.55,
	// The biggest a work is shown. Anything larger is scaled down to fit (and says so).
	maxWidth: 4.3,
	maxHeight: 2.6,
	// How far a picture's face is from its wall.
	proud: 0.04,
	minLength: 9,
};

// How far back to stand from a work of this size.
export function viewDistance({ width, height }: Sized): number {
	return Math.min(3.2, Math.max(1.3, Math.max(width * 0.75, height * 1.05) + 0.5));
}

// The same for a screen: far enough that the work fills at most `fill` of the view, across
// and up (a phone held upright sees a narrow slice, so it stands further back).
// `fov` is the camera's vertical field of view in degrees, `aspect` the view's width / height.
export function screenDistance({ width, height }: Sized, fov: number, aspect: number, fill = { across: 0.8, up: 0.6 }): number {
	const up = Math.tan((fov * Math.PI) / 360);
	return Math.max(viewDistance({ width, height }), width / 2 / (up * aspect * fill.across), height / 2 / (up * fill.up));
}

// A long hall with the works alternating between its two side walls, in order.
export function layoutGallery(works: Sized[], room = ROOM): Room {
	const half = room.width / 2;
	// How far along each wall is taken: left, right. The right starts a little further in,
	// so the two rows are staggered.
	const cursor = [room.lead, room.lead + 0.9];
	const hangs = works.map((work, index): Hang => {
		const scale = Math.min(1, room.maxWidth / work.width, room.maxHeight / work.height);
		const width = work.width * scale;
		const height = work.height * scale;
		const side = index % 2;
		const sign = side === 0 ? -1 : 1;
		const z = -(cursor[side] + width / 2);
		cursor[side] += width + room.gap;
		// Tall works rise so their bottom edge stays off the floor.
		const y = Math.max(room.eye, height / 2 + 0.45);
		const distance = Math.min(viewDistance({ width, height }), room.width - 0.8);
		return {
			index,
			x: sign * (half - room.proud),
			y,
			z,
			yaw: -sign * 90,
			width,
			height,
			scale,
			view: { x: sign * (half - distance), z, yaw: -sign * 90 },
		};
	});
	const length = Math.max(room.minLength, Math.max(...cursor) - room.gap + room.tail);
	return { width: room.width, length, back: room.back, height: room.height, hangs };
}

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

// The pose of a hit test result has its +Y along the surface's normal.
export function surfaceNormal(q: Quat): Vec3 {
	return {
		x: 2 * (q.x * q.y - q.w * q.z),
		y: 1 - 2 * (q.x * q.x + q.z * q.z),
		z: 2 * (q.y * q.z + q.w * q.x),
	};
}

export type Placement = { position: Vec3; yaw: number; on: 'wall' | 'surface' };

// Where a picture of this height goes for a hit on a real surface. On a wall it hangs flat,
// centered on the spot, facing out. On a floor or a table it stands on the spot, like on an
// easel, turned to face you. `yaw` is in degrees, about the vertical; the picture stays level.
export function placeOnSurface(hit: { position: Vec3; orientation: Quat }, head: Vec3, height: number, proud = 0.03): Placement {
	const normal = surfaceNormal(hit.orientation);
	const p = hit.position;
	const degrees = (radians: number) => (radians * 180) / Math.PI;
	if (Math.abs(normal.y) < 0.6) {
		const flat = Math.hypot(normal.x, normal.z);
		const n = { x: normal.x / flat, z: normal.z / flat };
		return {
			position: { x: p.x + n.x * proud, y: p.y, z: p.z + n.z * proud },
			yaw: degrees(Math.atan2(n.x, n.z)),
			on: 'wall',
		};
	}
	return {
		position: { x: p.x, y: p.y + height / 2 + proud, z: p.z },
		yaw: degrees(Math.atan2(head.x - p.x, head.z - p.z)),
		on: 'surface',
	};
}

// A spot in the air in front of you, facing you: where a work waits before you hang it.
export function placeAhead(head: Vec3, headYaw: number, distance = 1.4): Placement {
	return {
		position: { x: head.x - Math.sin(headYaw) * distance, y: head.y - 0.05, z: head.z - Math.cos(headYaw) * distance },
		yaw: (headYaw * 180) / Math.PI,
		on: 'surface',
	};
}

// Smallest signed turn from angle a to b, in radians.
export function turn(a: number, b: number): number {
	return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

// What to say about a work's size on the wall, or '' when it's shown at its true size:
// the museum gave no size (so it's a guess), or it was too big for the wall and scaled down.
export function sizeNote(measured: boolean, scale: number): string {
	if (!measured) return 'Size unknown';
	return scale < 1 ? `Shown at ${Math.round(scale * 100)}% of its size` : '';
}

// The order to visit the works in: down the left wall (the even ones, which layoutGallery
// hangs there), then back up the right wall. A loop round the hall, turning to face the
// other wall only at its two ends, instead of spinning round for every work.
export function tourOrder(count: number): number[] {
	const all = Array.from({ length: count }, (_, index) => index);
	return [...all.filter((index) => index % 2 === 0), ...all.filter((index) => index % 2 === 1).reverse()];
}

// The work `by` steps along the tour from `from` (null: not on the tour yet), wrapping round.
export function tourStep(count: number, from: number | null, by: number): number | null {
	if (!count) return null;
	const order = tourOrder(count);
	const at = from === null ? -1 : order.indexOf(from);
	if (at < 0) return order[by > 0 ? 0 : count - 1];
	return order[(((at + by) % count) + count) % count];
}
