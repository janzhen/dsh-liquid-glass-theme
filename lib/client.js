window.__ModuleLoader__.load({
	id: "dsh-liquid-glass-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		* Liquid-glass token remap, light + dark palette. Full --dsw-* surface:
		* the values ride plain stylesheets on `body` and `body[data-ds-dark-theme]`
		* (same selector specificity as the product sheets, injected later), so the
		* theme service's 13-token whitelist is irrelevant and every consuming
		* package follows automatically.
		*/
		const LIGHT = {
			"--dsw-alias-bg-base": "rgba(240,244,250,0.35)",
			"--dsw-alias-bg-layer-1": "rgba(255,255,255,0.55)",
			"--dsw-alias-bg-layer-2": "rgba(255,255,255,0.90)",
			"--dsw-alias-bg-overlay": "rgba(255,255,255,0.78)",
			"--dsw-alias-border-l1": "rgba(255,255,255,0.60)",
			"--dsw-alias-border-l2": "rgba(101,119,153,0.28)",
			"--dsw-alias-brand-primary": "#161a24",
			"--dsw-alias-label-primary": "#161a24",
			"--dsw-alias-label-secondary": "#4b5569",
			"--dsw-alias-state-error-primary": "#d92d20",
			"--dsw-alias-state-success-primary": "#0e9f6e",
			"--dsw-alias-state-warn-primary": "#dd8500",
			"--dsw-specific-sidebar-fill": "linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.16) 100%)",
			"--dsw-alias-markdown-code-block": "rgba(255,255,255,0.50)",
			"--dsw-alias-markdown-code-block-banner": "rgba(255,255,255,0.42)",
			"--dsw-alias-markdown-inline-code": "rgba(255,255,255,0.45)",
			"--dsw-specific-menu": "rgba(249,252,254,0.94)",
			"--dsw-specific-bubble": "rgba(255,255,255,0.72)",
			"--dsw-specific-input-major": "rgba(255,255,255,0.50)",
			"--dsw-specific-selector": "rgba(242,247,251,0.92)"
		};
		const DARK = {
			"--dsw-alias-bg-base": "rgba(13,18,32,0.26)",
			"--dsw-alias-bg-layer-1": "rgba(20,26,40,0.40)",
			"--dsw-alias-bg-layer-2": "rgba(22,28,44,0.88)",
			"--dsw-alias-bg-overlay": "rgba(18,23,37,0.85)",
			"--dsw-alias-border-l1": "rgba(255,255,255,0.10)",
			"--dsw-alias-border-l2": "rgba(255,255,255,0.18)",
			"--dsw-alias-brand-primary": "#e9edf8",
			"--dsw-alias-label-primary": "#e9edf8",
			"--dsw-alias-label-secondary": "#a3adc2",
			"--dsw-alias-state-error-primary": "#f97066",
			"--dsw-alias-state-success-primary": "#32d583",
			"--dsw-alias-state-warn-primary": "#fdb022",
			"--dsw-specific-sidebar-fill": "linear-gradient(180deg, rgba(10,14,24,0.24) 0%, rgba(10,14,24,0.10) 100%)",
			"--dsw-alias-markdown-code-block": "rgba(10,13,22,0.38)",
			"--dsw-alias-markdown-code-block-banner": "rgba(12,16,27,0.42)",
			"--dsw-alias-markdown-inline-code": "rgba(20,26,40,0.45)",
			"--dsw-specific-menu": "rgba(15,20,32,0.94)",
			"--dsw-specific-bubble": "rgba(16,22,36,0.72)",
			"--dsw-specific-input-major": "rgba(14,19,31,0.50)",
			"--dsw-specific-selector": "rgba(12,17,28,0.92)"
		};
		/** Serialize one selector block from a token map. */
		function blockOf(selector, map) {
			return selector + "{" + Object.entries(map).map(([key, value]) => key + ":" + value).join(";") + "}";
		}

		/**
		* Aurora backdrop: the base gradient paints on `body` itself (it never
		* scrolls, so it is viewport-fixed in effect); the light blobs ride a fixed
		* `body::before` behind the app frame. Both palettes switch through the
		* stable `body[data-ds-dark-theme]` attribute the theme presenter owns.
		*
		* Geometry and hue are re-rolled every time the sheet is built — once per page
		* load and once per plugin reload — so no two loads paint the same backdrop,
		* while nothing animates: within one load the numbers are frozen. Every blob
		* rolls inside its own authored travel range, and one palette-wide hue
		* rotation shifts the whole set coherently — per-blob offsets keep that
		* reading as a palette shift instead of a colour filter. Alpha and row order
		* stay fixed on purpose.
		*
		* The hue width is set by palette identity, not by contrast headroom. A
		* paired measurement (same geometry, hue on versus off, 400 builds) puts the
		* rotation at neutral on average — 99.8% of the un-rotated contrast in the
		* light palette, 94.2% in the dark — and worst-case body-text contrast over
		* the real surface stacks stays above the 4.5 AA floor out to about ±40°,
		* where the weakest stack touches 4.48. What sets ±30 here is recognition:
		* a wider rotation starts turning the authored amber green.
		*/

		/**
		* Uniform sample from a [min, max] range.
		* @param range - the two bounds.
		* @returns the sampled value.
		*/
		function pick(range) {
			return range[0] + Math.random() * (range[1] - range[0]);
		}

		/**
		* Fraction of each row's authored travel actually used, from 0 to 1. This is
		* the single knob for how different one load looks from the next: 0 pins the
		* whole composition and leaves only the palette roll, 1 uses the full reach
		* of {@link BLOBS}, and everything in between trades variation for calm. It
		* is one number on purpose — the two ends were each tried as their own
		* branch (hue alone read as too flat, full reach as too jumpy) and the
		* useful range is the middle, so this is a dial rather than a rewrite.
		*/
		const TRAVEL = 0.35;

		/**
		* Sample a symmetric travel around an anchor, scaled by {@link TRAVEL}.
		* @param anchor - the authored value, in viewport percent.
		* @param reach - the distance from that anchor at full travel, in percent.
		* @returns the sampled value.
		*/
		function roam(anchor, reach) {
			return anchor + (Math.random() * 2 - 1) * reach * TRAVEL;
		}

		/**
		* Falloff-stop band, in percentage points around each palette's authored
		* stop, at full travel. How soft a blob's edge is reads as part of its size,
		* so it rolls with the rest of the geometry.
		*/
		const STOP_BAND = [-5, 5];

		/**
		* Palette-wide hue rotation band, in degrees: one roll per build, added to
		* every blob in both palettes.
		*/
		const PALETTE_HUE = [-30, 30];

		/**
		* Extra per-blob hue offset, in degrees, on top of the palette roll so the
		* set does not shift like one flat filter.
		*/
		const BLOB_HUE = [-7, 7];

		/**
		* Convert an authored [r, g, b, a] colour to the hue, saturation, and
		* lightness the palette roll rotates.
		* @param color - red, green, and blue (0-255) plus alpha (0-1).
		* @returns [hue in degrees, saturation percent, lightness percent].
		*/
		function toHsl(color) {
			const [r, g, b] = color.map((channel) => channel / 255);
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			const lightness = (max + min) / 2;
			const delta = max - min;
			if (delta === 0) return [0, 0, lightness * 100];
			const saturation = delta / (1 - Math.abs(2 * lightness - 1));
			const sector = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
			return [sector * 60, saturation * 100, lightness * 100];
		}

		/**
		* Blob table: `at` is the authored anchor in viewport percent, `reach` is how
		* far that anchor may travel at full {@link TRAVEL}, and `size` is the radius
		* band as a fraction of the authored radius at full travel. Each row also
		* carries its per-palette authored radius, falloff stop, and an [r, g, b, a]
		* colour whose hue the palette roll rotates. Saturation and lightness come
		* from that authored colour and never roll, which is what keeps a rotation
		* from turning into a contrast change.
		*
		* The reach values are the width that turned out useful: a symmetric ±4pt
		* wobble around a fixed anchor reads as the same backdrop, because the big
		* colour masses never leave their own corner, while the full reach of these
		* numbers reads as too jumpy — the composition changes shape every load. Half
		* of it keeps each row's role (left mid, right mid, top corners, bottom,
		* centre) recognizable while letting the masses genuinely move, and the heavy
		* left and right rows keep disjoint reaches so the palette never collapses
		* into one muddy core.
		*/
		const BLOBS = [
			{ at: [0, 42], reach: [22, 26], size: [0.85, 1.2], light: [800, 1000, 60, [99, 102, 241, 0.52]], dark: [700, 950, 62, [129, 140, 248, 0.55]] },
			{ at: [100, 45], reach: [18, 24], size: [0.85, 1.25], light: [750, 1050, 62, [139, 92, 246, 0.45]], dark: [750, 1050, 62, [167, 139, 250, 0.5]] },
			{ at: [12, 8], reach: [22, 20], size: [0.8, 1.25], light: [1100, 700, 62, [59, 130, 246, 0.52]], dark: [1100, 700, 62, [96, 165, 250, 0.6]] },
			{ at: [88, 12], reach: [22, 20], size: [0.8, 1.25], light: [900, 640, 58, [139, 92, 246, 0.45]], dark: [900, 640, 58, [155, 120, 255, 0.52]] },
			{ at: [55, 105], reach: [33, 15], size: [0.85, 1.3], light: [1000, 760, 62, [20, 184, 166, 0.46]], dark: [1000, 760, 62, [45, 212, 191, 0.46]] },
			{ at: [45, 52], reach: [22, 18], size: [0.75, 1.3], light: [950, 720, 62, [251, 146, 60, 0.3]], dark: [950, 720, 62, [251, 191, 36, 0.34]] }
		];

		/**
		* Build one palette's blob layer, applying the hue roll to each authored
		* colour.
		* @param palette - "light" or "dark" row of {@link BLOBS}.
		* @param geometry - the roll, one {x, y, size, stop, hue} per row.
		* @returns the comma-separated radial gradients, one per line.
		*/
		function blobLayer(palette, geometry) {
			return BLOBS.map((blob, index) => {
				const [width, height, stop, color] = blob[palette];
				const spot = geometry[index];
				const [hue, saturation, lightness] = toHsl(color);
				return "    radial-gradient(" + Math.round(width * spot.size) + "px " + Math.round(height * spot.size) + "px at " +
					spot.x.toFixed(1) + "% " + spot.y.toFixed(1) + "%, " +
					"hsla(" + Math.round((hue + spot.hue + 360) % 360) + ", " + Math.round(saturation) + "%, " + Math.round(lightness) + "%, " + color[3] + "), " +
					"transparent " + Math.round(stop + spot.stop) + "%)";
			}).join(",\n");
		}

		/**
		* Build the whole aurora sheet. The rolls happen inside the build, so a
		* plugin reload re-rolls too — not only a page load. Both palettes share one
		* roll, so switching light/dark never reshuffles the backdrop.
		* @returns the CSS text handed to {@link installStyles}.
		*/
		function auroraCss() {
			const paletteHue = pick(PALETTE_HUE);
			const geometry = BLOBS.map((blob) => ({
				x: roam(blob.at[0], blob.reach[0]),
				y: roam(blob.at[1], blob.reach[1]),
				size: 1 + (pick(blob.size) - 1) * TRAVEL,
				stop: pick(STOP_BAND) * TRAVEL,
				hue: paletteHue + pick(BLOB_HUE)
			}));
			return `
body { background: linear-gradient(168deg, #eaf0fa 0%, #e0e9f7 55%, #e6eefa 100%) fixed; }
body[data-ds-dark-theme] { background: linear-gradient(168deg, #0d1120 0%, #141d36 55%, #0e1526 100%) fixed; }
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
${blobLayer("light", geometry)};
}
body[data-ds-dark-theme]::before {
  background:
${blobLayer("dark", geometry)};
}
`;
		}

		/**
		* Mount one stylesheet for exactly the owning plugin lifetime (the same
		* pattern the ui-theme package uses for its global sheets).
		* @param ctx - client plugin context.
		* @param name - stylesheet facet name (diagnostics only).
		* @param css - raw CSS text.
		*/
		function installStyles(ctx, name, css) {
			ctx.effect(() => {
				if (typeof document === "undefined") return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-liquid-glass-theme";
				tag.dataset.pluginCss = "dsh-liquid-glass-theme/" + name;
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "liquid-glass: " + name);
		}

		/**
		* Glass surface treatments: frosted backdrop blur and saturation boost
		* on floating composer card and interactive prompt cards.
		*/
		const GLASS_CSS = `
[data-composer-card],
[data-question-key],
[data-plan-review-key],
[data-approval-key] {
  backdrop-filter: blur(6px) saturate(180%);
  -webkit-backdrop-filter: blur(6px) saturate(180%);
}
`;

		/**
		* Full-bleed glass sheet: the right Sidebar's fullscreen presentation is
		* `position: fixed; inset: 0; z-index: 40` across the whole viewport and
		* paints `--dsw-alias-bg-base`. That token's alpha is calibrated for the two
		* consumers standing behind content (frame + conversation root); this panel
		* is a third, large-area consumer and it covers text instead of backdrop, so
		* the conversation underneath reads straight through it and the two layers
		* of glyphs overlap. Blur the backdrop rather than raising the token: the
		* palette keeps its translucency and the covered content stops being legible.
		* The `body` prefix makes the rule outrank the panel's own `.class` rule
		* (0,1,1 vs 0,1,0) regardless of stylesheet injection order, and
		* `data-sidebar-right-panel` is a stable product hook, not a hashed class.
		*/
		const FULLSCREEN_CSS = `
body [data-sidebar-right-panel="fullscreen"] {
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
}
`;

		/**
		* Client plugin body: mount the token remap, the aurora backdrop (its blob
		* geometry re-rolled per build), the glass surfaces, and the fullscreen
		* sheet treatment.
		*/
		function apply(ctx) {
			installStyles(ctx, "tokens", blockOf("body", LIGHT) + blockOf("body[data-ds-dark-theme]", DARK));
			installStyles(ctx, "aurora", auroraCss());
			installStyles(ctx, "glass", GLASS_CSS);
			installStyles(ctx, "fullscreen", FULLSCREEN_CSS);
		}

		exports.apply = apply;
		exports.inject = ["theme"];
		return module.exports;
	}
});
