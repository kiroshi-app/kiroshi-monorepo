import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
	CATALOGUE_CONTENTS,
	renderColorSets,
	renderCss,
	type TokenFile,
} from "./render-tokens"

const fromRepo = (path: string) =>
	fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

const TOKENS = fromRepo("packages/ui/tokens.json")
const CSS = fromRepo("packages/ui/src/styles/tokens.css")
const CATALOGUE = fromRepo("apps/ios/Kiroshi/Colors.xcassets")

const file: TokenFile = JSON.parse(readFileSync(TOKENS, "utf8"))

writeFileSync(CSS, renderCss(file))
execFileSync("bunx", ["biome", "format", "--write", CSS], { stdio: "inherit" })

rmSync(CATALOGUE, { recursive: true, force: true })
mkdirSync(CATALOGUE)
writeFileSync(`${CATALOGUE}/Contents.json`, CATALOGUE_CONTENTS)
for (const { name, contents } of renderColorSets(file)) {
	mkdirSync(`${CATALOGUE}/${name}.colorset`)
	writeFileSync(`${CATALOGUE}/${name}.colorset/Contents.json`, contents)
}
