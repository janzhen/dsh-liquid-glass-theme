/**
 * Real-browser harness for the changed-file diff hover preview — the turn-tail
 * "浮层" the changed-files card opens when a row is hovered.
 *
 * The aurora harness (`tools/aurora.mjs`) evaluates the theme's CSS itself and
 * composites the surface stacks arithmetically. That is the right tool for
 * palette contrast, and the wrong one for this question: `backdrop-filter` is a
 * compositor feature, so "does the covered text stop reading through the card"
 * cannot be answered without a compositor. This harness therefore runs the real
 * product in headless Chromium:
 *
 *   - the real product sheets: the theme package's own token/font/shadow sheets
 *     (extracted from its client bundle), the shipped static web CSS (which
 *     carries the HoverCard `.preview` rule), and the deliverables bundle's
 *     inlined ChangedFiles/FileDiff module CSS;
 *   - the real theme sheets: `lib/client.js` is loaded through a fake module
 *     loader with a seeded PRNG, exactly as `tools/aurora.mjs` does, so the
 *     aurora behind the card is the shipped aurora at a reproducible seed;
 *   - the real DOM: the card is portaled to `document.body` as a direct child,
 *     sized and placed by the same arithmetic the HoverCard primitive uses
 *     (24px side insets on the changed-files card, 8px anchor gap, 420px cap),
 *     and it sits over the app frame, the conversation root, the prose of a
 *     turn, and the changed-files card itself.
 *
 * What it measures, per palette and per candidate rule:
 *
 *   ghost  — the covered content's own contribution to the pixels inside the
 *            card, as a per-pixel WCAG contrast ratio between a render with the
 *            covered text and one with it hidden (`visibility`, so every
 *            surface keeps painting). This is the "会透出后的文字" number: a
 *            smear at 1.05:1 is not text, a glyph at 3:1 is.
 *   diff   — the card's own diff text, worst line kind, against the card alone
 *            (`surface`) and against the pixel the covered content pushes
 *            through underneath it (`worst`). Blur must not move this.
 *   aurora — the card's large-scale backdrop variation as a fraction of the
 *            same region with no card at all: 0 would be an opaque panel.
 *
 *   node tools/preview-glass.mjs [--file=lib/client.js] [--seed=7]
 *                                [--states="none|backdrop-filter:blur(12px) saturate(160%)"]
 *                                [--out=.scratch] [--tag=preview]
 *
 * With no `--states`, the shipped treatment is read out of the module's own
 * `preview` sheet and compared against `none` (that sheet stripped), which is
 * the before/after pair. Passing `--states` strips the shipped sheet and
 * injects each `|`-separated declaration list under the same selector, which is
 * how the blur radius was chosen.
 *
 * The diff body is rendered with the product's base line colours but without
 * shiki token spans: syntax colours sit on top of those, so the base colours
 * are the conservative floor, and they are what the card's surface is judged
 * against. Fonts come from the host, so glyph shapes are the host's.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/** The one selector the theme ships for this card. */
const PREVIEW_SELECTOR = "body > div:has([data-changes-hover-preview])";
const PREVIEW_SHEET = "dsh-liquid-glass-theme/preview";

const VIEWPORT = [1440, 900];
/* Device pixel ratio. 11px code glyphs at 1x are almost all antialiased edge, so
 * the glyph cores that carry the reading signal only exist at Retina scale —
 * which is also the display the UI is designed for. */
const SCALE = 2;
const PROFILE = process.env.DSH_PROFILE_DIR ?? path.join(process.env.DSH_HOME ?? "", "profiles", process.env.DSH_PROFILE ?? "web");

/* ------------------------------------------------------------- product -- */

/**
 * Resolve a package through the installed profile, so the harness styles what
 * the running app actually serves rather than a copy.
 * @param spec - package subpath to resolve.
 * @returns the absolute path.
 */
function resolveFromProfile(spec) {
	const require = createRequire(path.join(PROFILE, "package.json"));
	return require.resolve(spec);
}

