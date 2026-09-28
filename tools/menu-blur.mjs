/**
 * Composer glass guard: does the frost on `[data-composer-card]` cost the
 * surfaces inside it their own blur, and does it re-anchor their fixed-position
 * bubbles?
 *
 * The composer card is not a leaf. It hosts the `conversation.input.overlay`
 * slot, so the `/` and `@` trigger menu is a DOM descendant of it — MenuSurface
 * renders its `.surface` inline and portals only the darwin `.backing` — and the
 * card's own Tooltip bubbles are `position: fixed` in viewport coordinates
 * while `portal` defaults to false. That makes a `backdrop-filter` on the card
 * load-bearing in two directions at once:
 *
 *   - it forms a backdrop root, so the menu's `blur(40px)` material has nothing
 *     to filter and the backdrop shows through its 58%-opaque fill perfectly
 *     sharp (high-frequency energy at exactly the fill's transmission, and
 *     identical with the material's blur deleted);
 *   - it becomes the containing block for fixed descendants, so a
 *     `position: fixed` probe inside the card lands at the card's origin
 *     instead of the viewport's.
 *
 * The shipped shape moves the filter to a `::before` and gives the card its own
 * stacking context (`z-index: 0`), which keeps the frost and drops both side
 * effects. This tool measures that tri-state per variant, in real Chromium,
 * against the real product CSS:
 *
 *   shipped                        — what lib/client.js mounts today (PASS row)
 *   trap: filter on the card       — the pre-fix shape, for the regression story
 *   shipped minus stacking context — why `z-index: 0` is load-bearing
 *   no card filter at all          — mechanism control (menu at full strength)
 *   opaque menu fill at 0.94        — an opaque fill hides the backdrop, it does not blur it
 *
 * The backdrop behind the card is a 2px stripe field over the real aurora, so
 * "blurred" is a number rather than an opinion; the conversation panel analogue
 * between the aurora and the card carries `--dsw-alias-bg-base`, which is what
 * catches a `z-index: -1` pseudo that escapes its card.
 *
 * Product CSS is resolved through the running dsh install. Resolving from the
 * profile's flat `node_modules` is not equivalent: a stale symlink there
 * (`~/.my-dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-primitives` →
 * an npx cache at 0.1.0-rc.6) predates `MenuSurface` entirely, so it silently
 * measures an ancient menu. Versions are printed so that stays visible.
 *
 * Usage:
 *   node tools/menu-blur.mjs
 *   node tools/menu-blur.mjs --file=lib/client.js --seed=7 --out=.scratch --tag=menu
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/** Facet name the module mounts its glass sheet under. */
const GLASS_SHEET = "dsh-liquid-glass-theme/glass";
const PROFILE = process.env.DSH_PROFILE_DIR ?? path.join(process.env.DSH_HOME ?? "", "profiles", process.env.DSH_PROFILE ?? "web");

const VIEWPORT = [1440, 900];
/* 2px stripes have to survive to the screenshot to be measurable at all. */
const SCALE = 2;
const CARD = { left: 320, width: 800, height: 132 };
CARD.top = VIEWPORT[1] - 96 - CARD.height;
const MENU = { left: CARD.left, width: CARD.width, height: 320 };
MENU.top = CARD.top - 4 - MENU.height;

/* ------------------------------------------------------------- product -- */

/**
 * Resolve a package through the running dsh install rather than the profile's
 * flat node_modules (see the header: that path can hold a stale symlink).
 * @param spec - package subpath to resolve.
 * @returns the absolute path.
 */
function resolveProduct(spec) {
	const fromDsh = createRequire(createRequire(path.join(PROFILE, "package.json")).resolve("@deepseek-ai/dsh/package.json"));
	return fromDsh.resolve(spec);
}

/**
 * The installed packages this scene needs, with their versions.
 * @returns package directory, version, and the CSS text each contributes.
 */
