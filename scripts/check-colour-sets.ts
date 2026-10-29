import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
	renderColorSets,
	type TokenFile,
	withBlotAliases,
	withHueColours,
} from "../packages/ui/src/tokens/render-tokens"

const fromRepo = (path: string) =>
	fileURLToPath(new URL(`../${path}`, import.meta.url))

const TOKENS = fromRepo("packages/ui/tokens.json")
const CATALOGUE = fromRepo("apps/ios/Kiroshi/Colors.xcassets")
const COLOUR_SET = ".colorset"

export const producedColourSets = (source: TokenFile) =>
	renderColorSets(withBlotAliases(withHueColours(source))).map(
		({ name }) => name,
	)

export const catalogueColourSets = (entries: string[]) =>
	entries
		.filter((entry) => entry.endsWith(COLOUR_SET))
		.map((entry) => entry.slice(0, -COLOUR_SET.length))

export const colourSetDifferences = (produced: string[], present: string[]) => [
	...present
		.filter((name) => !produced.includes(name))
		.sort()
		.map((name) => `extra: ${name}`),
	...produced
		.filter((name) => !present.includes(name))
		.sort()
		.map((name) => `missing: ${name}`),
]

if (import.meta.main) {
	const differences = colourSetDifferences(
		producedColourSets(JSON.parse(readFileSync(TOKENS, "utf8"))),
		catalogueColourSets(readdirSync(CATALOGUE)),
	)
	if (differences.length > 0) {
		console.error(differences.join("\n"))
		console.error(
			"Colors.xcassets doesn't match tokens.json: add the colour to packages/ui/tokens.json, or remove the set, then run bun run tokens:build.",
		)
		process.exit(1)
	}
}
