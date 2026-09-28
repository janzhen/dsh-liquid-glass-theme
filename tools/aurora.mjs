/**
* Measurement + render harness for the liquid-glass aurora backdrop.
*
* It loads the *real* lib/client.js through a fake module loader and a fake
* `document`, captures the stylesheets `apply()` installs, and then evaluates
* the emitted CSS itself: body gradient -> six radial blobs (bottom-to-top, the
* way CSS paints a multi-layer background) -> the surface stacks from the token
* sheet. Math.random is stubbed with a seeded PRNG, so two runs against
* different palette tables use *identical* geometry and the delta is the colour
* change alone.
*
*   node tools/aurora.mjs measure [--file=lib/client.js] [--builds=200]
*   node tools/aurora.mjs render  [--file=lib/client.js] [--seed=7] [--tag=aurora]
*                                 [--sheets=bg-base,bg-base] [--out=.scratch]
*   node tools/aurora.mjs compare [--file=lib/client.js] [--old=/tmp/old-client.js]
*                                 [--seed=42] [--out=.scratch/compare.png]
*
* `measure` reports worst-case and mean contrast per surface stack plus coverage
* and dead zone; `render` writes PNGs; `compare` writes one contact sheet with
* light/dark as rows and the two files as columns, at a shared seed, so the pair
* differs only in palette. `--sheets` names the token sheets to stack over the
* backdrop (`bg-base,bg-base` is the frame plus the conversation root, i.e. what
* the user actually sees through the glass); an empty value renders the bare
* backdrop.
*/
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const VIEWPORT = [1440, 900];
const TEXT = "--dsw-alias-label-primary";

/* ------------------------------------------------------------------ roll -- */

/** Seeded PRNG so a given build index rolls the same numbers in every run. */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
* Run the plugin's browser half with a seeded Math.random and collect the
* stylesheets installStyles() appends.
* @param file - path to the client module.
* @param seed - PRNG seed for this build.
* @returns map of facet name to CSS text.
*/
function buildStyles(file, seed) {
	const sheets = [];
	const document = {
		createElement: () => ({ dataset: {}, textContent: "", remove() {} }),
		head: { appendChild: (el) => sheets.push(el) }
	};
	const win = { __ModuleLoader__: { load: (spec) => { win.spec = spec; } } };
	const code = fs.readFileSync(file, "utf8");
	const realRandom = Math.random;
	Math.random = mulberry32(seed);
	try {
		new Function("window", "document", code)(win, document);
		const module = win.spec.factory(() => { throw new Error("unexpected require()"); });
		module.apply({ effect: (cb) => { cb(); } });
	} finally {
		Math.random = realRandom;
	}
	const out = {};
	for (const el of sheets) out[el.dataset.pluginCss] = el.textContent;
	return out;
}

/* ----------------------------------------------------------- CSS parsing -- */

/** Split on top-level commas (parens are not split). */
function splitTop(text) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const ch of text) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	if (current.trim()) parts.push(current);
	return parts.map((p) => p.trim());
}

/** Every `selector { body }` pair in a sheet. */
function blocks(css) {
	const out = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ((m = re.exec(css))) out.push([m[1].trim(), m[2].trim()]);
	return out;
}

/** Declarations of one selector block, as a plain object. */
function decls(body) {
	const out = {};
	for (const part of body.split(";")) {
		const i = part.indexOf(":");
		if (i < 0) continue;
		out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
	}
	return out;
}

/** "#rrggbb" to [r, g, b]. */
function hexToRgb(hex) {
	const h = hex.replace("#", "");
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** HSL (h in degrees, s/l in percent) to [r, g, b]. */
function hslToRgb(h, s, l) {
	h = ((h % 360) + 360) % 360;
	s /= 100;
	l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const sector = Math.floor(h / 60);
	const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector % 6];
	return rgb.map((v) => Math.round((v + m) * 255));
}

/** "hsla(101, 62%, 55%, 0.55)" to { rgb, alpha }. */
function hslaToRgba(text) {
	const m = text.match(/hsla\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/);
	if (!m) throw new Error("unparsable colour: " + text);
	return { rgb: hslToRgb(+m[1], +m[2], +m[3]), alpha: +m[4] };
}

