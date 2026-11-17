import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, usda, usdz } from '../src/quicklook.ts';

test('crc32 matches the standard check value', () => {
	assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('the scene is a wall-anchored panel at true size, centered', () => {
	const scene = usda(0.798, 0.99);
	assert.match(scene, /preliminary:planeAnchoring:alignment = "vertical"/);
	assert.match(scene, /metersPerUnit = 1/);
	assert.match(scene, /\(-0\.399, -0\.495, 0\), \(0\.399, -0\.495, 0\), \(0\.399, 0\.495, 0\), \(-0\.399, 0\.495, 0\)/);
	assert.match(scene, /@picture\.jpg@/);
});

test('the usdz lists the scene first, uncompressed, each file on 64 bytes', () => {
	const jpeg = new Uint8Array(1000).map((_, i) => i % 251);
	const file = usdz(0.5, 0.7, jpeg);
	const view = new DataView(file.buffer);
	const names = [];
	let at = 0;
	while (view.getUint32(at, true) === 0x04034b50) {
		assert.equal(view.getUint16(at + 8, true), 0, 'stored, not compressed');
		const size = view.getUint32(at + 18, true);
		const nameLength = view.getUint16(at + 26, true);
		const extra = view.getUint16(at + 28, true);
		const start = at + 30 + nameLength + extra;
		assert.equal(start % 64, 0);
		const data = file.subarray(start, start + size);
		assert.equal(crc32(data), view.getUint32(at + 14, true));
		names.push(new TextDecoder().decode(file.subarray(at + 30, at + 30 + nameLength)));
		if (names.length === 2) assert.deepEqual(data, jpeg);
		at = start + size;
	}
	assert.deepEqual(names, ['salon.usda', 'picture.jpg']);
	// The end of the central directory, pointing back at it.
	const end = file.length - 22;
	assert.equal(view.getUint32(end, true), 0x06054b50);
	assert.equal(view.getUint16(end + 10, true), 2);
	assert.equal(view.getUint32(end + 16, true), at);
});