/** The shipped web assets directory (static CSS) and the two bundles carrying runtime CSS. */
function product() {
	const frontend = path.dirname(resolveFromProfile("@deepseek-ai/dsh-web-frontend/package.json"));
	const assets = path.join(frontend, "dist", "assets");
	const files = fs.readdirSync(assets);
	const pick = (re) => path.join(assets, files.find((f) => re.test(f)));
	return {
		static: [pick(/^index-.*\.css$/), pick(/^vendor-.*\.css$/)],
		theme: resolveFromProfile("@deepseek-ai/dsh-client-ui-theme/package.json").replace(/package\.json$/, "lib/client.js"),
		deliverables: resolveFromProfile("@deepseek-ai/dsh-client-ui-deliverables/package.json").replace(/package\.json$/, "lib/client.js")
	};
}

/**
 * Every CSS module a client bundle inlines as a string literal. The bundles
 * compile `*.module.css` imports to `const css$N = "…"` and append a style tag
 * at load, so this is the same text the browser gets.
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
 * Decode an 8-bit non-interlaced PNG (what Chromium screenshots are) to RGB.
 * @param buf - the PNG bytes.
 * @returns { w, h, data } with `data` as tightly packed RGB.
 */
function readPng(buf) {
	let pos = 8;
	let w = 0;
	let h = 0;
	let channels = 0;
	const idat = [];
	while (pos + 8 <= buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString("ascii", pos + 4, pos + 8);
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === "IHDR") {
			w = data.readUInt32BE(0);
			h = data.readUInt32BE(4);
			if (data[8] !== 8) throw new Error("unsupported bit depth " + data[8]);
			if (data[12] !== 0) throw new Error("interlaced PNG");
			channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
			if (!channels) throw new Error("unsupported colour type " + data[9]);
		} else if (type === "IDAT") idat.push(data);
		else if (type === "IEND") break;
		pos += 12 + len;
	}
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const stride = w * channels;
	const out = Buffer.alloc(w * h * 3);
	let prev = Buffer.alloc(stride);
	for (let y = 0; y < h; y++) {
		const filter = raw[y * (stride + 1)];
		const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? cur[i - channels] : 0;
			const b = prev[i];
			const c = i >= channels ? prev[i - channels] : 0;
			if (filter === 1) cur[i] = (cur[i] + a) & 0xff;
			else if (filter === 2) cur[i] = (cur[i] + b) & 0xff;
			else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
			} else if (filter !== 0) throw new Error("unknown filter " + filter);
		}
		for (let x = 0; x < w; x++) {
			out[(y * w + x) * 3] = cur[x * channels];
			out[(y * w + x) * 3 + 1] = cur[x * channels + 1];
			out[(y * w + x) * 3 + 2] = cur[x * channels + 2];
		}
		prev = cur;
	}
	return { w, h, data: out };
}

/* ------------------------------------------------------------- metrics -- */

