/**
 * The three things the measurement tools need from the machine, resolved the
 * way the environment already expresses them instead of by constants that only
 * hold on one computer.
 *
 *   1. the driver — `playwright`, a devDependency of this repository
 *      (`npm i`). Node resolves it from the importing file, so the tools work
 *      from any cwd and installing it globally or vendoring it only changes
 *      where `node_modules` lives. `$PLAYWRIGHT` stays as an explicit
 *      escape hatch: a path or specifier to import instead.
 *   2. the browser — a Chromium headless shell in Playwright's own cache
 *      (`$PLAYWRIGHT_BROWSERS_PATH`, else the per-OS default), across the
 *      layouts Playwright has shipped (`chrome-headless-shell-<arch>/…`,
 *      `chrome-mac/headless_shell`, `chrome-linux/headless_shell`), newest
 *      revision first. `$CHROME_PATH` overrides the search. This matters on an
 *      OS the newest Playwright refuses to install for (macOS 12 pins 1.55.0,
 *      whose build is `chrome-mac/headless_shell`), and a newer library driving
 *      an older build is fine.
 *   3. the product — the *running* dsh install. A profile that lists
 *      `@deepseek-ai/dsh` resolves from the profile; a globally installed CLI
 *      does not, so the `dsh` on `$PATH` is walked up to its package root. Never
 *      resolve through the profile's flat `node_modules`: a stale symlink there
 *      pins an old package (see `tools/menu-blur.mjs`'s header).
 *
 * Every failure names the thing to install or the variable to set, rather than
 * surfacing someone else's absolute path in an `ERR_MODULE_NOT_FOUND`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** Profile whose installed packages the tools measure; `$DSH_INSTALL` overrides discovery. */
const PROFILE = process.env.DSH_PROFILE_DIR ?? path.join(process.env.DSH_HOME ?? "", "profiles", process.env.DSH_PROFILE ?? "web");

/**
 * The running dsh install: the profile's dependency when it has one, else the
 * `dsh` executable on `$PATH` walked up to its own package root.
 * @returns the directory holding dsh's package.json.
 */
export function dshInstall() {
	if (process.env.DSH_INSTALL !== undefined) return process.env.DSH_INSTALL;
	const profilePackage = path.join(PROFILE, "package.json");
	if (fs.existsSync(profilePackage)) {
		try {
			return path.dirname(createRequire(profilePackage).resolve("@deepseek-ai/dsh/package.json"));
		} catch {
			/* globally installed CLI: fall through to the PATH scan */
		}
	}
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		const binary = path.join(dir, "dsh");
		if (!fs.existsSync(binary)) continue;
		let at = fs.realpathSync(binary);
		for (let i = 0; i < 6; i++) {
			at = path.dirname(at);
			const candidate = path.join(at, "package.json");
			if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate, "utf8")).name === "@deepseek-ai/dsh") return at;
			if (at === path.dirname(at)) break;
		}
	}
	throw new Error(`cannot find the dsh install: neither ${PROFILE} nor any "dsh" on $PATH resolves @deepseek-ai/dsh (set $DSH_INSTALL to its directory)`);
}

/**
 * Resolve one of the installed product's packages.
 * @param spec - package subpath to resolve.
 * @returns the absolute path.
 */
export function resolveProduct(spec) {
	return createRequire(path.join(dshInstall(), "package.json")).resolve(spec);
}

/**
 * The Playwright driver. `$PLAYWRIGHT` (a path or a package specifier) wins;
 * otherwise the repository's devDependency is imported by name.
 * @returns the module namespace, with `chromium` on it.
 */
export async function loadChromium() {
	const override = process.env.PLAYWRIGHT;
	if (override !== undefined && override !== "") return import(override);
	try {
		return await import("playwright");
	} catch (error) {
		throw new Error(`cannot load the Playwright driver: run "npm i" in the repository (playwright is a devDependency) or set $PLAYWRIGHT to a playwright module (${error.code ?? error.message})`);
	}
}

/**
 * Playwright's browser cache directory.
 * @returns the directory a browser install would be in.
 */
function browserCache() {
	const override = process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (override !== undefined && override !== "" && override !== "0") return override;
	return path.join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright");
}

/**
 * The headless shell to launch: `$CHROME_PATH` when set, else the newest
 * revision in Playwright's cache across every layout it has shipped.
 * @returns the executable path.
 */
export function browserPath() {
	if (process.env.CHROME_PATH !== undefined && process.env.CHROME_PATH !== "") return process.env.CHROME_PATH;
	const cache = browserCache();
	const builds = fs.existsSync(cache)
		? fs.readdirSync(cache).filter((name) => /^chromium_headless_shell-\d+$/.test(name))
		: [];
	builds.sort((a, b) => Number(b.slice(b.lastIndexOf("-") + 1)) - Number(a.slice(a.lastIndexOf("-") + 1)));
	const layouts = [
		"chrome-headless-shell-mac-arm64/chrome-headless-shell",
		"chrome-headless-shell-mac-x64/chrome-headless-shell",
		"chrome-headless-shell-linux64/chrome-headless-shell",
		"chrome-mac/headless_shell",
		"chrome-linux/headless_shell"
	];
	for (const build of builds) {
		for (const layout of layouts) {
			const candidate = path.join(cache, build, layout);
			if (fs.existsSync(candidate)) return candidate;
		}
	}
	throw new Error(`no Chromium headless shell under ${cache}: run "npx playwright install chromium-headless-shell" (macOS 12: with playwright 1.55.0) or set $CHROME_PATH`);
}
