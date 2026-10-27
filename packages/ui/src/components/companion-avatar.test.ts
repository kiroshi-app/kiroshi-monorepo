import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
	type CompanionAvatarInput,
	companionAvatar,
} from "@workspace/ui/components/companion-avatar"
import {
	BLOT_HUES,
	BLOT_TINTS,
} from "@workspace/ui/components/companion-colour"
import { hexagonCorners } from "@workspace/ui/components/field-grid"

const FIXTURE = "./companion-avatar.fixture.jsonl"
const SOURCE_ROOT = join(import.meta.dirname, "..")
const RESOURCES = join(
	import.meta.dirname,
	"../../../../apps/ios/Kiroshi/Resources",
)
const WORKING_FRAME = 1234

const REPLAY_FIXTURE_IN_NODE = `
const { readFileSync } = require("node:fs")
const { deepStrictEqual } = require("node:assert")
const [bundle, fixture] = process.argv.slice(1)
;(0, eval)(readFileSync(bundle, "utf8"))
for (const line of readFileSync(fixture, "utf8").trimEnd().split("\\n")) {
	const { input, output } = JSON.parse(line)
	deepStrictEqual(companionAvatar(input), output)
}
`

const NAMES = [
	"Lyra",
	"Orion",
	"Nova",
	"Mira",
	"Vega",
	"Juno",
	"Castor",
	"Altair",
	"Atlas",
	"Kiroshi",
]

const FIXTURE_INPUTS: CompanionAvatarInput[] = NAMES.flatMap((name, index) =>
	[undefined, BLOT_HUES[BLOT_TINTS[index % BLOT_TINTS.length]]].flatMap((hue) =>
		(["idle", "working"] as const).flatMap((state) =>
			(["light", "dark"] as const).map((theme) => ({
				name,
				...(hue !== undefined && { hue }),
				state,
				time: state === "idle" ? 0 : WORKING_FRAME,
				theme,
			})),
		),
	),
)

const IMPORT = /^import\s+(type\s+)?[\s\S]*?from\s+"([^"]+)"/gm
const FORBIDDEN =
	/\breact\b|\bdocument\b|\bwindow\b|getComputedStyle|var\(--|\.css\b/

const runtimeImportsOf = (path: string): string[] =>
	Array.from(readFileSync(path, "utf8").matchAll(IMPORT))
		.filter(([, isType]) => !isType)
		.map(([, , specifier]) => specifier)

const moduleGraph = (path: string, seen = new Set<string>()): Set<string> => {
	seen.add(path)
	for (const specifier of runtimeImportsOf(path)) {
		const next = specifier.startsWith("@workspace/ui/")
			? join(SOURCE_ROOT, `${specifier.slice("@workspace/ui/".length)}.ts`)
			: specifier
		if (!seen.has(next)) moduleGraph(next, seen)
	}
	return seen
}

describe("companionAvatar", () => {
	it("draws every fixture input the way the committed fixture records it", async () => {
		const fixture = FIXTURE_INPUTS.map((input) => ({
			input,
			output: companionAvatar(input),
		}))

		await expect(
			`${fixture.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		).toMatchFileSnapshot(FIXTURE)
	})

	it("places every cell corner at its centre plus its radius times the shared offsets", () => {
		const { cells, cellCorners } = companionAvatar(FIXTURE_INPUTS[0])
		for (const cell of cells)
			expect(
				cellCorners.map(({ u, v }) => ({
					u: cell.u + cell.radius * u,
					v: cell.v + cell.radius * v,
				})),
			).toEqual(hexagonCorners(cell, cell.radius))
	})

	it("draws the fixture again from the iOS bundle evaluated alone in node", () => {
		expect(() =>
			execFileSync("node", [
				"-e",
				REPLAY_FIXTURE_IN_NODE,
				join(RESOURCES, "companion-avatar.js"),
				join(import.meta.dirname, FIXTURE),
			]),
		).not.toThrow()
	})

	it("imports nothing but plain TypeScript free of React, the DOM and CSS", () => {
		for (const path of moduleGraph(
			join(import.meta.dirname, "companion-avatar.ts"),
		)) {
			expect(path).toMatch(/\.ts$/)
			expect(readFileSync(path, "utf8")).not.toMatch(FORBIDDEN)
		}
	})
})
