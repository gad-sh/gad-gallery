import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM, layoutGallery, placeAhead, placeOnSurface, screenDistance, sizeNote, surfaceNormal, throughDoor, tourLeaves, tourOrder, tourStep, turn, viewDistance } from '../src/layout.ts';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('works alternate walls, face into the room, and never overlap', () => {
	const works = [
		{ width: 0.8, height: 1 },
		{ width: 1.2, height: 0.9 },
		{ width: 0.5, height: 0.4 },
		{ width: 2, height: 1.5 },
		{ width: 0.3, height: 0.3 },
	];
	const room = layoutGallery(works);
	assert.equal(room.hangs.length, 5);
	for (const hang of room.hangs) {
		const left = hang.index % 2 === 0;
		assert.equal(Math.sign(hang.x), left ? -1 : 1);
		assert.equal(hang.yaw, left ? 90 : -90);
		assert.equal(hang.scale, 1);
		// Inside the hall, and you stand inside it too, on the picture's side of the far wall.
		assert.ok(-hang.z + hang.width / 2 < room.length);
		assert.ok(Math.abs(hang.view.x) < room.width / 2);
		assert.equal(hang.view.z, hang.z);
	}
	for (const side of [0, 1]) {
		const row = room.hangs.filter((hang) => hang.index % 2 === side);
		for (let i = 1; i < row.length; i++) {
			const gap = -row[i].z - row[i].width / 2 - (-row[i - 1].z + row[i - 1].width / 2);
			near(gap, ROOM.gap);
		}
	}
});

test('a work too big for the wall is scaled down, and stays off the floor', () => {
	const [hang] = layoutGallery([{ width: 9, height: 6 }]).hangs;
	assert.ok(hang.scale < 1);
	assert.ok(hang.width <= ROOM.maxWidth + 1e-9 && hang.height <= ROOM.maxHeight + 1e-9);
	near(hang.width / hang.height, 1.5);
	assert.ok(hang.y - hang.height / 2 >= 0.44);
	assert.ok(hang.y + hang.height / 2 < ROOM.height);
});

test('an empty show still has a hall', () => {
	const room = layoutGallery([]);
	assert.equal(room.length, ROOM.minLength);
});