function product() {
	const dir = (spec) => path.dirname(resolveProduct(`${spec}/package.json`));
	const read = (spec, rel) => fs.readFileSync(path.join(dir(spec), rel), "utf8");
	const version = (spec) => JSON.parse(read(spec, "package.json")).version;
	const specs = ["@deepseek-ai/dsh-client-ui-theme", "@deepseek-ai/dsh-client-ui-primitives"];
	return {
		versions: Object.fromEntries(specs.map((spec) => [spec, version(spec)])),
		/* The theme bundle inlines the token sheets (design-platform.css carries
		 * --dsw-menu-surface-fill / --dsw-specific-menu, gradient-shadow-text.css
		 * carries --dsw-menu-backdrop-filter); MenuSurface ships as a plain
		 * .module.css file whose selectors are unhashed here, which is why the
		 * scene can use the real class names. */
		css: [embeddedCss(path.join(dir(specs[0]), "lib/client.js")), read(specs[1], "lib/MenuSurface.module.css")].join("\n")
	};
}

/**
 * Every CSS module a client bundle inlines as a string literal.
 * @param file - path to the client bundle.
 * @returns the concatenated CSS text.
 */
function embeddedCss(file) {
	const src = fs.readFileSync(file, "utf8");
	const out = [];
	const re = /=\s*("(?:[^"\\]|\\.)*")\s*;/g;
	let m;
	while ((m = re.exec(src))) {
		const text = JSON.parse(m[1]);
		if (text.includes("{") && text.includes("}") && text.includes(":")) out.push(text);
	}
	return out.join("\n");
}

/* --------------------------------------------------------------- theme -- */

/**
 * Load the client module under test through the loader shim the other tools
 * use, so the sheets measured are the ones `apply()` actually mounts.
 * @param file - path to the client module.
 * @param seed - PRNG seed for this build.
 * @returns map of facet name to CSS text, in mount order.
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

/**
 * Deterministic PRNG, so a seed reproduces one aurora exactly.
 * @param seed - the seed.
 * @returns a function returning [0, 1).
 */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ----------------------------------------------------------------- png -- */

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
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

/**
 * Write an 8-bit RGB PNG.
 * @param file - destination path.
 * @param w - width.
 * @param h - height.
 * @param rgb - w * h * 3 bytes.
 */
function writePng(file, w, h, rgb) {
	const raw = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[y * (w * 3 + 1)] = 0;
		rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	fs.writeFileSync(file, Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))
	]));
}

/**
 * Decode an 8-bit non-interlaced PNG (what Chromium screenshots are) to RGB.
 * @param buf - the PNG bytes.
 * @returns the decoded image.
 */
function readPng(buf) {
	let pos = 8;
	let w = 0;
	let h = 0;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString("ascii", pos + 4, pos + 8);
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === "IHDR") {
			w = data.readUInt32BE(0);
			h = data.readUInt32BE(4);
			if (data[8] !== 8 || data[9] !== 2 || data[12] !== 0) throw new Error("unsupported PNG (want 8-bit RGB, non-interlaced)");
		} else if (type === "IDAT") idat.push(data);
		else if (type === "IEND") break;
		pos += 12 + len;
	}
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const stride = w * 3;
	const out = Buffer.alloc(w * h * 3);
	let prev = Buffer.alloc(stride);
	for (let y = 0; y < h; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const cur = Buffer.alloc(stride);
		for (let x = 0; x < stride; x++) {
			const a = x >= 3 ? cur[x - 3] : 0;
			const b = prev[x];
			const c = x >= 3 ? prev[x - 3] : 0;
			let v = line[x];
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			cur[x] = v & 0xff;
		}
		cur.copy(out, y * stride);
		prev = cur;
	}
	return { w, h, data: out };
}

/* -------------------------------------------------------------- pixels -- */

/**
 * Gamma-encoded luma of one RGB pixel, on the 0-255 scale. Deliberately not
 * WCAG relative luminance: browsers composite translucency in the encoded
 * space, so this metric attenuates linearly with a fill's alpha — which is what
 * makes the broken reading come out at exactly the fill's transmission (42% of
 * the unfiltered backdrop for a 58%-opaque menu) instead of some gamma-warped
 * cousin of it.
 * @param data - RGB bytes.
 * @param i - byte offset of the pixel.
 * @returns luma in 0-255.
 */
