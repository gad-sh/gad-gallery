<script lang="ts">
	// A QR code for a URL, as an SVG.
	import qrcode from 'qrcode-generator';

	let { text, size = 220 }: { text: string; size?: number } = $props();

	const code = $derived.by(() => {
		const qr = qrcode(0, 'M');
		qr.addData(text);
		qr.make();
		const count = qr.getModuleCount();
		let path = '';
		for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) if (qr.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`;
		return { count, path };
	});
</script>

<svg width={size} height={size} viewBox="-2 -2 {code.count + 4} {code.count + 4}" role="img" aria-label="QR code for {text}" shape-rendering="crispEdges">
	<rect x="-2" y="-2" width={code.count + 4} height={code.count + 4} rx="1" fill="#fff" />
	<path d={code.path} fill="#0a0b0e" />
</svg>
