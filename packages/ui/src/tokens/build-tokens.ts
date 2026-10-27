import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
	CATALOGUE_CONTENTS,
	hueTonesOf,
	renderColorSets,
	renderCss,
	type TokenFile,
	withHueColours,
} from "./render-tokens"

const fromRepo = (path: string) =>
	fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

const TOKENS = fromRepo("packages/ui/tokens.json")
const CSS = fromRepo("packages/ui/src/styles/tokens.css")
const HUE_TONES = fromRepo("packages/ui/src/components/hue-tones.ts")
const CATALOGUE = fromRepo("apps/ios/Kiroshi/Colors.xcassets")

const source: TokenFile = JSON.parse(readFileSync(TOKENS, "utf8"))
const file = withHueColours(source)
const hue = source.hue as NonNullable<TokenFile["hue"]>

const constant = (name: string, value: unknown) =>
	`export const ${name} = ${JSON.stringify(value)} as const\n`

writeFileSync(
	HUE_TONES,
	[
		constant("HUE_PRESETS", hue.presets),
		constant("YELLOW_BAND", hue["yellow-band"]),
		constant("HUE_TONES", hueTonesOf(source)),
	].join("\n"),
)
writeFileSync(CSS, renderCss(file))
execFileSync("bunx", ["biome", "format", "--write", CSS, HUE_TONES], {
	stdio: "inherit",
})

rmSync(CATALOGUE, { recursive: true, force: true })
mkdirSync(CATALOGUE)
writeFileSync(`${CATALOGUE}/Contents.json`, CATALOGUE_CONTENTS)
for (const { name, contents } of renderColorSets(file)) {
	mkdirSync(`${CATALOGUE}/${name}.colorset`)
	writeFileSync(`${CATALOGUE}/${name}.colorset/Contents.json`, contents)
}
