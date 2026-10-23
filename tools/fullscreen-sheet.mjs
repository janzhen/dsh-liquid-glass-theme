/**
 * Real-browser harness for the fullscreen right Sidebar sheet: does the
 * maximized panel still cover the floating composer card, and is what it covers
 * still frosted?
 *
 * The theme frosts the fullscreen panel (`data-sidebar-right-panel="fullscreen"`
 * + `data-sidebar-right-open`). Where that frost is declared decides whether the
 * panel still covers the composer, because the product's layering does not live
 * on the panel element: the panel is `position: absolute` with `z-index: auto`,
 * and the stacking is carried by dockkit's cells inside it
 * (`z-index: var(--dsh-dockkit-dock-layer)`, 10 in push and 40 in fullscreen)
 * while the conversation's composer seat rides at `z-index: 7` (9 with a trigger
 * menu open). Those are two levels of one stacking context, so the cell wins and
 * the sheet covers the composer.
 *
 * A `backdrop-filter` on the panel **makes the panel a stacking context**, which
 * traps that `z-index: 40` cell inside a box painting at `auto` in DOM order —
 * below any positive `z-index` in the same context. The composer then floats
 * above the maximized sidebar (the `trap:` row here, and the report this tool
 * pins down), and the same declaration becomes the containing block for the
 * panel's `position: fixed` floating panes. On the panel's `::before` neither
 * happens, and `z-index: var(--dsh-dockkit-dock-layer, 40)` puts the frost back
 * on the layer the cells ride.
 *
 * What it measures, per variant, over the composer card and over the prose above
 * it: two frames are differenced — one with the conversation's glyphs painted,
 * one with them hidden but every box still painting — so the numbers describe
 * the conversation alone and are immune to whatever the panel paints on the same
 * pixels. `hf` is that difference's mean |d/dx|, i.e. how sharp the covered
 * glyphs still are, as a percentage of the same region on a page whose panel is
 * closed; `through` is its mean, i.e. how much of the covered content pushes
 * through. A floating card keeps ~100% of both, a covered-but-unfrosted one
 * (what the product's own sheet does today) keeps ~100% of the sharpness at the
 * fill's transmission, and a frosted one collapses to a few percent of the
 * sharpness. Hit-testing is deliberately not used: Chromium resolves overlaps
 * between a `z-index: 40` grid item and a `z-index: 7` sticky sibling by DOM
 * order rather than paint order, so it reports the composer even where the sheet
 * demonstrably paints over it.
 *
 * The scene is the product's real layout: the panel, its body, dockkit's
 * surface / tab layout / cell / tab host, and the conversation shell come from
 * the installed product's own stylesheets and class map, the theme sheets are
 * the ones the module actually mounts at a seeded aurora, and the class names
 * are read out of the product's CSS-module maps rather than hard-coded.
 *
 *   node tools/fullscreen-sheet.mjs [--file=lib/client.js] [--seed=7] [--dark]
 *                                   [--out=.scratch] [--tag=fullscreen]
 *                                   [--css="<candidate sheet>"]…
 *
 * The driver and the browser come from `tools/environment.mjs`, shared with the
 * other harnesses: `playwright` from the repository's devDependency (Node
 * resolution, `$PLAYWRIGHT` as the escape hatch) and the headless shell from
 * Playwright's own cache across the layouts it has shipped
 * (`chrome-mac/headless_shell` on macOS 12, `chrome-headless-shell-<arch>/…`
 * elsewhere), with `$CHROME_PATH` as the override. An old OS therefore needs no
 * hand-set variable, and the frozen builds it gets are fine here: this tool
 * measures layout and paint, not media. The stacking question is
 * palette-independent, so the scene runs light unless `--dark` asks for
 * `body[data-ds-dark-theme]` — the same aurora geometry, the other palette's
 * sheet alphas.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { browserPath, loadChromium, resolveProduct } from "./environment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/** Facet name the module mounts its fullscreen sheet under. */
const FULLSCREEN_SHEET = "dsh-liquid-glass-theme/fullscreen";

const VIEWPORT = [1440, 900];
const SCALE = 2;
/** A region is "frosted" below this fraction of its sharp energy. The product's
 * own unfrosted sheet leaves glyphs sharp (the fill only attenuates them), and a
 * floating card keeps ~100%, so the band is wide on both sides. */