/** "linear-gradient(168deg, #eaf0fa 0%, ...)" to { angle, stops }. */
function parseLinear(value) {
	const inner = value.slice(value.indexOf("(") + 1, value.lastIndexOf(")"));
	const parts = splitTop(inner);
	let angle = 180;
	if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift());
	const stops = parts.map((p) => {
		const [color, pos] = p.split(/\s+/);
		return { rgb: hexToRgb(color), pos: parseFloat(pos) };
	});
	return { angle, stops };
}

/** The comma-separated radial-gradient list to a blob array. */
function parseBlobs(value) {
	return splitTop(value).map((g) => {
		const m = g.match(/radial-gradient\((\d+)px (\d+)px at (-?[\d.]+)% (-?[\d.]+)%, (.+), transparent (-?[\d.]+)%\)/);
		if (!m) throw new Error("unparsable blob: " + g);
		const color = hslaToRgba(m[5]);
		return { w: +m[1], h: +m[2], x: +m[3], y: +m[4], rgb: color.rgb, alpha: color.alpha, stop: +m[6] / 100, hsla: m[5] };
	});
}

/**
 * Resolve one level of `var(--token)` indirection inside a token table. The
 * theme spells the menu family through the product's own alias
 * (`--dsw-specific-menu: var(--dsw-menu-surface-fill)`), so a stack that
 * consumes either token has to measure the colour the pair actually composites
 * to rather than the literal text of one declaration.
 * @param table - token name to declared value.
 * @returns the table with single-var values replaced by their referent.
 */