/** WCAG relative luminance of one RGB pixel. */
function pixelLuminance(data, i) {
	const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255].map((c) =>
		c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two luminances. */
function ratio(a, b) {
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Percentile of a numeric list (0-1, nearest-rank). */
function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Mean of a numeric list. */
function mean(values) {
	return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Per-pixel contrast of `a` against `b` inside a rectangle.
 * @param a - the render carrying the feature.
 * @param b - the same render with that feature hidden.
 * @param rect - the region to compare, in image pixels.
 * @param mask - optional predicate on image coordinates.
 * @returns the ratios, one per pixel that actually differs.
 */
function differences(a, b, rect, mask) {
	const out = [];
	for (let y = rect.y; y < rect.y + rect.h; y++) {
		for (let x = rect.x; x < rect.x + rect.w; x++) {
			if (mask && !mask(x, y)) continue;
			const i = (y * a.w + x) * 3;
			const la = pixelLuminance(a.data, i);
			const lb = pixelLuminance(b.data, i);
			const r = ratio(la, lb);
			if (r >= 1.02) out.push(r);
		}
	}
	return out;
}

/**
 * Standard deviation of *block-mean* luminance: the large-scale variation a
 * backdrop keeps through a surface, with the glyph-scale detail averaged out.
 * @param img - the render.
 * @param rect - the region, in image pixels.
 * @param block - block edge in image pixels.
 * @returns the standard deviation across blocks.
 */
function coarseSd(img, rect, block) {
	const cells = [];
	for (let y = rect.y; y + block <= rect.y + rect.h; y += block) {
		for (let x = rect.x; x + block <= rect.x + rect.w; x += block) {
			let sum = 0;
			for (let j = y; j < y + block; j++) {
				for (let i = x; i < x + block; i++) sum += pixelLuminance(img.data, (j * img.w + i) * 3);
			}
			cells.push(sum / (block * block));
		}
	}
	const m = mean(cells);
	return Math.sqrt(mean(cells.map((v) => (v - m) ** 2)));
}

/* --------------------------------------------------------------- scene -- */

const PROSE = [
	"已经定位到问题了：浮层用的是 `--dsw-alias-bg-layer-1`，亮色下只有 0.55 的覆盖、暗色 0.40，底下那一层正文会直接叠上来。",
	"极光背景是 `body` 上的固定渐变加一层 `body::before` 的径向光斑，内容滚动时光斑不动，所以浮层底下压着的永远是同一批字。",
	"把 `TRAVEL` 收到 0.35 之后，相邻两次加载的逐点覆盖差从 0.099 降到 0.052，光团质心位移 4.9% 视口，色块仍然会走位。",
	"色相带宽由识别度而不是对比度决定：再宽一转，557.7 nm 的绿就滑向黄绿、630.0 nm 的红开始偏橙，越出这几条谱线所属的色域。",
	"权重跟着证据走：绿行拿表里最高的 alpha，红与玫红最低 —— 真实极光是绿帷幕加一层淡淡的红晕。",
	"Trajectory 视图是表面层级最深的消费者，五层纸叠起来覆盖率到亮 96% / 暗 88%，极光只剩 3.9% / 11.8%。",
	"修法不是逐层去压，而是在视图内重新锚定层级：视图根不再画纸，`bg-layer-1` 降到页面档。",
	"记录表于是只剩两层纸压在两层底之上，极光落到聊天区的三分之二，正文最差对比度仍远在 4.5 之上。",
	"气泡必须只钉那一个：这个视图里的气泡来自共享 tooltip 原件，原件画的是深色气泡配白色文字。",
	"只写 `[role=tooltip]` 会把浅色背景压到原件的白色文字底下，亮色下白字对比度掉到 1.02:1，等于隐形。",
	"收窄到 kind 标签上的稳定钩子之后，原件气泡维持深色，被换面的那个是 16.47 / 14.74。",
	"下一步把浮层也按同一条规则处理：只虚化背景，不动全局通透度，让被盖住的字迹停止可读。"
];

const DIFF = [
	["context", "const GLASS_CSS = `"],
	["del", "[data-composer-card],"],
	["del", "[data-question-key] {"],
	["add", "body > div:has([data-changes-hover-preview]),"],
	["add", "[data-composer-card],"],
	["add", "[data-question-key] {"],
	["context", "  backdrop-filter: blur(6px) saturate(180%);"],
	["del", "  -webkit-backdrop-filter: blur(6px) saturate(180%);"],
	["add", "  -webkit-backdrop-filter: blur(12px) saturate(160%);"],
	["context", "}"],
	["context", "`;"],
	["add", ""],
	["add", "/** The preview card is a diff, not a page: blur its backdrop. */"],
	["context", "function installStyles(ctx, name, css) {"],
	["del", "  ctx.effect(() => {"],
	["add", "  ctx.effect(() => {   // one tag per facet"],
	["context", "    const tag = document.createElement(\"style\");"],
	["context", "    tag.textContent = css;"],
	["context", "    document.head.appendChild(tag);"],
	["context", "  }, \"liquid-glass: \" + name);"],
	["context", "}"]
];

/** The diff body rows as the unified view renders them. */
function diffRows() {
	return DIFF.map(([kind, text], i) => {
		const no = String(120 + i);
		const sign = kind === "add" ? "+" : kind === "del" ? "-" : " ";
		const old = kind === "add" ? "" : no;
		const next = kind === "del" ? "" : no;
		return `<div class="IP6KhG_line IP6KhG_${kind}" data-diff-line="${kind}">` +
			`<span class="IP6KhG_number">${old}</span>` +
			`<span class="IP6KhG_number">${next}</span>` +
			`<span class="IP6KhG_sign">${sign}</span>` +
			`<span class="IP6KhG_text difftext">${escapeHtml(text) || "&nbsp;"}</span>` +
			`</div>`;
	}).join("");
}

/** Minimal HTML escaping for the harness's own literals. */
function escapeHtml(text) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One harness page.
 * @param opts.sheets - theme facet name to CSS text.
 * @param opts.productCss - the product's own CSS text.
 * @param opts.state - declarations injected under {@link PREVIEW_SELECTOR}.
 * @returns the HTML document.
 */
function sceneHtml({ sheets, productCss, state }) {
	const themeCss = Object.entries(sheets)
		.filter(([name]) => name !== PREVIEW_SHEET)
		.map(([, css]) => css)
		.join("\n");
	const stateCss = state ? `${PREVIEW_SELECTOR} { ${state} }` : "";
	const rows = ["tools/aurora.mjs", "lib/client.js", "README.md"].map((file, i) =>
		`<li><button type="button" class="hz8-rW_row" data-row="${i}">` +
		`<span class="hz8-rW_path bgtext">${file}</span>` +
		`<span class="hz8-rW_counts bgtext"><span class="hz8-rW_added">+${40 + i * 12}</span>` +
		`<span class="hz8-rW_deleted">-${8 + i * 3}</span></span></button></li>`).join("");
	return `<!doctype html>
<html><head><meta charset="utf-8">
<style>${productCss}</style>
<style>${themeCss}</style>
<style>
  html, body { margin: 0; height: 100%; }
  #frame { position: relative; min-height: 100vh; background: var(--dsw-alias-bg-base); }
  #root { min-height: 100vh; background: var(--dsw-alias-bg-base); }
  #column { width: 760px; margin: 0 auto; padding: 48px 24px 0; }
  #prose p { margin: 0 0 16px; font: var(--dsw-font-markdown-base); color: var(--dsw-alias-label-primary); }
  #prose code { font: var(--dsw-font-markdown-code); background: var(--dsw-alias-markdown-inline-code); border-radius: 4px; padding: 1px 4px; }
  #changes { margin-top: 28px; }
  #preview { transition: none !important; }
</style>
<style>${stateCss}</style>
</head>
<body>
  <div id="frame"><div id="root"><div id="column">
    <div id="prose">${PROSE.map((p) => `<p class="bgtext">${p.replace(/`([^`]*)`/g, "<code>$1</code>")}</p>`).join("")}</div>
    <div id="changes" data-changed-files class="hz8-rW_card">
      <button type="button" class="hz8-rW_header">
        <span class="hz8-rW_tile"><span class="hz8-rW_tileMark"></span></span>
        <span class="hz8-rW_titles">
          <span class="hz8-rW_title bgtext">已编辑 3 个文件</span>
          <span class="hz8-rW_stat"><span class="hz8-rW_statCounts bgtext"><span class="hz8-rW_added">+184</span><span class="hz8-rW_deleted">-37</span></span><span class="hz8-rW_previewHint bgtext">悬停预览</span></span>
        </span>
      </button>
      <ul class="hz8-rW_list">${rows}</ul>
      <button type="button" class="hz8-rW_toggle bgtext">全部 3 个文件</button>
    </div>
  </div></div></div>
  <div id="preview" class="${PREVIEW_CLASSES}" data-changes-hover-preview-host>
    <div class="IP6KhG_root hz8-rW_preview" data-changes-hover-preview>
      <div class="IP6KhG_header"><span class="hz8-rW_previewPath">tools/preview-glass.mjs</span></div>
      <div class="IP6KhG_body" data-diff-body>${diffRows()}</div>
    </div>
  </div>
</body></html>`;
}

/* The HoverCard's two class names are build hashes, so they are read out of the
 * shipped stylesheet rather than hard-coded here. */
let PREVIEW_CLASSES = "";

/**
 * Recover the HoverCard card/preview class names from the shipped static CSS.
 * @param css - the static web CSS text.
 * @returns the class attribute value the primitive renders.
 */
function hoverCardClasses(css) {
	const card = css.match(/\.(_card_[\w-]+)\{[^}]*--dsw-hovercard-bg/);
	const preview = css.match(/\.(_preview_[\w-]+)\{[^}]*--dsh-hover-preview-fade/);
	if (!card || !preview) throw new Error("HoverCard classes not found in the shipped CSS");
	return `${card[1]} ${preview[1]}`;
}

/* -------------------------------------------------------------- browser -- */

/**
 * Measure one palette in one state.
 * @param page - the Playwright page.
 * @returns the ghost, diff, and surface numbers.
 */
async function measure(page) {
	const geometry = await page.evaluate(() => {
		const card = document.getElementById("preview");
		const anchor = document.querySelector('[data-row="1"]');
		const bounds = document.getElementById("changes").getBoundingClientRect();
		const row = anchor.getBoundingClientRect();
		const width = Math.min(bounds.width - 48, window.innerWidth - 16);
		const belowTop = Math.max(8, row.bottom + 8);
		const above = Math.max(0, row.top - 8 - 8);
		const below = Math.max(0, window.innerHeight - belowTop - 8);
		const onTop = above >= Math.min(420, below);
		const maxHeight = Math.min(420, onTop ? above : below);
		card.style.left = `${Math.max(8, Math.min(bounds.left + 24, window.innerWidth - width - 8))}px`;
		card.style.width = `${width}px`;
		card.style.maxHeight = `${maxHeight}px`;
		card.style.top = "0px";
		const h = card.offsetHeight;
		card.style.top = `${onTop ? Math.max(8, row.top - Math.min(h, maxHeight) - 8) : belowTop}px`;
		const rect = card.getBoundingClientRect();
		return {
			onTop,
			rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
			lines: [...card.querySelectorAll("[data-diff-line]")].map((el) => {
				const r = el.getBoundingClientRect();
				return { kind: el.dataset.diffLine, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
			})
		};
	});
	if (process.env.PREVIEW_DEBUG) {
		console.log("debug", JSON.stringify(geometry.rect), "onTop=" + geometry.onTop,
			"card=" + JSON.stringify(await page.evaluate(() => {
				const el = document.getElementById("preview");
				const cs = getComputedStyle(el);
				return { class: el.className, background: cs.backgroundColor };
			})));
	}
	const variants = {};
	/* Hiding the diff *body* would take the add/del row fills with it, so the
	 * text-only variant hides the three spans instead. */
	const HIDE_DIFF = "[data-diff-body] .IP6KhG_text, [data-diff-body] .IP6KhG_number, [data-diff-body] .IP6KhG_sign";
	for (const [name, css] of [
		["full", null],
		["no-bg", ".bgtext { visibility: hidden }"],
		["no-diff", `${HIDE_DIFF} { visibility: hidden }`],
		["no-text", `.bgtext, ${HIDE_DIFF} { visibility: hidden }`],
		["bare", ".bgtext, [data-diff-body] { visibility: hidden }"],
		["no-card", ".bgtext { visibility: hidden } #preview { display: none }"]
	]) {
		await page.evaluate((text) => {
			let tag = document.getElementById("variant");
			if (tag === null) {
				tag = document.createElement("style");
				tag.id = "variant";
				document.head.appendChild(tag);
			}
			tag.textContent = text ?? "";
		}, css);
		await page.waitForTimeout(30);
		const { x, y, w, h } = geometry.rect;
		variants[name] = readPng(await page.screenshot({ clip: { x, y, width: w, height: h } }));
	}
	/* Screenshots are cropped to the card, so image coordinates are card-local
	 * and scaled by the device pixel ratio. The 12px corner radius leaves the
	 * backdrop unfiltered at the corners of the bounding box, so the analysis
	 * rect is inset past it. */
	const card = { x: 14 * SCALE, y: 14 * SCALE, w: (geometry.rect.w - 28) * SCALE, h: (geometry.rect.h - 28) * SCALE };
	const area = card.w * card.h;
	const ghost = differences(variants.full, variants["no-bg"], card);
	const out = {
		ghostMean: mean(ghost),
		ghostP95: percentile(ghost, 0.95),
		ghostMax: ghost.reduce((a, b) => Math.max(a, b), 1),
		ghostArea: ghost.length / area,
		diff: {},
		/* Large-scale backdrop variation the card lets through, against the same
		 * region with no card at all: 0 would be an opaque panel. */
		retained: coarseSd(variants.bare, card, 24 * SCALE) / coarseSd(variants["no-card"], card, 24 * SCALE)
	};
	/* Nominal text contrast. A glyph covers a small part of its line box, so the
	 * glyph pixels are found by differencing the card against the same card with
	 * the diff text hidden, and the core is the end of that distribution
	 * farthest from the box's modal background. `surface` reads the glyphs
	 * against the card alone; `worst` puts the same glyph colour against the
	 * pixel the covered content pushes through underneath them. */
	for (const kind of ["add", "del", "context"]) {
		const boxes = geometry.lines.filter((l) => l.kind === kind).map((b) => ({
			x: (b.x - geometry.rect.x) * SCALE,
			y: (b.y - geometry.rect.y) * SCALE,
			w: b.w * SCALE,
			h: b.h * SCALE
		}));
		const inMask = (x, y) => boxes.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
		const clean = [];
		const glyph = [];
		const under = [];
		for (let y = card.y; y < card.y + card.h; y++) {
			for (let x = card.x; x < card.x + card.w; x++) {
				if (!inMask(x, y)) continue;
				const at = (img) => pixelLuminance(img.data, (y * img.w + x) * 3);
				const plain = at(variants["no-text"]);
				const painted = at(variants["no-bg"]);
				clean.push(plain);
				if (ratio(painted, plain) >= 1.05) {
					glyph.push(painted);
					under.push(at(variants["no-diff"]));
				}
			}
		}
		const base = percentile(clean, 0.5);
		const lo = percentile(glyph, 0.02);
		const hi = percentile(glyph, 0.98);
		const dark = Math.abs(lo - base) > Math.abs(hi - base);
		const fg = dark ? lo : hi;
		out.diff[kind] = {
			surface: ratio(fg, base),
			worst: ratio(fg, percentile(under, dark ? 0.98 : 0.02))
		};
		if (process.env.PREVIEW_DEBUG) console.log("  debug", kind, "boxes", boxes.length, "glyph px", glyph.length, JSON.stringify(out.diff[kind]));
	}
	return { out, rect: geometry.rect, images: variants };
}

/* ------------------------------------------------------------------ run -- */

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
	const hit = argv.find((a) => a.startsWith("--" + name + "="));
	return hit ? hit.slice(name.length + 3) : dflt;
};
const file = path.resolve(ROOT, flag("file", "lib/client.js"));
const seed = +flag("seed", 7);
const outDir = path.resolve(ROOT, flag("out", ".scratch"));
const tag = flag("tag", "preview");
const statesFlag = flag("states", "");

const productFiles = product();
const productCss = [
	...productFiles.static.map((f) => fs.readFileSync(f, "utf8")),
	embeddedCss(productFiles.theme),
	embeddedCss(productFiles.deliverables)
].join("\n");
PREVIEW_CLASSES = hoverCardClasses(productCss);

const sheets = buildStyles(file, seed);
const shipped = sheets[PREVIEW_SHEET];
const states = statesFlag
	? statesFlag.split("|").map((css) => ({ name: css.trim() === "none" ? "none" : css.trim(), css: css.trim() === "none" ? "" : css.trim() }))
	: [{ name: "none", css: "" }, ...(shipped ? [{ name: "shipped", css: shipped.match(/\{([^}]*)\}/)?.[1].trim() ?? "" }] : [])];
if (!statesFlag && shipped && !shipped.includes(PREVIEW_SELECTOR)) {
	throw new Error(`the preview sheet's selector is not ${PREVIEW_SELECTOR}`);
}

const { chromium } = await import(process.env.PLAYWRIGHT ?? "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH ?? path.join(
		process.env.HOME,
		"Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell"
	)
});

