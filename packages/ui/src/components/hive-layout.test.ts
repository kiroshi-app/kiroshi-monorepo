import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
	type HiveLayoutInput,
	type HiveParticipant,
	hiveLayout,
} from "@workspace/ui/components/hive-layout"

const FIXTURE = "./hive-layout.fixture.jsonl"
const SOURCE_ROOT = join(import.meta.dirname, "..")
const RESOURCES = join(
	import.meta.dirname,
	"../../../../apps/ios/Kiroshi/Resources",
)
const SIZES = [40, 96]

const REPLAY_FIXTURE_IN_NODE = `
const { readFileSync } = require("node:fs")
const { deepStrictEqual } = require("node:assert")
const [bundle, fixture] = process.argv.slice(1)
;(0, eval)(readFileSync(bundle, "utf8"))
for (const line of readFileSync(fixture, "utf8").trimEnd().split("\\n")) {
	const { input, output } = JSON.parse(line)
	deepStrictEqual(hiveLayout(input), output)
}
`

const companions = (count: number): HiveParticipant[] =>
	Array.from({ length: count }, (_, index) => ({ id: `companion-${index}` }))

const PERSON: HiveParticipant = { id: "person", isPerson: true }

const working = (participant: HiveParticipant): HiveParticipant => ({
	...participant,
	working: true,
})

const [FIRST, SECOND, THIRD, FOURTH, FIFTH] = companions(5)

const ROOMS: HiveParticipant[][] = [
	companions(1),
	companions(2),
	companions(3),
	companions(4),
	companions(8),
	[FIRST, PERSON, SECOND],
	[FIRST, working(SECOND)],
	[FIRST, SECOND, THIRD, working(FOURTH), FIFTH],
]

const FIXTURE_INPUTS: HiveLayoutInput[] = ROOMS.flatMap((participants) =>
	SIZES.map((size) => ({ participants, size })),
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

const idsOf = (input: HiveLayoutInput) =>
	hiveLayout(input).cells.map(({ id }) => id)

describe("hiveLayout", () => {
	it("lays out every fixture input the way the committed fixture records it", async () => {
		const fixture = FIXTURE_INPUTS.map((input) => ({
			input,
			output: hiveLayout(input),
		}))

		await expect(
			`${fixture.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		).toMatchFileSnapshot(FIXTURE)
	})

	it("draws working participants first, each group in input order", () => {
		expect(
			idsOf({
				participants: [FIRST, working(SECOND), THIRD, working(FOURTH)],
				size: 40,
			}),
		).toEqual([SECOND.id, FOURTH.id])
	})

	it("counts in the overflow cell every participant left out of the drawn cells", () => {
		expect(
			hiveLayout({ participants: companions(8), size: 40 }).overflow
				?.hiddenCount,
		).toBe(6)
	})

	it("draws a person as a circle and a companion as a hexagon", () => {
		expect(
			hiveLayout({ participants: [PERSON, FIRST], size: 96 }).cells.map(
				({ shape }) => shape,
			),
		).toEqual(["circle", "hexagon"])
	})

	it("returns data that survives a JSON round trip unchanged", () => {
		for (const input of FIXTURE_INPUTS)
			expect(JSON.parse(JSON.stringify(hiveLayout(input)))).toEqual(
				hiveLayout(input),
			)
	})

	it("lays out the fixture again from the iOS bundle evaluated alone in node", () => {
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
			join(import.meta.dirname, "hive-layout.ts"),
		)) {
			expect(path).toMatch(/\.ts$/)
			expect(readFileSync(path, "utf8")).not.toMatch(FORBIDDEN)
		}
	})
})