function resolveAliases(table) {
	const out = { ...table };
	for (const [key, value] of Object.entries(out)) {
		const m = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
		if (!m) continue;
		const target = out[m[1]];
		if (target === undefined) throw new Error(`${key} aliases missing token ${m[1]}`);
		if (/^var\(/.test(target)) throw new Error(`${key} aliases ${m[1]}, which is itself an alias`);
		out[key] = target;
	}
	return out;
}

/** Pull the three sheets this harness needs out of a build. */
function parseBuild(styles) {
	const aurora = blocks(styles["dsh-liquid-glass-theme/aurora"]);
	const tokens = blocks(styles["dsh-liquid-glass-theme/tokens"]);
	const pick = (list, selector) => list.find(([sel]) => sel === selector);
	const out = { tokens: {}, aurora: {} };
	for (const [sel, body] of tokens) {
		const key = sel === "body" ? "light" : "dark";
		out.tokens[key] = resolveAliases(Object.fromEntries(Object.entries(decls(body))));
	}
	for (const [sel, body] of aurora) {
		const dark = sel.includes("dark");
		const palette = dark ? "dark" : "light";
		const d = decls(body);
		if (sel.includes("::before")) out.aurora[palette + "Blobs"] = parseBlobs(d.background);
		else out.aurora[palette + "Base"] = parseLinear(d.background);
	}
	return out;
}

/* --------------------------------------------------------- colour maths -- */

/** Composite a source [r,g,b,a] over an opaque [r,g,b]. */
function over(rgb, src) {
	const a = src[3];
	return [rgb[0] + (src[0] - rgb[0]) * a, rgb[1] + (src[1] - rgb[1]) * a, rgb[2] + (src[2] - rgb[2]) * a];
}

/** Parse "#rrggbb" or "rgba(r,g,b,a)" to [r,g,b,a]. */
function rgba(text) {
	if (text.startsWith("#")) return hexToRgb(text).concat(1);
	const m = text.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
	if (!m) throw new Error("unparsable colour: " + text);
	return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
}

/** WCAG relative luminance of an [r,g,b]. */
function luminance(rgb) {
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two [r,g,b]. */
function contrast(a, b) {
	const [y1, y2] = [luminance(a), luminance(b)];
	return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
}

/** The body gradient's colour at a viewport point. */
function baseAt(linear, px, py, w, h) {
	const th = (linear.angle * Math.PI) / 180;
	const dx = Math.sin(th);
	const dy = -Math.cos(th);
	const len = Math.abs(w * dx) + Math.abs(h * dy);
	const t = ((px - w / 2) * dx + (py - h / 2) * dy) / len + 0.5;
	const p = Math.max(0, Math.min(1, t)) * 100;
	const stops = linear.stops;
	if (p <= stops[0].pos) return stops[0].rgb.slice();
	for (let i = 1; i < stops.length; i++) {
		if (p <= stops[i].pos) {
			const k = (p - stops[i - 1].pos) / (stops[i].pos - stops[i - 1].pos);
			return stops[i - 1].rgb.map((c, j) => c + (stops[i].rgb[j] - c) * k);
		}
	}
	return stops[stops.length - 1].rgb.slice();
}

/** Blob alpha covering a point: 1 - product(1 - a_i), bottom layer first. */
function coverageAt(blobs, px, py, w, h) {
	let open = 1;
	for (const b of blobs) {
		const d = Math.hypot((px - (b.x / 100) * w) / b.w, (py - (b.y / 100) * h) / b.h);
		if (d >= b.stop) continue;
		open *= 1 - b.alpha * (1 - d / b.stop);
	}
	return 1 - open;
}

/** The composited backdrop colour at a point: base, then blobs bottom-to-top. */
function backdropAt(build, palette, px, py, w, h) {
	let rgb = baseAt(build.aurora[palette + "Base"], px, py, w, h);
	const blobs = build.aurora[palette + "Blobs"];
	for (let i = blobs.length - 1; i >= 0; i--) {
		const b = blobs[i];
		const d = Math.hypot((px - (b.x / 100) * w) / b.w, (py - (b.y / 100) * h) / b.h);
		if (d >= b.stop) continue;
		rgb = over(rgb, [b.rgb[0], b.rgb[1], b.rgb[2], b.alpha * (1 - d / b.stop)]);
	}
	return rgb;
}

/* ---------------------------------------------------------------- stacks -- */

const TOKEN = (name) => "--dsw-alias-" + name;
const STACKS = [
	["单纸 base×1", ["bg-base"]],
	["会话栈 base×2", ["bg-base", "bg-base"]],
	["页面+卡片 +layer-1", ["bg-base", "bg-base", "bg-layer-1"]],
	["卡片套卡片 +layer-1×2", ["bg-base", "bg-base", "bg-layer-1", "bg-layer-1"]],
	["浮层 +layer-1+layer-2", ["bg-base", "bg-base", "bg-layer-1", "bg-layer-2"]],
	["菜单 menu", ["bg-base", "bg-base", "bg-layer-1", "specific-menu"]]
];

/** Stack the sheets over a backdrop colour. */
function through(rgb, tokens, sheets) {
	let out = rgb;
	for (const sheet of sheets) {
		const key = sheet.startsWith("specific-") ? "--dsw-" + sheet : TOKEN(sheet);
		out = over(out, rgba(tokens[key]));
	}
	return out;
}

/* ------------------------------------------------------------- measures -- */

/** [x, y] grid over the viewport at a fixed step, inset half a step. */
function grid(step = 16) {
	const [w, h] = VIEWPORT;
	const pts = [];
	for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) pts.push([x, y]);
	return pts;
}

/**
 * Composited luminance at one blob's own centre: what that mass actually reads
 * as once the base gradient and every layer above it have been painted.
 * @param build - the parsed build.
 * @param palette - "light" or "dark".
 * @param index - row in the blob table.
 * @returns the WCAG relative luminance.
 */
function massLuminance(build, palette, index) {
	const [w, h] = VIEWPORT;
	const b = build.aurora[palette + "Blobs"][index];
	return luminance(backdropAt(build, palette, (b.x / 100) * w, (b.y / 100) * h, w, h));
}

/** Per-build measurement of one palette: contrast per stack, coverage, dead zone, mass balance. */
function measureBuild(build, palette, pts) {
	const [w, h] = VIEWPORT;
	const tokens = build.tokens[palette];
	const text = rgba(tokens[TEXT]).slice(0, 3);
	const blobs = build.aurora[palette + "Blobs"];
	const backdrops = pts.map(([x, y]) => backdropAt(build, palette, x, y, w, h));
	const out = { coverage: 0, dead: 0, contrast: {}, balance: massLuminance(build, palette, 0) / massLuminance(build, palette, 1) };
	for (const [label, sheets] of STACKS) out.contrast[label] = Infinity;
	for (let i = 0; i < pts.length; i++) {
		const cov = coverageAt(blobs, pts[i][0], pts[i][1], w, h);
		out.coverage += cov;
		if (cov < 0.02) out.dead++;
		for (const [label, sheets] of STACKS) {
			const c = contrast(through(backdrops[i], tokens, sheets), text);
			if (c < out.contrast[label]) out.contrast[label] = c;
		}
	}
	out.coverage /= pts.length;
	out.dead /= pts.length;
	return out;
}

/** Run `builds` seeded builds and reduce to min/mean per stack. */
function measure(file, builds) {
	const pts = grid();
	const acc = { light: {}, dark: {} };
	for (const palette of ["light", "dark"]) {
		acc[palette] = { stacks: {}, coverage: [], dead: [], balance: [] };
		for (const [label] of STACKS) acc[palette].stacks[label] = [];
	}
	let sample = null;
	for (let i = 0; i < builds; i++) {
		const build = parseBuild(buildStyles(file, 1000 + i));
		if (!sample) sample = build;
		for (const palette of ["light", "dark"]) {
			const m = measureBuild(build, palette, pts);
			for (const [label] of STACKS) acc[palette].stacks[label].push(m.contrast[label]);
			acc[palette].coverage.push(m.coverage);
			acc[palette].dead.push(m.dead);
			acc[palette].balance.push(m.balance);
		}
	}
	return { acc, sample };
}

/* -------------------------------------------------------------- renderer -- */

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

/** CRC32 of a buffer, for PNG chunks. */
function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk. */
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/** Write an 8-bit RGB PNG. */
function writePng(file, w, h, rgb) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const stride = w * 3;
	const raw = Buffer.alloc((stride + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[y * (stride + 1)] = 0;
		rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	fs.writeFileSync(file, Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0))
	]));
}

