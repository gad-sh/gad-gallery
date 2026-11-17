// AR on an iPhone (or a Vision Pro): Safari has no WebXR AR, but it opens a USDZ file in
// AR Quick Look, Apple's own viewer. A work becomes a file here, in the page: one panel at
// the work's true size with its print-size picture on the face, anchored to a wall. Quick
// Look shows it at the size it's made (allowsContentScaling=0 stops a pinch from changing
// that), so it hangs at true size, like the WebXR AR does.
//
// usdz() builds the file and is kept free of the DOM, so it's tested in Node.
// quickLook() fetches the picture and opens the file.

// Whether this browser opens AR Quick Look links (Safari on iOS, iPadOS and visionOS).
export function quickLookSupported(): boolean {
	return typeof document !== 'undefined' && document.createElement('a').relList.supports('ar');
}

const PICTURE = 'picture.jpg';
const n = (value: number) => String(Math.round(value * 1e5) / 1e5);

// The scene: a panel in meters, laid out in the anchor's frame. On a wall, Quick Look's +Y
// points out of the wall (and the model's lowest Y sits on it) and +Z runs down the wall. So
// the panel lies in the XZ plane facing +Y, its top toward -Z: from the room you see it
// upright, +X to your right.
export function usda(width: number, height: number): string {
	const w = n(width / 2);
	const h = n(height / 2);
	const material = '/Root/Materials/Paint';
	return `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = "Root"
    }
    kind = "component"
)
{
    token preliminary:anchoring:type = "plane"
    token preliminary:planeAnchoring:alignment = "vertical"

    def Mesh "Picture" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-${w}, 0, ${h}), (${w}, 0, ${h}), (${w}, 0, -${h}), (-${w}, 0, -${h})]
        float3[] extent = [(-${w}, 0, -${h}), (${w}, 0, ${h})]
        normal3f[] normals = [(0, 1, 0), (0, 1, 0), (0, 1, 0), (0, 1, 0)] (
            interpolation = "vertex"
        )
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
            interpolation = "vertex"
        )
        uniform token subdivisionScheme = "none"
        rel material:binding = <${material}>
    }

    def Scope "Materials"
    {
        def Material "Paint"
        {
            token outputs:surface.connect = <${material}/Surface.outputs:surface>

            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = <${material}/Image.outputs:rgb>
                float inputs:metallic = 0
                float inputs:roughness = 0.9
                token outputs:surface
            }

            def Shader "St"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                string inputs:varname = "st"
                float2 outputs:result
            }

            def Shader "Image"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${PICTURE}@
                float2 inputs:st.connect = <${material}/St.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb
            }
        }
    }
}
`;
}

// ——— A USDZ is a zip with nothing compressed, the scene file first, and every file's data
// starting on a multiple of 64 bytes (padded with an extra field in its local header).

const CRC = new Uint32Array(256).map((_, i) => {
	let c = i;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});
export function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	for (const file of files) {
		const name = encoder.encode(file.name);
		const crc = crc32(file.data);
		const size = file.data.length;
		// An extra field is at least its 4-byte header; pad it so the data lands on 64.
		const over = (offset + 30 + name.length + 4) % 64;
		const extra = 4 + (over ? 64 - over : 0);

		const local = new DataView(new ArrayBuffer(30 + name.length + extra));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true); // version needed
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);
		local.setUint32(22, size, true);
		local.setUint16(26, name.length, true);
		local.setUint16(28, extra, true);
		new Uint8Array(local.buffer).set(name, 30);
		local.setUint16(30 + name.length, 0x1986, true); // the padding's own id
		local.setUint16(32 + name.length, extra - 4, true);
		locals.push(new Uint8Array(local.buffer), file.data);

		const central = new DataView(new ArrayBuffer(46 + name.length));
		central.setUint32(0, 0x02014b50, true);
		central.setUint16(4, 20, true); // version made by
		central.setUint16(6, 20, true); // version needed
		central.setUint32(16, crc, true);
		central.setUint32(20, size, true);
		central.setUint32(24, size, true);
		central.setUint16(28, name.length, true);
		central.setUint32(42, offset, true);
		new Uint8Array(central.buffer).set(name, 46);
		centrals.push(new Uint8Array(central.buffer));

		offset += local.byteLength + size;
	}
	const directory = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, directory, true);
	end.setUint32(16, offset, true);

	const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

// The file for a work: its size in meters and its picture as JPEG bytes.
export function usdz(width: number, height: number, jpeg: Uint8Array): Uint8Array {
	return zip([
		{ name: 'salon.usda', data: new TextEncoder().encode(usda(width, height)) },
		{ name: PICTURE, data: jpeg },
	]);
}

// Fetch the picture, build the file and open it in AR Quick Look. Safari only takes a link
// with rel="ar" that holds an image, and a blob link needs a file name.
export async function quickLook(work: { width: number; height: number; print: string; image: string }, name: string): Promise<void> {
	let response = await fetch(work.print);
	if (!response.ok) response = await fetch(work.image);
	if (!response.ok) throw new Error(`The picture didn't load (${response.status})`);
	const file = usdz(work.width, work.height, new Uint8Array(await response.arrayBuffer()));
	const url = URL.createObjectURL(new Blob([file as BlobPart], { type: 'model/vnd.usdz+zip' }));
	const link = document.createElement('a');
	link.rel = 'ar';
	link.href = `${url}#allowsContentScaling=0`;
	link.download = `${name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'work'}.usdz`;
	link.appendChild(document.createElement('img'));
	link.click();
	// Quick Look has read the file once it's open; let it go a while after.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
