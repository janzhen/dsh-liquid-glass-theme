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
		*
		* The menu family is one value, spelled through the product's own alias.
		* rc.2 split the shared menu material into `--dsw-menu-surface-fill` (what
		* `MenuSurface`'s blurred `.material` paints) and left `--dsw-specific-menu`
		* as an alias of it, so a menu and the few surfaces that borrow the menu
		* fill from *inside* one — the model dropdown's sticky group headers, the
		* trigger menu's bottom fade — cannot disagree. Overriding only the alias
		* broke exactly that: menus took the product's fill while those bands took
		* ours, and the bands seamed against their own menu. Both tokens now carry
		* one translucent value in the theme's own hues at the product's alpha
		* (light 0.58, dark 0.45): the theme follows the product's translucency
		* instead of substituting a near-opaque fill, which is safe because every
		* consumer of the pair already blurs its backdrop through the product's
		* 40px material filter (`--dsw-menu-backdrop-filter`). Measured worst menu
		* text contrast in `tools/aurora.mjs` stays far above the 4.5 floor — see
		* the README for the pair of numbers. On macOS desktop the product
		* re-asserts a nearly opaque `--dsw-specific-menu` for the overlays that
		* have no menu backing (specificity 0,1,2 beats the `body` rule here);
		* that is its call and is left alone.
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
			"--dsw-menu-surface-fill": "rgba(249,252,254,0.58)",
			"--dsw-specific-menu": "var(--dsw-menu-surface-fill)",
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
			"--dsw-menu-surface-fill": "rgba(15,20,32,0.45)",
			"--dsw-specific-menu": "var(--dsw-menu-surface-fill)",
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
		* paired measurement (same geometry, hue on versus off, 200 seeded builds)
		* puts the rotation at neutral on average — 100.7% of the un-rotated
		* conversation-stack contrast in the light palette, 98.7% in the dark, and
		* no stack's mean moves by more than 1.7% — so the band is free to be chosen
		* for recognition. What sets ±30 is that width being the point where the green
		* stops being the green line: a wider roll slides 557.7 nm into chartreuse on
		* one side and teal on the other, and starts pulling 630.0 nm into orange.
		* Every hue in the table is a real emission line, so the rotation is a
		* statement about which parts of the sky are in frame, not a colour filter,
		* and the measured worst-case contrast over the real stacks stays far above
		* the 4.5 AA floor for the whole roll (dark 10.34, light 11.06).
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
		* The six rows are the aurora's real emission lines, laid out by the altitude
		* they come from: atomic oxygen's green line (557.7 nm) at 100-200 km is by
		* far the strongest and owns the heavy left mass, the bottom band, and the
		* core; the same atom's red doublet (630.0/636.4 nm) needs the thin air above
		* 200 km and so sits in the top corners; the N2+ first negative band
		* (427.8 nm) is the blue the curtain shows where the electrons are hard and
		* low, on the right mass; and below ~100 km collisions quench the oxygen
		* lines entirely, so only prompt nitrogen emission survives — the rose rim
		* that meets the blue in the top right.
		*
		* Weight follows the same evidence, not the layout: the greens carry the
		* highest alpha in the table (dark 0.70 / 0.58 / 0.40) and the fringes the
		* lowest (red 0.40, rose 0.36), because that is the ratio the sky actually
		* emits in — a real display is a green curtain with faint red above it, and a
		* soft blob that shares its area evenly with complementary magenta mixes to
		* olive rather than to aurora. Hues come from the wavelengths rather than
		* from taste: 557.7 nm is a yellow-green near the eye's own peak (hue ~100),
		* 630.0 nm lands on the orange-red side of red, and the nitrogen bands run
		* violet-blue. The authored curtain greens sit a little above the line itself
		* (118 against 557.7 nm's ~101, the core at 104) so that the line stays
		* inside the roll's reach and the composited result still reads as green
		* rather than chartreuse once the layers under it have desaturated it.
		*
		* Lightness is the contrast knob and alpha is not. Green is the brightest
		* hue in luminance terms and it carries both the highest alpha and the
		* largest area, so the dark palette's three green rows sit well down the
		* lightness axis rather than being faded out: L 28 / 26 / 38, where the
		* light palette's paler backdrop affords 44 / 46 / 52.
		*
		* How far down is set by the measured balance between the two heavy masses.
		* At L 42 / 40 / 52 the dark green mass composites to 4.92x the luminance of
		* the blue mass in the opposite corner (200 builds, 3.40-6.54 across the hue
		* roll) and the curtain glows brighter than anything else on screen; fourteen
		* points down takes that to 2.26x (1.56-2.99), where the blue reads as a peer
		* while the green never falls behind it on any roll. 18 and 22 points were
		* measured too (1.73x and 1.24x); the latter crosses over — its roll bottoms
		* at 0.85x, so the blue would sometimes outshine the green, which is the
		* original complaint inverted. Darkening lifts the floor rather than lowering
		* it — worst conversation-stack contrast 10.34 dark / 11.06 light and single
		* sheet 8.50 / 8.96, against 7.57 / 11.06 and 5.54 / 8.96 before. The light
		* palette is already level at 1.10x (0.95-1.29) and is left alone.
		* `tools/aurora.mjs measure` prints both balances.
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
			{ at: [0, 42], reach: [22, 26], size: [0.85, 1.2], light: [800, 1000, 60, [64, 164, 61, 0.62]], dark: [700, 950, 62, [30, 116, 27, 0.7]] },
			{ at: [100, 45], reach: [18, 24], size: [0.85, 1.25], light: [750, 1050, 62, [74, 58, 156, 0.4]], dark: [750, 1050, 62, [69, 45, 190, 0.44]] },
			{ at: [12, 8], reach: [22, 20], size: [0.8, 1.25], light: [1100, 700, 62, [174, 71, 55, 0.38]], dark: [1100, 700, 62, [203, 58, 42, 0.4]] },
			{ at: [88, 12], reach: [22, 20], size: [0.8, 1.25], light: [900, 640, 58, [189, 66, 128, 0.34]], dark: [900, 640, 58, [208, 57, 145, 0.36]] },
			{ at: [55, 105], reach: [33, 15], size: [0.85, 1.3], light: [1000, 760, 62, [78, 171, 63, 0.5]], dark: [1000, 760, 62, [36, 107, 25, 0.58]] },
			{ at: [45, 52], reach: [22, 18], size: [0.75, 1.3], light: [950, 720, 62, [104, 194, 71, 0.34]], dark: [950, 720, 62, [68, 159, 35, 0.4]] }
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
		* on the floating composer card and on the interactive prompt cards.
		*
		* The composer card carries its frost on a pseudo-element, and the
		* reason is structural rather than cosmetic. A `backdrop-filter` on a
		* container does two things beyond filtering: it forms a backdrop root
		* (filtering descendants' backdrops down to what is painted inside the
		* container) and it becomes the containing block for fixed and absolute
		* descendants. Both bite here, because the card is not a leaf — it hosts
		* the `conversation.input.overlay` slot, so the `/` and `@` trigger menu
		* is a DOM descendant of it (`MenuSurface` renders its `.surface` inline
		* and portals only the darwin backing). With the filter on the card, that
		* menu's own `blur(40px)` material has nothing to filter: measured in
		* Chromium, the backdrop shows through the menu's 58%-opaque fill
		* perfectly sharp (`tools/menu-blur.mjs`, high-frequency energy 43% of the
		* unfiltered backdrop — the fill's own transmission — and identical
		* with the material's blur deleted). The same containing block re-anchors
		* the card's inline Tooltip bubbles, which are `position: fixed` in
		* viewport coordinates: a `position: fixed` probe inside the card lands at
		* the card's origin instead of `0,0`.
		*
		* Moving the filter to a `::before` keeps the frost and drops both side
		* effects: the pseudo blurs the real backdrop, and the card stops being a
		* backdrop root and a containing block, so the menu's own material blurs
		* (2% of the unfiltered energy) and fixed descendants anchor to the
		* viewport again. The fill stays on the card — the theme blurs backdrops
		* and leaves product tokens alone — which is why the pseudo paints no
		* background of its own: its filtered backdrop already contains the card's
		* fill, and painting it twice would darken the card.
		*
		* `z-index: 0` is load-bearing, not tidiness. The card is only
		* `position: relative` (no stacking context), so a `z-index: -1` pseudo
		* would be painted in the nearest ancestor stacking context — behind the
		* conversation panel's own translucent `bg-base`, which would wash the
		* frost out instead of showing it. `isolation: isolate` would fix the
		* stacking as well but is itself a backdrop root, which is the thing being
		* removed. The product uses this same shape for its subagent menu skin
		* (`ui-subagent/SubagentHeaderLineage.module.css`).
		*
		* The prompt-card frames are left on the plain element rule: they are
		* static, they hold no menus or fixed descendants, and giving them a
		* pseudo-element would mean making them positioned — a containing-block
		* change with no bug to justify it.
		*/
		const GLASS_CSS = `
[data-composer-card] {
  z-index: 0;
}
[data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  backdrop-filter: blur(6px) saturate(180%);
  -webkit-backdrop-filter: blur(6px) saturate(180%);
}
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
		* Changed-file diff hover preview: a diff is dense text, so it needs a
		* heavier blur than the composer card.
		*
		* The turn-tail changed-files card opens this preview on hover, and the
		* card is a `bg-layer-1` sheet — 0.55 light / 0.40 dark — floating over
		* the prose of the very turn it summarises. That token is calibrated for
		* a panel standing *behind* content, so a diff card built on it shows the
		* message text straight through its rows and the two layers of glyphs
		* interleave. The fix is the one the fullscreen sheet already uses: blur
		* the backdrop, leave the token alone.
		*
		* 12px is the knee of the measured curve (real Chromium, aurora seed 7,
		* both palettes, `tools/preview-glass.mjs`): the covered content's
		* worst-case bleed-through inside the card falls from 2.84:1 light /
		* 5.83:1 dark to 1.16 / 1.32, and in the light palette the aurora's
		* large-scale variation behind the card keeps 51% of its card-free
		* amplitude — the card is translucent, not a panel. (The dark palette
		* reports no such fraction: that stretch of backdrop is flat to begin
		* with, coarse sd 0.004, so there is nothing there to transmit.) 6px
		* still leaves the prose legible as smudges (1.35 / 1.75), and 20px buys
		* 0.04 more bleed in the light palette and 0.08 in the dark for four
		* points of aurora. The card's own diff text is untouched (worst line
		* kind 3.1 light / 6.4 dark either way), because `backdrop-filter` only
		* paints what is behind the element.
		*
		* `data-changes-hover-preview` is the stable attribute on the preview's
		* own root, and `:has()` reaches the card the primitive portals to
		* `document.body` — that card's class names are build hashes, and the
		* product's own sheets already select this way (`:has(> [data-code-block-banner])`).
		* The `body >` prefix keeps the rule on the portaled card alone: a bare
		* `:has()` would match `body` itself and blur the whole app.
		*/
		const PREVIEW_CSS = `
body > div:has([data-changes-hover-preview]) {
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
}
`;

		/**
		* Trajectory view: the ledger is a page, not a card.
		*
		* The Trajectory tab is the heaviest consumer of the surface ladder in the
		* product. The frame and the conversation root already paint `bg-base`;
		* on top of those the view root, the ledger split, and the ledger table
		* each paint `bg-layer-1`. The ladder is calibrated per sheet, not per
		* stack, so three raised-surface sheets on top of two page sheets compound
		* to 96% coverage in light and 88% in dark — the aurora comes through at
		* 3.9% / 11.8%, against 42.3% / 54.8% in the chat area. That is why the
		* theme reads as a plain opaque panel there: the backdrop it is built
		* around is buried, and every sheet of it goes to waste.
		*
		* Re-anchor the ladder inside the view rather than fighting the sheets one
		* by one. The view root stops painting a sheet at all — it *is* the
		* content area, exactly like the chat message list — and `bg-layer-1`,
		* the token every ledger sheet consumes, is scoped down to a page-rung
		* alpha. Two ledger sheets then remain over the two base sheets, which
		* lands the ledger at exactly two thirds of the chat area's aurora
		* contribution in both palettes (200-build ensemble: mean dRGB 4.7 light /
		* 9.3 dark, against 7.0 / 13.9 for the chat area and 0.6 / 3.0 as shipped).
		* Body text stays far above the 4.5 AA floor (worst build 12.7 light / 8.7
		* dark, where the shipped opaque stack measured 16.7 / 12.8 — the theme
		* was paying for contrast it did not need). Nested detail panels keep
		* their separation because their own sheet compounds on the ledger's
		* (3.8 / 7.6), and the row hover and selected tints are translucent
		* product values that read on the thinner surface unchanged.
		*
		* `data-conversation-composer-overlay` is the stable product hook the
		* Trajectory view sets to ask the conversation shell for an overlaid
		* composer instead of a seated one; it is the only view that sets it, and
		* the `body` prefix (0,1,1) outranks the view's own `.class` rules
		* (0,1,0) no matter which stylesheet lands first.
		*
		* The timeline overview band is the view's one nested surface, and it
		* steps down the same way: `bg-layer-2`, the token the plot canvas, the
		* toolbar search field, and the record-kind tooltip all consume, lands at
		* two thirds of the ledger's aurora visibility (transmittance 19.0% light
		* / 24.7% dark against the ledger's 28.4% / 36.8%). The band stays a band
		* rather than dissolving into the backdrop, which is the point: it is a
		* plot canvas and its spans have to keep reading against it. The tooltip
		* is the exception — transient text over dense rows cannot afford to show
		* rows through itself, so it is pinned to the product's own overlay rung
		* (`bg-overlay`, 0.78 light / 0.85 dark) instead of following the band.
		*
		* That pin is deliberately narrow, and it has to be: the bubbles in this
		* view are the shared tooltip primitive, which paints a *dark* bubble
		* (`bg-tooltip-bg`) under *white* label text, and only the record-kind
		* bubble is re-surfaced by the view itself (`.kindSlot [role=tooltip]`
		* swaps in `bg-layer-2`, a panel shadow, and `label-primary` text). A pin
		* scoped to every `[role=tooltip]` under the view therefore lands a light
		* background under the primitive's white text — leaving the timeline-span
		* and history tooltips unreadable in the light palette. Scoping it through
		* `data-role-kind`, the stable hook on the kind tag that owns that bubble,
		* touches that one bubble and leaves the primitive's dark bubbles alone.
		*/
		const TRAJECTORY_CSS = `
body [data-conversation-composer-overlay] {
  background: transparent;
  --dsw-alias-bg-layer-1: rgba(255,255,255,0.18);
  --dsw-alias-bg-layer-2: rgba(255,255,255,0.33);
}
body [data-conversation-composer-overlay] [data-role-kind] [role="tooltip"] {
  background: var(--dsw-alias-bg-overlay);
}
body[data-ds-dark-theme] [data-conversation-composer-overlay] {
  --dsw-alias-bg-layer-1: rgba(20,26,40,0.18);
  --dsw-alias-bg-layer-2: rgba(22,28,44,0.33);
}
`;

		/**
		* Client plugin body: mount the token remap, the aurora backdrop (its blob
		* geometry re-rolled per build), the glass surfaces, the fullscreen sheet
		* treatment, the diff preview treatment, and the Trajectory surface
		* treatment.
		*/
		function apply(ctx) {
			installStyles(ctx, "tokens", blockOf("body", LIGHT) + blockOf("body[data-ds-dark-theme]", DARK));
			installStyles(ctx, "aurora", auroraCss());
			installStyles(ctx, "glass", GLASS_CSS);
			installStyles(ctx, "fullscreen", FULLSCREEN_CSS);
			installStyles(ctx, "preview", PREVIEW_CSS);
			installStyles(ctx, "trajectory", TRAJECTORY_CSS);
		}

		exports.apply = apply;
		exports.inject = ["theme"];
		return module.exports;
	}
});