/**
* Render one build to PNG. `sheets` empty renders the bare backdrop; otherwise
* the sheets are stacked over it, which is what the eye actually sees.
* @returns nothing.
*/
function render(file, seed, outDir, tag, sheets) {
	const build = parseBuild(buildStyles(file, seed));
	const panels = ["light", "dark"].map((palette) => panel(build, palette, sheets));
	const scale = 0.5;
	const w = Math.round(VIEWPORT[0] * scale);
	const h = Math.round(VIEWPORT[1] * scale);
	for (let i = 0; i < 2; i++) {
		const file2 = path.join(outDir, `${tag}-${["light", "dark"][i]}.png`);
		writePng(file2, w, h, panels[i]);
		console.log("wrote " + path.relative(ROOT, file2));
	}
}

/** One palette's framebuffer for a build, sheets applied. */
function panel(build, palette, sheets) {
	const [vw, vh] = VIEWPORT;
	const scale = 0.5;
	const w = Math.round(vw * scale);
	const h = Math.round(vh * scale);
	const tokens = build.tokens[palette];
	const rgb = Buffer.alloc(w * h * 3);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let color = backdropAt(build, palette, (x + 0.5) / scale, (y + 0.5) / scale, vw, vh);
			if (sheets.length) color = through(color, tokens, sheets);
			const i = (y * w + x) * 3;
			rgb[i] = Math.round(color[0]);
			rgb[i + 1] = Math.round(color[1]);
			rgb[i + 2] = Math.round(color[2]);
		}
	}
	return rgb;
}

