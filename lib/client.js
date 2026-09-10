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
		*/
		const AURORA_CSS = `
body { background: linear-gradient(168deg, #eaf0fa 0%, #e0e9f7 55%, #e6eefa 100%) fixed; }
body[data-ds-dark-theme] { background: linear-gradient(168deg, #0d1120 0%, #141d36 55%, #0e1526 100%) fixed; }
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(800px 1000px at 0% 42%, rgba(99,102,241,0.52), transparent 60%),
    radial-gradient(750px 1050px at 100% 45%, rgba(139,92,246,0.45), transparent 62%),
    radial-gradient(1100px 700px at 12% 8%, rgba(59,130,246,0.52), transparent 62%),
    radial-gradient(900px 640px at 88% 12%, rgba(139,92,246,0.45), transparent 58%),
    radial-gradient(1000px 760px at 55% 105%, rgba(20,184,166,0.46), transparent 62%),
    radial-gradient(950px 720px at 45% 52%, rgba(251,146,60,0.30), transparent 62%);
}
body[data-ds-dark-theme]::before {
  background:
    radial-gradient(700px 950px at 0% 42%, rgba(129,140,248,0.55), transparent 62%),
    radial-gradient(750px 1050px at 100% 45%, rgba(167,139,250,0.50), transparent 62%),
    radial-gradient(1100px 700px at 12% 8%, rgba(96,165,250,0.60), transparent 62%),
    radial-gradient(900px 640px at 88% 12%, rgba(155,120,255,0.52), transparent 58%),
    radial-gradient(1000px 760px at 55% 108%, rgba(45,212,191,0.46), transparent 62%),
    radial-gradient(950px 720px at 45% 52%, rgba(251,191,36,0.34), transparent 62%);
}
`;

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
		* Client plugin body: mount the token remap, the aurora backdrop, the glass
		* surfaces, and the fullscreen sheet treatment.
		*/
		function apply(ctx) {
			installStyles(ctx, "tokens", blockOf("body", LIGHT) + blockOf("body[data-ds-dark-theme]", DARK));
			installStyles(ctx, "aurora", AURORA_CSS);
			installStyles(ctx, "glass", GLASS_CSS);
			installStyles(ctx, "fullscreen", FULLSCREEN_CSS);
		}

		exports.apply = apply;
		exports.inject = ["theme"];
		return module.exports;
	}
});
