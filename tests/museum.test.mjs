import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE, PER_HALL, hallCount, normalize, pick, searchUrl, setBase, sizeLabel } from '../src/museum.ts';

const record = (over = {}) => ({
	id: 1,
	title: ' The Red Kerchief ',
	creation_date: 'c. 1868–73',
	technique: 'oil on fabric',
	type: 'Painting',
	url: 'https://clevelandart.org/art/1958.39',
	creators: [{ description: 'Claude Monet (French, 1840–1926)' }],
	dimensions: { framed: { height: 1.283, width: 1.057, depth: 0.146 }, unframed: { height: 0.99, width: 0.798 } },
	images: { web: { url: 'https://openaccess-cdn.clevelandart.org/1958.39/1958.39_web.jpg', width: '723', height: '900' } },
	...over,
});

test('a record becomes an artwork at its unframed size, with a same-origin picture', () => {
	const work = normalize(record());
	assert.equal(work.title, 'The Red Kerchief');
	assert.equal(work.artist, 'Claude Monet');
	assert.equal(work.image, '/art/1958.39/1958.39_web.jpg');
	// No print-size picture: the web one again.
	assert.equal(work.print, '/art/1958.39/1958.39_web.jpg');
	const print = normalize(record({ images: { web: { url: 'https://openaccess-cdn.clevelandart.org/1958.39/1958.39_web.jpg', width: '723', height: '900' }, print: { url: 'https://openaccess-cdn.clevelandart.org/1958.39/1958.39_print.jpg', width: '2732', height: '3400' } } }));
	assert.equal(print.print, '/art/1958.39/1958.39_print.jpg');
	assert.equal(work.measured, true);
	// The picture's proportions, inside the measured 0.99 × 0.798 box.
	assert.ok(Math.abs(work.width / work.height - 723 / 900) < 1e-9);
	assert.ok(work.height <= 0.99 + 1e-9 && work.width <= 0.798 + 1e-9);
	// The label is the museum's own measurement.
	assert.equal(sizeLabel(work), '99 × 79.8 cm');
});

test('no picture, or one from elsewhere, is dropped', () => {
	assert.equal(normalize(record({ images: {} })), null);
	assert.equal(normalize(record({ images: { web: { url: 'https://example.org/x.jpg', width: '1', height: '1' } } })), null);
	assert.equal(normalize(null), null);
});

test('no recorded size is a guess, and says so', () => {
	const work = normalize(record({ dimensions: {}, creators: [], culture: ['Japan, Edo period'] }));
	assert.equal(work.measured, false);
	assert.equal(work.height, 0.6);
	assert.equal(work.artist, 'Japan, Edo period');
	assert.equal(sizeLabel(work), 'Size unknown');
});

test('paintings come first, then other flat works, and the show is capped', () => {
	const records = [record({ id: 1, type: 'Sculpture' }), record({ id: 2, type: 'Print' }), record({ id: 3, images: {} }), record({ id: 4 }), record({ id: 5, type: 'Print' })];
	assert.deepEqual(pick(records, 3).map((work) => work.id), [4, 2, 5]);
	assert.deepEqual(pick(records, 9).map((work) => work.id), [4, 2, 5, 1]);
});

test('the search asks for open-access works with pictures', () => {
	const url = new URL(searchUrl('van gogh & co', 42), 'https://salon.example');
	assert.equal(url.pathname, '/collection/api/artworks/');
	assert.equal(url.searchParams.get('q'), 'van gogh & co');
	assert.equal(url.searchParams.get('cc0'), '1');
	assert.equal(url.searchParams.get('has_image'), '1');
	assert.equal(url.searchParams.get('limit'), '42');
});

// The Cleveland Museum's swords 1916.715 and 1916.744: a length overall, then the parts.
const sword = (dimensions) => record({ type: 'Arms and Armor', dimensions, images: { web: { url: 'https://openaccess-cdn.clevelandart.org/1916.715/1916.715_web.jpg', width: '459', height: '900' } } });

test('a work measured only by its length is that long, along the photo’s longer side', () => {
	const work = normalize(sword({ overall: { length: 0.702 }, blade: { length: 0.569 } }));
	assert.equal(work.measured, true);
	assert.equal(work.height, 0.702);
	assert.ok(Math.abs(work.width - 0.702 * (459 / 900)) < 1e-9);
	assert.equal(sizeLabel(work), '70.2 cm long');
});

test('a part’s size is never the work’s', () => {
	const work = normalize(sword({ overall: { length: 0.798 }, blade: { height: 0.604, width: 0.039 }, handle: { height: 0.18, width: 0.2, depth: 0.078 } }));
	assert.equal(work.height, 0.798);
	assert.equal(sizeLabel(work), '79.8 cm long');
	// Only parts: no size at all, rather than a part's.
	const parts = normalize(sword({ blade: { height: 0.604, width: 0.039 } }));
	assert.equal(parts.measured, false);
	assert.equal(sizeLabel(parts), 'Size unknown');
});

test('a height alone, and a diameter, size the photo too', () => {
	const vase = normalize(record({ type: 'Ceramic', dimensions: { overall: { height: 0.3 }, diameter: { width: 0.2 } } }));
	assert.equal(vase.height, 0.3);
	assert.equal(sizeLabel(vase), '30 cm high');
	const dish = normalize(record({ type: 'Ceramic', dimensions: { diameter: { width: 0.25 } }, images: { web: { url: 'https://openaccess-cdn.clevelandart.org/x/x_web.jpg', width: '900', height: '900' } } }));
	assert.equal(dish.width, 0.25);
	assert.equal(dish.height, 0.25);
	assert.equal(sizeLabel(dish), '25 cm across');
});

test('served from a folder, the museum paths are in that folder', () => {
	try {
		setBase('/museum/');
		assert.equal(new URL(searchUrl('monet', 5), 'https://gad.sh').pathname, '/museum/collection/api/artworks/');
		assert.equal(normalize(record()).image, '/museum/art/1958.39/1958.39_web.jpg');
		// With or without the closing slash.
		setBase('/museum');
		assert.equal(normalize(record()).image, '/museum/art/1958.39/1958.39_web.jpg');
	} finally {
		setBase('/');
	}
	assert.equal(normalize(record()).image, '/art/1958.39/1958.39_web.jpg');
});

test('each hall is its own fixed slice of the search', () => {
	setBase('/');
	const url = (hall) => new URL(searchUrl('flowers', PAGE, (hall - 1) * PAGE), 'https://gad.sh');
	assert.equal(url(1).searchParams.get('skip'), null);
	assert.equal(url(3).searchParams.get('skip'), String(2 * PAGE));
	assert.equal(url(3).searchParams.get('limit'), String(PAGE));
	assert.equal(PAGE, PER_HALL * 3);
});

test('a show has as many halls as its results fill', () => {
	assert.equal(hallCount(0), 1);
	assert.equal(hallCount(18), 1);
	assert.equal(hallCount(PAGE), 1);
	assert.equal(hallCount(PAGE + 1), 2);
	assert.equal(hallCount(1799), 43);
});