/**
* Contact sheet: rows are light/dark, columns are two builds (typically the old
* file and the new one) at the same seed, so geometry is identical across the
* pair and only the palette differs.
*/
function compare(oldFile, newFile, seed, outFile, sheets) {
	const scale = 0.5;
	const w = Math.round(VIEWPORT[0] * scale);
	const h = Math.round(VIEWPORT[1] * scale);
	const gap = 4;
	const columns = [parseBuild(buildStyles(oldFile, seed)), parseBuild(buildStyles(newFile, seed))];
	const outW = w * 2 + gap;
	const outH = h * 2 + gap;
	const out = Buffer.alloc(outW * outH * 3, 24);
	for (let row = 0; row < 2; row++) {
		const palette = row === 0 ? "light" : "dark";
		for (let col = 0; col < 2; col++) {
			const rgb = panel(columns[col], palette, sheets);
			for (let y = 0; y < h; y++) {
				const src = y * w * 3;
				const dst = ((row * (h + gap) + y) * outW + col * (w + gap)) * 3;
				rgb.copy(out, dst, src, src + w * 3);
			}
		}
	}
	writePng(outFile, outW, outH, out);
	console.log("wrote " + path.relative(ROOT, outFile));
}

/* ------------------------------------------------------------------ main -- */

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => {
	const hit = argv.find((a) => a.startsWith("--" + name + "="));
	return hit ? hit.slice(name.length + 3) : dflt;
};
const file = path.resolve(ROOT, flag("file", "lib/client.js"));

if (cmd === "measure") {
	const builds = +flag("builds", 400);
	const { acc, sample } = measure(file, builds);
	console.log(`\nfile ${path.relative(ROOT, file)} — ${builds} seeded builds\n`);
	for (const palette of ["light", "dark"]) {
		const rows = STACKS.map(([label]) => {
			const list = acc[palette].stacks[label];
			const worst = Math.min(...list);
			const mean = list.reduce((a, b) => a + b, 0) / list.length;
			return `  ${label.padEnd(24)} worst ${worst.toFixed(2).padStart(6)}   mean ${mean.toFixed(2)}`;
		});
		const cov = acc[palette].coverage;
		const dead = acc[palette].dead;
		console.log(palette.toUpperCase());
		console.log(rows.join("\n"));
		console.log(`  ${"极光覆盖 coverage".padEnd(24)} mean ${(cov.reduce((a, b) => a + b) / cov.length).toFixed(3)}   ` +
			`dead zone ${(dead.reduce((a, b) => a + b) / dead.length * 100).toFixed(0)}% (min ${(Math.min(...dead) * 100).toFixed(0)}%, max ${(Math.max(...dead) * 100).toFixed(0)}%)`);
		/* Composited luminance of the green left mass over the blue right mass:
		 * the palette's own balance, with no text or surface in the way. */
		const bal = acc[palette].balance;
		console.log(`  ${"绿块/蓝块 balance".padEnd(24)} mean ${(bal.reduce((a, b) => a + b) / bal.length).toFixed(2)}x   ` +
			`(min ${Math.min(...bal).toFixed(2)}x, max ${Math.max(...bal).toFixed(2)}x)\n`);
	}
	console.log("blob table of build seed 1000 (radius px, position %, fade stop %, colour):");
	for (const palette of ["light", "dark"]) {
		console.log("  " + palette);
		for (const b of sample.aurora[palette + "Blobs"]) {
			console.log(`    ${String(b.w).padStart(5)}×${String(b.h).padEnd(5)} at ${b.x.toFixed(1).padStart(5)}% ${b.y.toFixed(1).padStart(5)}%  stop ${(b.stop * 100).toFixed(0).padStart(3)}%  ${b.hsla}`);
		}
	}
} else if (cmd === "render") {
	const seed = +flag("seed", 7);
	const out = path.resolve(ROOT, flag("out", ".scratch"));
	const tag = flag("tag", "aurora");
	const sheets = flag("sheets", "");
	render(file, seed, out, tag, sheets ? sheets.split(",") : []);
} else if (cmd === "compare") {
	const seed = +flag("seed", 42);
	const out = path.resolve(ROOT, flag("out", ".scratch/compare.png"));
	const sheets = flag("sheets", "bg-base,bg-base");
	compare(path.resolve(ROOT, flag("old", ".scratch/client.original.js")), file, seed, out, sheets ? sheets.split(",") : []);
} else {
	console.log("usage: node .scratch/aurora.mjs measure|render|compare [--file=] [--builds=] [--seed=] [--tag=] [--sheets=]");
}