console.log(`\nfile ${path.relative(ROOT, file)} — aurora seed ${seed}`);
console.log(`card  ${PREVIEW_SELECTOR}\n`);
console.log("state".padEnd(38) + "palette".padEnd(8) + "ghost mean/p95/max".padEnd(22) + "area".padEnd(7) + "diff surf/worst".padEnd(17) + "aurora");

const shots = {};
for (const state of states) {
	for (const palette of ["light", "dark"]) {
		const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, deviceScaleFactor: SCALE });
		await page.setContent(sceneHtml({ sheets, productCss, state: state.css }), { waitUntil: "load" });
		await page.evaluate((dark) => {
			if (dark) document.body.dataset.dsDarkTheme = "";
		}, palette === "dark");
		const matched = await page.locator(PREVIEW_SELECTOR).count();
		if (matched !== 1) throw new Error(`${PREVIEW_SELECTOR} matched ${matched} elements`);
		const filter = await page.evaluate(() => getComputedStyle(document.getElementById("preview")).backdropFilter);
		const { out, rect, images } = await measure(page);
		const label = state.name === "none" ? "none (shipped surface)" : state.name;
		const kinds = Object.values(out.diff);
		const surface = Math.min(...kinds.map((k) => k.surface));
		const worst = Math.min(...kinds.map((k) => k.worst));
		console.log(
			label.padEnd(38) + palette.padEnd(8) +
			`${out.ghostMean.toFixed(2)} / ${out.ghostP95.toFixed(2)} / ${out.ghostMax.toFixed(2)}`.padEnd(22) +
			`${(out.ghostArea * 100).toFixed(0)}%`.padEnd(7) +
			`${surface.toFixed(1)} / ${worst.toFixed(1)}`.padEnd(17) +
			`${(out.retained * 100).toFixed(0)}%   [backdrop-filter: ${filter}]`
		);
		shots[`${state.name}|${palette}`] = { rect, images, state };
		await page.close();
	}
}
await browser.close();

/* Contact sheet: one row per palette, one column per state, cropped to the card. */
const first = Object.values(shots)[0].images.full;
const columns = states.map((s) => s.name);
const gap = 6;
const outW = first.w * columns.length + gap * (columns.length - 1);
const outH = first.h * 2 + gap;
const sheet = Buffer.alloc(outW * outH * 3, 24);
for (let row = 0; row < 2; row++) {
	const palette = row === 0 ? "light" : "dark";
	columns.forEach((name, col) => {
		const img = shots[`${name}|${palette}`].images.full;
		for (let y = 0; y < first.h; y++) {
			const src = (y * img.w) * 3;
			const dst = ((row * (first.h + gap) + y) * outW + col * (first.w + gap)) * 3;
			img.data.copy(sheet, dst, src, src + first.w * 3);
		}
	});
}
const sheetFile = path.join(outDir, `${tag}-sheet.png`);
writePng(sheetFile, outW, outH, sheet);
console.log(`\nwrote ${path.relative(ROOT, sheetFile)}  (rows light/dark, columns ${columns.join(", ")})\n`);