function luma(data, i) {
	return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

/**
 * Read one rectangle: high-frequency energy and the mean colour.
 * @param img - decoded screenshot.
 * @param rect - {x, y, w, h} in image pixels.
 * @returns mean |dL/dx| (a blur kills it) and the mean RGB.
 */
function read(img, rect) {
	let hf = 0;
	let n = 0;
	let sr = 0;
	let sg = 0;
	let sb = 0;
	for (let y = rect.y; y < rect.y + rect.h; y++) {
		for (let x = rect.x; x < rect.x + rect.w - 1; x++) {
			const i = (y * img.w + x) * 3;
			hf += Math.abs(luma(img.data, i + 3) - luma(img.data, i));
			n++;
			sr += img.data[i];
			sg += img.data[i + 1];
			sb += img.data[i + 2];
		}
	}
	return { hf: hf / n, rgb: [sr / n, sg / n, sb / n] };
}

/**
 * Copy one rectangle out of a decoded screenshot.
 * @param img - decoded screenshot.
 * @param rect - {x, y, w, h} in image pixels.
 * @returns the cropped image.
 */
function crop(img, rect) {
	const out = Buffer.alloc(rect.w * rect.h * 3);
	for (let y = 0; y < rect.h; y++) {
		const src = ((rect.y + y) * img.w + rect.x) * 3;
		img.data.copy(out, y * rect.w * 3, src, src + rect.w * 3);
	}
	return { w: rect.w, h: rect.h, data: out };
}

/* -------------------------------------------------------------- scene -- */

/**
 * One measurement scene: aurora + stripe backdrop, the conversation panel
 * analogue carrying its own `bg-base`, the composer card in the same DOM
 * relationship the product uses, and a fixed-position probe standing in for the
 * card's inline Tooltip bubbles.
 * @param args - product CSS, theme sheets, and this variant's override.
 * @returns the HTML document.
 */
function sceneHtml({ productCss, themeCss, override }) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>
${productCss}
${themeCss}
/* Probe scaffolding: geometry and the measurement backdrop only. */
#stripes { position: fixed; inset: 0; z-index: 0;
  background: repeating-linear-gradient(90deg, #22314c 0 2px, #e7eefa 2px 4px); }
/* ConversationRoot analogue: positioned, and it paints bg-base — this is what
   catches a z-index: -1 pseudo that escapes the card. */
#panel { position: absolute; left: 240px; top: 40px; width: 960px; height: 812px;
  background: var(--dsw-alias-bg-base); }
#card { position: absolute; left: ${CARD.left - 240}px; top: ${CARD.top - 40}px;
  width: ${CARD.width}px; height: ${CARD.height}px; box-sizing: border-box;
  border-radius: var(--dsw-radius-panel); background: var(--dsw-specific-input-major); }
#anchor { position: absolute; inset: 0 0 auto; height: 0; }
/* MenuView .menu geometry (rc.2 keeps no background and no blur there). */
#surface { position: absolute; bottom: calc(100% + 4px); left: 0; right: 0; height: ${MENU.height}px;
  box-sizing: border-box; padding: 4px; overflow: hidden; }
#surface .row { height: 34px; border-radius: var(--dsw-radius-md); }
#surface .row.on { background: var(--dsw-alias-interactive-bg-hover); }
#fixedmarker { position: fixed; top: 0; left: 0; width: 10px; height: 10px; }
${override}
</style></head><body>
<div id="stripes"></div>
<div id="panel">
  <div id="card" data-composer-card>
    <div id="anchor">
      <div id="surface" class="surface" data-menu-material="translucent" data-trigger-menu
           style="--dsh-menu-anchor: --probe-menu">
        <div id="material" class="material" aria-hidden="true"></div>
        <div class="row on"></div><div class="row"></div><div class="row"></div>
        <div class="row"></div><div class="row"></div><div class="row"></div>
      </div>
    </div>
    <div id="fixedmarker"></div>
  </div>