const BLURRED = 0.1;

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
		let text;
		/* Bundles carry `"\0dsh-css:…"` markers, an escape JSON rejects but a JS
		 * string literal allows, so the literal is evaluated as one. */
		try {
			text = JSON.parse(m[1]);
		} catch {
			text = new Function("return " + m[1])();
		}
		if (text.includes("{") && text.includes("}") && text.includes(":")) out.push(text);
	}
	return out.join("\n");
}

/**
 * The installed packages this scene needs, their versions, the CSS each
 * contributes, and the bundle text the class-name maps are read from. The static web shell carries dockkit's rules and
 * the bundle that instantiates them, the conversation bundle carries the shell
 * and the composer, the sidebar-right bundle carries the panel, and the theme
 * bundle carries the `--dsw-*` tokens the theme does not remap.
 * @returns versions, the concatenated CSS, and the JS to read class names from.
 */
function product() {
	const dir = (spec) => path.dirname(resolveProduct(`${spec}/package.json`));
	const read = (spec, rel) => fs.readFileSync(path.join(dir(spec), rel), "utf8");
	const version = (spec) => JSON.parse(read(spec, "package.json")).version;
	const specs = [
		"@deepseek-ai/dsh-client-ui-theme",
		"@deepseek-ai/dsh-client-ui-conversation",
		"@deepseek-ai/dsh-client-ui-sidebar-right",
		"@deepseek-ai/dsh-web-frontend"
	];
	const assets = path.join(dir(specs[3]), "dist/assets");
	const names = fs.readdirSync(assets);
	const bundles = specs.slice(0, 3).map((spec) => fs.readFileSync(path.join(dir(spec), "lib/client.js"), "utf8"));
	const css = [
		...bundles.map((_, index) => embeddedCss(path.join(dir(specs[index]), "lib/client.js"))),
		...names.filter((name) => name.endsWith(".css")).map((name) => fs.readFileSync(path.join(assets, name), "utf8"))
	].join("\n");
	/* dockkit is bundled into the shell's JavaScript, so its class names are
	 * only in the bundle — as the readable `_name_hash_line` constants. */
	const js = names.filter((name) => name.endsWith(".js")).map((name) => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
	/* The role → class maps sit in the bundles' JavaScript, next to the sheets. */
	return { versions: Object.fromEntries(specs.map((spec) => [spec, version(spec)])), css, js, maps: cssModuleMaps(bundles.join("\n")) };
}

/**
 * Every CSS-module map in the given bundle text, as role → class. The product
 * emits these as `{ "composerSeat": "wSkVaW_composerSeat", … }`, which is how a
 * class name can be found by role instead of by build hash.
 * @param text - concatenated bundle JavaScript.
 * @returns one object per module.
 */
function cssModuleMaps(text) {
	const maps = [];
	const re = /\{((?:\s*"[-\w]+"\s*:\s*"[^"]*"\s*,?)+)\}/g;
	let m;
	while ((m = re.exec(text))) {
		const entries = [...m[1].matchAll(/"([-\w]+)"\s*:\s*"([^"]+)"/g)].map(([, key, value]) => [key, value]);
		if (entries.every(([, value]) => /^[A-Za-z0-9]+_/.test(value) || value === "")) maps.push(Object.fromEntries(entries));
	}
	return maps;
}

/**
 * The class a product module gives one of its roles.
 * @param maps - every CSS-module map in the product CSS.
 * @param key - a role unique to the module being addressed.
 * @param role - the class role to read.
 * @returns the class name.
 */
function classOf(maps, key, role) {
	const map = maps.find((entry) => entry[key] !== undefined);
	if (map === undefined) throw new Error(`no product CSS module declares "${key}"`);
	const name = map[role];
	if (name === undefined) throw new Error(`the module declaring "${key}" has no "${role}" class`);
	return name;
}

/**
 * dockkit's class names, read out of the shell bundle's `_name_hash_line`
 * constants. Several modules hash classes the same way (a `_surface_ri079_1`
 * from the primitives sits in the same bundle), so the lookup is scoped to the
 * one module that declares the dock's cells and tab hosts.
 * @param js - the shell bundle text.
 * @returns role → hashed class.
 */
function dockkitClasses(js) {
	const groups = new Map();
	const re = /"(_([A-Za-z]+)_([a-z0-9]{5})_\d+)"/g;
	let m;
	while ((m = re.exec(js))) {
		if (!groups.has(m[3])) groups.set(m[3], new Map());
		groups.get(m[3]).set(m[2], m[1]);
	}
	for (const map of groups.values()) {
		if (map.has("tabCell") && map.has("tabHost") && map.has("surface") && map.has("pane")) return map;
	}
	throw new Error("no dockkit CSS-module group in the shell bundle");
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
	fs.mkdirSync(path.dirname(file), { recursive: true });
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
 * Gamma-encoded luma of one RGB pixel, on the 0-255 scale (see menu-blur.mjs:
 * the browser composites translucency in the encoded space).
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
 * The conversation's own contribution to one rectangle, isolated from the
 * panel's text by differencing two frames: one with the conversation's glyphs
 * painted, one with them hidden (`visibility`, so every surface keeps painting).
 *
 * `mean` is how much the covered content pushes through — a sheet at alpha 0.35
 * attenuates it to roughly its transmission. `hf` is the mean |d/dx| of that
 * difference, which is the sharpness of the covered glyphs: a blur smears them,
 * so `hf` collapses while `mean` only shrinks by what the fill absorbs. That is
 * the pair that separates "covered by a sheet" from "frosted" from "floating on
 * top", and it is immune to whatever the panel paints over the same pixels.
 * @param a - decoded screenshot with the conversation painted.
 * @param b - decoded screenshot with it hidden.
 * @param rect - {x, y, w, h} in image pixels.
 * @returns the difference's mean and mean |d/dx|.
 */
function readDelta(a, b, rect) {
	const diff = Buffer.alloc(rect.w * rect.h);
	for (let y = 0; y < rect.h; y++) {
		for (let x = 0; x < rect.w; x++) {
			const i = ((rect.y + y) * a.w + rect.x + x) * 3;
			diff[y * rect.w + x] = Math.abs(luma(a.data, i) - luma(b.data, i));
		}
	}
	let sum = 0;
	let hf = 0;
	let n = 0;
	for (let y = 0; y < rect.h; y++) {
		for (let x = 0; x < rect.w; x++) {
			sum += diff[y * rect.w + x];
			if (x < rect.w - 1) hf += Math.abs(diff[y * rect.w + x + 1] - diff[y * rect.w + x]);
			n++;
		}
	}
	return { mean: sum / n, hf: hf / n };
}

/* -------------------------------------------------------------- scene -- */

/** Prose for the conversation column: real words, so the energy is real glyphs. */
const PROSE = [
	"The frame is a grid of two columns and the conversation fills the one on the left.",
	"When the right panel goes fullscreen it covers the viewport instead of taking a track.",
	"Dockkit lifts the panel's cells to the dock layer so the sheet lands over the composer.",
	"A backdrop filter on that box would make it a stacking context and trap those cells.",
	"The composer seat sits at seven so it stays above the message list while it scrolls."
];

/**
 * The product's session layout at the moment that matters: the conversation
 * column in the frame, its composer seat riding at the product's own
 * `z-index: 7`, and the right panel in its fullscreen presentation with
 * dockkit's surface, tab layout, cell, and tab host inside it. Every class name
 * and every rule is the product's; the frame box, the prose, and the pane text
 * are scaffolding.
 * @param args - product CSS, theme CSS, class names, and this variant's override.
 * @returns the HTML document.
 */
function sceneHtml({ productCss, themeCss, names, panelOpen, dark, override }) {
	const lines = Array.from({ length: 30 }, (_, i) => `<p>${PROSE[i % PROSE.length]}</p>`).join("");
	const pane = Array.from({ length: 20 }, (_, i) => `<p>Row ${i + 1} — a name, and its size.</p>`).join("");
	/* Hidden, not removed: every box keeps painting, so the difference between
	   the two frames is exactly what the conversation puts on screen. */
	return `<!doctype html><html data-platform="darwin"><head><meta charset="utf-8"><style>
${productCss}
${themeCss}
/* Scaffolding only: the frame both columns are mounted in, and the text they
   hold. Nothing here paints a surface of its own. */
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
#frame { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100%; overflow: hidden; }
#conversation { grid-area: 1 / 1; }
#conversation p, [data-dockkit-pane] p {
  margin: 0 0 10px; padding: 0 0 0 24px; font-size: 14px; line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
[data-composer-card] { height: 132px; padding: 16px 18px; }
[data-composer-card] .typed { font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary); }
[data-composer-card] .hint { margin-top: 6px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
${override}
</style></head><body${dark ? " data-ds-dark-theme" : ""}>
<div id="frame">
  <div id="conversation" class="${names.root}" data-phase="active">
    <div class="${names.body}">
      <div class="${names.scrollBody}">
        <div data-slot="conversation.session">
          <div class="${names.viewArea}">${lines}</div>
        </div>
        <div class="${names.seat}">
          <div class="${names.hero}">
            <div class="${names.card}" data-composer-card>
              <div class="typed">Explain the layout of this panel.</div>
              <div class="hint">The composer card keeps a two-line prompt above its controls.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="${names.panel}" data-sidebar-right-panel="fullscreen"${panelOpen ? " data-sidebar-right-open" : ""}
       style="width:100vw;--dsh-sidebar-width:100vw">
    <div class="${names.panelBody}">
      <div class="${names.surface}" data-dockkit-surface data-dockkit-drop-zones="horizontal">
        <div class="${names.tabLayout}" style="grid-template-columns:minmax(0, 1fr)">
          <div class="${names.tabCell}" data-dockkit-host="dock" data-dockkit-column="0" style="grid-column:1;grid-row:1;order:0">
            <section class="${names.tabHost} ${names.pane}" tabindex="-1" data-dockkit-content="files" data-dockkit-pane="pane-1" data-dockkit-pane-active>
              <div class="${names.tabHostHeader}">
                <div class="${names.tabStrip}" role="tablist" data-dockkit-strip="pane-1">
                  <div class="${names.stripTabs}">
                    <div class="${names.tab}" role="tab" aria-selected="true"><div class="${names.tabTitle}">Files</div></div>
                  </div>
                  <div class="${names.stripFill}" data-dockkit-strip-fill></div>
                </div>
              </div>
              <div class="${names.tabHostBody} ${names.paneBody}">${pane}</div>
            </section>
          </div>
        </div>
      </div>
    </div>
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
const dark = argv.includes("--dark");
const outDir = path.resolve(ROOT, flag("out", ".scratch"));
const tag = flag("tag", "fullscreen");

const productFiles = product();
const maps = productFiles.maps;
const sheets = buildStyles(file, seed);
if (sheets[FULLSCREEN_SHEET] === undefined) throw new Error(`${FULLSCREEN_SHEET} sheet not found in ${path.relative(ROOT, file)}: ${Object.keys(sheets).join(", ")}`);
const themeCss = Object.values(sheets).join("\n");

const dock = dockkitClasses(productFiles.js);
/** One dockkit class by role. */
const kit = (name) => {
	const cls = dock.get(name);
	if (cls === undefined) throw new Error(`dockkit has no "${name}" class`);
	return cls;
};
const names = {
	panel: classOf(maps, "panelBody", "panel"),
	panelBody: classOf(maps, "panelBody", "panelBody"),
	surface: kit("surface"),
	tabLayout: kit("tabLayout"),
	tabCell: kit("tabCell"),
	tabHost: kit("tabHost"),
	pane: kit("pane"),
	tabHostHeader: kit("tabHostHeader"),
	tabHostBody: kit("tabHostBody"),
	paneBody: kit("paneBody"),
	tabStrip: kit("tabStrip"),
	stripTabs: kit("stripTabs"),
	stripFill: kit("stripFill"),
	tab: kit("tab"),
	tabTitle: kit("tabTitle"),
	root: classOf(maps, "composerSeat", "root"),
	body: classOf(maps, "composerSeat", "body"),
	scrollBody: classOf(maps, "composerSeat", "scrollBody"),
	viewArea: classOf(maps, "composerSeat", "viewArea"),
	seat: classOf(maps, "composerSeat", "composerSeat"),
	hero: classOf(maps, "composerSeat", "composerHero"),
	card: classOf(maps, "overlayAnchor", "card")
};

/* The panel's treatment placed on the panel element — the shape this harness
   exists to catch — so `trap:` can restore it and show what it does. */
const SELECTOR = `body [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]`;
const TRAP = `${SELECTOR}{backdrop-filter:blur(16px) saturate(150%) !important;-webkit-backdrop-filter:blur(16px) saturate(150%) !important}` +
	`${SELECTOR}::before{display:none !important}`;
/** The same sheet with the open guard dropped: what the phone regression was. */
const GUARD_OFF = sheets[FULLSCREEN_SHEET].replace(/\[data-sidebar-right-open\]/g, "");
const EXTRA = argv.filter((a) => a.startsWith("--css=")).map((a) => a.slice("--css=".length));

const VARIANTS = [
	{ name: "shipped", panelOpen: true, override: "" },
	{ name: "trap: filter on the panel", panelOpen: true, override: TRAP },
	{ name: "product (no theme sheet)", panelOpen: true, override: "", strip: [FULLSCREEN_SHEET] },
	{ name: "panel closed (sharp ref)", panelOpen: false, override: "" },
	{ name: "panel closed, guard off", panelOpen: false, override: GUARD_OFF },
	...EXTRA.map((css, i) => ({ name: `--css[${i}]`, panelOpen: true, override: css }))
];

const { chromium } = await loadChromium();
const browser = await chromium.launch({ executablePath: browserPath() });

const px = (v) => Math.round(v * SCALE);
const at = (rect) => ({ x: px(rect.x), y: px(rect.y), w: px(rect.width), h: px(rect.height) });

console.log(`\nfile ${path.relative(ROOT, file)} — aurora seed ${seed}, ${dark ? "dark" : "light"} palette`);
for (const [spec, version] of Object.entries(productFiles.versions)) console.log(`product ${spec}@${version}`);
console.log(`panel .${names.panel} · cell .${names.tabCell} · host .${names.tabHost} · seat .${names.seat} · card .${names.card}`);
console.log("\nvariant".padEnd(30) + "hf card / prose".padEnd(16) + "through card / prose".padEnd(18) + "diagnostics");

/* Geometry comes from the live card, so a product change to the composer's
   width or the seat's offset moves the regions with it instead of reading the
   wrong pixels. The prose region is the message column above the seat. */
const rows = [];
for (const variant of VARIANTS) {
	const css = variant.strip ? Object.entries(sheets).filter(([key]) => !variant.strip.includes(key)).map(([, value]) => value).join("\n") : themeCss;
	const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, deviceScaleFactor: SCALE });
	await page.setContent(sceneHtml({ productCss: productFiles.css, themeCss: css, names, panelOpen: variant.panelOpen, dark, override: variant.override }), { waitUntil: "load" });
	const probe = await page.evaluate((classes) => {
		const card = document.querySelector("[data-composer-card]");
		const panel = document.querySelector("[data-sidebar-right-panel]");
		const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
		const prose = rect(document.querySelector("[data-slot='conversation.session']"));
		return {
			filter: getComputedStyle(panel).backdropFilter,
			pseudo: getComputedStyle(panel, "::before").backdropFilter,
			cellZ: getComputedStyle(document.querySelector("[data-dockkit-host]")).zIndex,
			seatZ: getComputedStyle(document.querySelector("." + classes.seat)).zIndex,
			cardRect: rect(card),
			panelRect: rect(panel),
			hostRect: rect(document.querySelector("[data-dockkit-host]")),
			sheetFill: getComputedStyle(document.querySelector("[data-dockkit-pane]")).backgroundColor,
			proseRect: { x: prose.x, y: prose.y + 30, width: prose.width, height: 300 }
		};
	}, { seat: names.seat });
	const inset = (rect, dx, dy) => ({ x: rect.x + dx, y: rect.y + dy, width: rect.width - 2 * dx, height: rect.height - 2 * dy });
	const regions = { card: at(inset(probe.cardRect, 20, 12)), prose: at(probe.proseRect) };
	const shown = readPng(await page.screenshot());
	await page.addStyleTag({ content: "#conversation p, [data-composer-card] .typed, [data-composer-card] .hint { visibility: hidden; }" });
	const bare = readPng(await page.screenshot());
	const deltas = Object.fromEntries(Object.entries(regions).map(([label, rect]) => [label, readDelta(shown, bare, rect)]));
	console.log(
		variant.name.padEnd(30) +
		`${deltas.card.hf.toFixed(2)} / ${deltas.prose.hf.toFixed(2)}`.padEnd(16) +
		`${deltas.card.mean.toFixed(1)} / ${deltas.prose.mean.toFixed(1)}`.padEnd(18) +
		(variant.name === "shipped" || variant.panelOpen === false
			? `[panel: ${probe.filter || "none"}] [::before: ${probe.pseudo || "none"}] [cell z: ${probe.cellZ}] [seat z: ${probe.seatZ}] [sheet ${probe.sheetFill}] [host ${probe.hostRect.width}x${probe.hostRect.height}]`
			: "")
	);
	rows.push({ variant, probe, regions, delta: deltas, shown });
	await page.close();
}
await browser.close();

/* Contact sheet: one row per variant, over the whole pane and composer, so the
   panel's own text (sharp, above the frost) and the covered conversation (what
   the frost is for) are both in frame. Composited one pixel per CSS pixel: the
   measurements above are the ones taken at device scale. */
const frame = { x: 0, y: 0, w: 1400, h: 880 };
const gap = 6;
const sheet = Buffer.alloc(frame.w * (frame.h * rows.length + gap * (rows.length - 1)) * 3, 24);
rows.forEach((row, index) => {
	const destY = index * (frame.h + gap);
	for (let y = 0; y < frame.h; y++) {
		for (let x = 0; x < frame.w; x++) {
			const src = ((frame.y * SCALE + y * SCALE) * row.shown.w + frame.x * SCALE + x * SCALE) * 3;
			row.shown.data.copy(sheet, ((destY + y) * frame.w + x) * 3, src, src + 3);
		}
	}
});

/* Verdicts: the shipped sheet must keep the product's stacking and frost what
   it covers, the trap must still reproduce the float, and the open guard must
   stay load-bearing where the product derives fullscreen from the viewport. */
const shipped = rows.find((row) => row.variant.name === "shipped");
const trap = rows.find((row) => row.variant.name.startsWith("trap:"));
const plain = rows.find((row) => row.variant.name.startsWith("product"));
const closed = rows.find((row) => row.variant.name === "panel closed (sharp ref)");
const guardFree = rows.find((row) => row.variant.name === "panel closed, guard off");
const pct = (region, variant) => `${(variant.delta[region].hf / closed.delta[region].hf * 100).toFixed(1)}%`;
const through = (region, variant) => `${(variant.delta[region].mean / closed.delta[region].mean * 100).toFixed(0)}%`;
const checks = [
	[`the sheet covers and frosts the composer (${pct("card", shipped)} of the card's sharpness, pushing through ${through("card", shipped)})`,
		shipped.delta.card.hf / closed.delta.card.hf <= BLURRED],
	[`the sheet covers and frosts the prose (${pct("prose", shipped)} of the prose's sharpness, pushing through ${through("prose", shipped)})`,
		shipped.delta.prose.hf / closed.delta.prose.hf <= BLURRED],
	[`the measurement separates covered from frosted (the product's own sheet leaves the card at ${pct("card", plain)}, the trap at ${pct("card", trap)})`,
		plain.delta.card.hf / closed.delta.card.hf > BLURRED && trap.delta.card.hf / closed.delta.card.hf > BLURRED],
	[`the open guard is load-bearing (removed, it frosts a closed page to ${pct("prose", guardFree)})`,
		guardFree.delta.prose.hf / closed.delta.prose.hf <= BLURRED]
];
console.log("");
for (const [label, ok] of checks) console.log(`  ${ok ? "pass" : "FAIL"}  ${label}`);

const sheetFile = path.join(outDir, `${tag}-sheet.png`);
writePng(sheetFile, frame.w, frame.h * rows.length + gap * (rows.length - 1), sheet);
console.log(`\nwrote ${path.relative(ROOT, sheetFile)}  (rows top to bottom: ${rows.map((r) => r.variant.name).join(" / ")})`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