// A quaternion turning +Y onto the given axis.
const yTo = { '+z': { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, '-x': { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, '+y': { x: 0, y: 0, z: 0, w: 1 } };

test('surfaceNormal is the pose’s +Y', () => {
	const z = surfaceNormal(yTo['+z']);
	near(z.x, 0), near(z.y, 0), near(z.z, 1);
	const x = surfaceNormal(yTo['-x']);
	near(x.x, -1), near(x.y, 0), near(x.z, 0);
});

test('on a wall a picture hangs flat, centered on the hit, facing out', () => {
	const head = { x: 0, y: 1.6, z: 0 };
	const facingZ = placeOnSurface({ position: { x: 1, y: 1.5, z: -2 }, orientation: yTo['+z'] }, head, 1);
	assert.equal(facingZ.on, 'wall');
	near(facingZ.yaw, 0);
	near(facingZ.position.y, 1.5);
	near(facingZ.position.z, -2 + 0.03);
	const facingMinusX = placeOnSurface({ position: { x: 3, y: 1.5, z: 0 }, orientation: yTo['-x'] }, head, 1);
	near(facingMinusX.yaw, -90);
	near(facingMinusX.position.x, 3 - 0.03);
});

test('on a table a picture stands on the hit and faces you', () => {
	const placed = placeOnSurface({ position: { x: 0, y: 0.7, z: -1 }, orientation: yTo['+y'] }, { x: 1, y: 1.6, z: 0 }, 0.5);
	assert.equal(placed.on, 'surface');
	near(placed.position.y, 0.7 + 0.25 + 0.03);
	near(placed.yaw, 45);
});

test('placeAhead puts it in front of you, facing back', () => {
	const ahead = placeAhead({ x: 0, y: 1.6, z: 0 }, 0, 1.4);
	near(ahead.position.z, -1.4), near(ahead.position.x, 0), near(ahead.yaw, 0);
	const turned = placeAhead({ x: 0, y: 1.6, z: 0 }, Math.PI / 2, 1);
	near(turned.position.x, -1), near(turned.yaw, 90);
});

test('turn takes the short way round', () => {
	near(turn(3, -3), 2 * Math.PI - 6);
	near(turn(0, 1), 1);
});

test('an upright phone stands further back than a wide screen, so the work fits', () => {
	const work = { width: 2, height: 1 };
	const wide = screenDistance(work, 80, 16 / 9);
	const tall = screenDistance(work, 80, 9 / 20);
	assert.ok(wide >= viewDistance(work));
	assert.ok(tall > wide);
	// At that distance the work is 80% of the view's width.
	const viewWidth = 2 * tall * Math.tan((80 * Math.PI) / 360) * (9 / 20);
	near(work.width / viewWidth, 0.8);
});

test('a work is true size, or says why not: never both', () => {
	assert.equal(sizeNote(true, 1), '');
	assert.equal(sizeNote(true, 0.604), 'Shown at 60% of its size');
	assert.equal(sizeNote(false, 1), 'Size unknown');
	assert.equal(sizeNote(false, 0.5), 'Size unknown');
});

test('the tour goes down one wall and back up the other', () => {
	assert.deepEqual(tourOrder(7), [0, 2, 4, 6, 5, 3, 1]);
	assert.deepEqual(tourOrder(1), [0]);
	// It changes wall only twice in a full loop of a real layout.
	const hangs = layoutGallery(Array.from({ length: 14 }, () => ({ width: 1, height: 1 }))).hangs;
	const sides = tourOrder(14).map((index) => Math.sign(hangs[index].x));
	const switches = sides.filter((side, i) => side !== sides[(i + 1) % sides.length]).length;
	assert.equal(switches, 2);
	// And along a wall each step moves further down the hall (then back up the other).
	const left = tourOrder(14).slice(0, 7).map((index) => hangs[index].z);
	assert.deepEqual(left, [...left].sort((a, b) => b - a));
});

test('stepping follows the tour, both ways, and wraps', () => {
	assert.equal(tourStep(7, null, 1), 0);
	assert.equal(tourStep(7, null, -1), 1);
	assert.equal(tourStep(7, 0, 1), 2);
	assert.equal(tourStep(7, 6, 1), 5);
	assert.equal(tourStep(7, 1, 1), 0);
	assert.equal(tourStep(7, 0, -1), 1);
	assert.equal(tourStep(7, 5, -1), 6);
	assert.equal(tourStep(0, null, 1), null);
});

test('walking into a door goes through it, but only a door that is there', () => {
	const room = { length: 20, back: 4 };
	const both = { next: true, previous: true };
	assert.equal(throughDoor(room, 0, -19.5, both), 1);
	assert.equal(throughDoor(room, 0.2, 3.5, both), -1);
	// Beside the door, or still in the hall.
	assert.equal(throughDoor(room, 1.5, -19.5, both), 0);
	assert.equal(throughDoor(room, 0, -17, both), 0);
	// Where you start is well clear of the door behind you.
	assert.equal(throughDoor(room, 0, 1.6, both), 0);
	// The first hall has no door back; the last none on.
	assert.equal(throughDoor(room, 0, 3.5, { next: true, previous: false }), 0);
	assert.equal(throughDoor(room, 0, -19.5, { next: false, previous: true }), 0);
});

test('the tour runs off its ends into the next and previous halls', () => {
	const order = tourOrder(5); // [0, 2, 4, 3, 1]
	assert.equal(tourLeaves(5, order.at(-1), 1), 1);
	assert.equal(tourLeaves(5, order[0], -1), -1);
	assert.equal(tourLeaves(5, order[2], 1), 0);
	assert.equal(tourLeaves(5, order[2], -1), 0);
	// Not on the tour yet: it starts in this hall.
	assert.equal(tourLeaves(5, null, 1), 0);
	assert.equal(tourLeaves(0, null, 1), 0);
});