</div>
</body></html>`;
}

/* ---------------------------------------------------------------- run -- */

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
	const hit = argv.find((a) => a.startsWith("--" + name + "="));
	return hit ? hit.slice(name.length + 3) : dflt;
};
const file = path.resolve(ROOT, flag("file", "lib/client.js"));
const seed = +flag("seed", 7);
const outDir = path.resolve(ROOT, flag("out", ".scratch"));
const tag = flag("tag", "menu-blur");

const productFiles = product();
const sheets = buildStyles(file, seed);
if (sheets[GLASS_SHEET] === undefined) throw new Error(`${GLASS_SHEET} sheet not found in ${path.relative(ROOT, file)}: ${Object.keys(sheets).join(", ")}`);
if (!sheets[GLASS_SHEET].includes("::before")) {
	console.warn(`warning: ${GLASS_SHEET} no longer puts the card frost on a ::before — the "shipped" row below measures that`);
}
const themeCss = Object.values(sheets).join("\n");

const FILTER = "backdrop-filter:blur(6px) saturate(180%);-webkit-backdrop-filter:blur(6px) saturate(180%)";
const VARIANTS = [
	["shipped", ""],
	["trap: filter on the card", `[data-composer-card]{z-index:auto !important;${FILTER} !important}` +
		"[data-composer-card]::before{display:none !important}"],
	["shipped minus stacking context", "[data-composer-card]{z-index:auto !important}"],
	["no card filter at all", `[data-composer-card]{z-index:auto !important}[data-composer-card]::before{display:none !important}`],
	["opaque menu fill at 0.94", "body{--dsw-menu-surface-fill:rgba(249,252,254,0.94) !important}"],
	["material blur deleted", "#material{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}"]
];

const { chromium } = await import(process.env.PLAYWRIGHT ?? "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH ?? path.join(
		process.env.HOME,
		"Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell"
	)
});

const px = (v) => Math.round(v * SCALE);
const inset = 14;
/* One screenshot per variant, clipped to the menu + card box (plus enough of the
   panel to hold the sharp reference). The clip is in CSS pixels because that is
   what Playwright takes; the regions are in image pixels, relative to the clip. */
const CROP = {
	x: CARD.left - 160,
	y: MENU.top - 24,
	width: 160 + CARD.width + 24,
	height: CARD.top + CARD.height + 24 - (MENU.top - 24)
};
const SHEET = { w: px(CROP.width), h: px(CROP.height) };
const at = (x, y, w, h) => ({ x: px(x - CROP.x), y: px(y - CROP.y), w: px(w), h: px(h) });
const REGIONS = {
	/* The menu's own backdrop, unblurred: over the panel, clear of both boxes. */
	sharp: at(250, MENU.top + inset, 60, MENU.height - 2 * inset),
	card: at(CARD.left + 30, CARD.top + 30, 300, CARD.height - 60),
	menu: at(MENU.left + inset, MENU.top + inset, MENU.width - 2 * inset, MENU.height - 2 * inset)
};
/* A blur is "working" when the region keeps almost none of the backdrop's
   high-frequency energy; 10% sits far above the measured working rows (2%) and
   far below the broken ones (42%, i.e. the fill's own transmission). */
const BLURRED = 0.1;
/* The card's mean colour must not move when the frost changes shape: the pseudo
   must not paint the fill a second time, and must not fall behind the panel.
   The reference is the pre-fix shape, which is the look being preserved. */
const COLOUR_TOLERANCE = 2;

console.log(`\nfile ${path.relative(ROOT, file)} — aurora seed ${seed}`);
for (const [spec, version] of Object.entries(productFiles.versions)) console.log(`product ${spec}@${version}`);
console.log("\nvariant".padEnd(34) + "hf sharp/card/menu".padEnd(24) + "menu vs sharp".padEnd(16) + "card rgb".padEnd(18) + "fixed@");

const rows = [];
for (const [name, override] of VARIANTS) {
	const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, deviceScaleFactor: SCALE });
	await page.setContent(sceneHtml({ productCss: productFiles.css, themeCss, override }), { waitUntil: "load" });
	const applied = await page.evaluate(() => ({
		card: getComputedStyle(document.getElementById("card")).backdropFilter,
		pseudo: getComputedStyle(document.getElementById("card"), "::before").backdropFilter,
		material: getComputedStyle(document.getElementById("material")).backdropFilter,
		fill: getComputedStyle(document.getElementById("material")).backgroundColor,
		fixedAt: (() => { const r = document.getElementById("fixedmarker").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) } })()
	}));
	const img = readPng(await page.screenshot({ clip: CROP }));
	const e = Object.fromEntries(Object.entries(REGIONS).map(([label, rect]) => [label, read(img, rect)]));
	const ratio = e.menu.hf / e.sharp.hf;
	const fixedAtOrigin = applied.fixedAt.x === 0 && applied.fixedAt.y === 0;
	console.log(
		name.padEnd(34) +
		`${e.sharp.hf.toFixed(1)} / ${e.card.hf.toFixed(2)} / ${e.menu.hf.toFixed(2)}`.padEnd(24) +
		`${(ratio * 100).toFixed(0)}%`.padEnd(16) +
		`${e.card.rgb.map((v) => v.toFixed(0)).join(",")}`.padEnd(18) +
		`${applied.fixedAt.x},${applied.fixedAt.y}` +
		(name === "shipped" ? `   [card: ${applied.card || "none"}] [::before: ${applied.pseudo || "none"}] [material: ${applied.material || "none"}] [fill: ${applied.fill}]` : "")
	);
	rows.push({ name, hf: e, ratio, fixedAtOrigin, rgb: e.card.rgb, image: img, ws: { ...applied } });
	await page.close();
}
await browser.close();

/* Contact sheet: one row per variant, cropped to the menu + card box. */
const gap = 6;
const sheet = Buffer.alloc(SHEET.w * (SHEET.h * rows.length + gap * (rows.length - 1)) * 3, 24);
rows.forEach((row, index) => {
	const destY = index * (SHEET.h + gap);
	for (let y = 0; y < SHEET.h; y++) {
		const src = (y * SHEET.w) * 3;
		row.image.data.copy(sheet, ((destY + y) * SHEET.w) * 3, src, src + SHEET.w * 3);
	}
});

/* Verdict: the shipped row must keep the card frosted, let the menu blur, and
   leave fixed descendants on the viewport. */
const shipped = rows[0];
const baseline = rows.find((row) => row.name === "trap: filter on the card");
const colourDrift = Math.max(...shipped.rgb.map((v, i) => Math.abs(v - baseline.rgb[i])));
const checks = [
	[`card stays frosted (${(shipped.hf.card.hf / shipped.hf.sharp.hf * 100).toFixed(1)}% of sharp energy ≤ 10%)`, shipped.hf.card.hf / shipped.hf.sharp.hf <= BLURRED],
	[`menu blurs (${(shipped.ratio * 100).toFixed(0)}% of sharp energy ≤ 10%)`, shipped.ratio <= BLURRED],
	[`fixed descendants anchor to the viewport (${shipped.ws.fixedAt.x},${shipped.ws.fixedAt.y})`, shipped.fixedAtOrigin],
	[`card colour unchanged by the move (drift ${colourDrift.toFixed(1)} vs the filter-on-the-card shape)`, colourDrift <= COLOUR_TOLERANCE]
];
console.log("");
for (const [label, ok] of checks) console.log(`  ${ok ? "pass" : "FAIL"}  ${label}`);

const sheetFile = path.join(outDir, `${tag}-sheet.png`);
writePng(sheetFile, SHEET.w, SHEET.h * rows.length + gap * (rows.length - 1), sheet);
console.log(`\nwrote ${path.relative(ROOT, sheetFile)}  (rows top to bottom: ${rows.map((r) => r.name).join(" / ")})`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
