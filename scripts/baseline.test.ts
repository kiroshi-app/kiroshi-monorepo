import { describe, expect, it } from "bun:test"

import {
	assertRedSuitesAreAttributed,
	changedTestFiles,
	compareItems,
	mergeVerdicts,
	splitByOwner,
	TESTS,
	vitestFailures,
	vitestRetriedPasses,
	withOrdinals,
} from "./baseline"

const passing = { fullName: "stays green", status: "passed" }

describe("baseline items", () => {
	it("fails on an item the baseline does not record, naming it", () => {
		const verdict = compareItems({
			area: "knip",
			committed: ["exports :: a.ts :: old"],
			live: ["exports :: a.ts :: old", "exports :: b.ts :: fresh"],
		})

		expect(verdict.failures).toHaveLength(1)
		expect(verdict.failures[0]).toContain("exports :: b.ts :: fresh")
		expect(verdict.warnings).toEqual([])
	})

	it("warns without failing on a recorded item no longer reported", () => {
		const verdict = compareItems({
			area: "tests",
			committed: ["ui :: panel.test.tsx :: Picking The Mode"],
			live: [],
		})

		expect(verdict.failures).toEqual([])
		expect(verdict.warnings).toHaveLength(1)
		expect(verdict.warnings[0]).toContain("Picking The Mode")
	})

	it("passes when the reported items are exactly the recorded ones", () => {
		const verdict = compareItems({
			area: "biome",
			committed: ["lint/style/noNonNullAssertion :: a.ts :: const x = y!"],
			live: ["lint/style/noNonNullAssertion :: a.ts :: const x = y!"],
		})

		expect(mergeVerdicts([verdict])).toEqual({ failures: [], warnings: [] })
	})

	it("keys twin items on their own rank so trading one for another shows", () => {
		expect(withOrdinals(["same", "same", "other"])).toEqual([
			"other",
			"same",
			"same #2",
		])
	})
})

describe("baseline entries owned by the suites that ran", () => {
	const committed = [
		"website :: src/a.test.ts :: stays red",
		"shared :: src/b.test.ts :: Plays",
		"sidecar :: src/c.test.ts :: times out",
	]

	it("owns the test entries of the suites that ran and keeps the others", () => {
		expect(
			splitByOwner({ area: TESTS, committed, suites: ["website", "sidecar"] }),
		).toEqual({
			owned: [
				"website :: src/a.test.ts :: stays red",
				"sidecar :: src/c.test.ts :: times out",
			],
			others: ["shared :: src/b.test.ts :: Plays"],
		})
	})

	it("never reports the entry of a suite that did not run as stale", () => {
		const { owned } = splitByOwner({
			area: TESTS,
			committed,
			suites: ["shared"],
		})

		expect(
			compareItems({
				area: TESTS,
				committed: owned,
				live: ["shared :: src/b.test.ts :: Plays"],
			}).warnings,
		).toEqual([])
	})

	it("matches a suite on its whole name, not a prefix of it", () => {
		expect(
			splitByOwner({
				area: TESTS,
				committed: ["shared :: src/b.test.ts :: Plays"],
				suites: ["share"],
			}).owned,
		).toEqual([])
	})

	it("owns every entry of an area that is not split by suite", () => {
		expect(
			splitByOwner({ area: "knip", committed: ["a--b"], suites: [] }),
		).toEqual({ owned: ["a--b"], others: [] })
	})
})

describe("baseline test items", () => {
	it("emits an item for a failed file holding no failed assertion", () => {
		const items = vitestFailures({
			suite: "website",
			report: {
				success: false,
				testResults: [
					{
						name: "apps/website/src/broken.test.ts",
						status: "failed",
						message: "collection blew\n   up",
						assertionResults: [],
					},
				],
			},
		})

		expect(items).toEqual([
			"website :: apps/website/src/broken.test.ts :: collection blew up",
		])
	})

	it("emits one item per failed assertion, not the file message", () => {
		const items = vitestFailures({
			suite: "ui",
			report: {
				success: false,
				testResults: [
					{
						name: "packages/ui/src/panel.test.ts",
						status: "failed",
						message: "1 test failed",
						assertionResults: [
							passing,
							{ fullName: "panel opens late", status: "failed" },
						],
					},
				],
			},
		})

		expect(items).toEqual([
			"ui :: packages/ui/src/panel.test.ts :: panel opens late",
		])
	})

	it("names a test that passed only on its retry, never one green at once or red on its retry", () => {
		const retried = vitestRetriedPasses({
			success: false,
			testResults: [
				{
					name: "apps/website/src/flip.test.ts",
					status: "failed",
					assertionResults: [
						{ ...passing, failureMessages: [] },
						{
							fullName: "flips once",
							status: "passed",
							failureMessages: ["AssertionError: expected 1 to be 2"],
						},
						{
							fullName: "stays red",
							status: "failed",
							failureMessages: ["first", "second"],
						},
					],
				},
			],
		})

		expect(retried).toEqual([
			{ file: "apps/website/src/flip.test.ts", name: "flips once" },
		])
	})

	it("emits nothing for a green file", () => {
		const items = vitestFailures({
			suite: "website",
			report: {
				success: true,
				testResults: [
					{
						name: "apps/website/src/fine.test.ts",
						status: "passed",
						assertionResults: [passing],
					},
				],
			},
		})

		expect(items).toEqual([])
	})
})

describe("red suites", () => {
	it("throws on a suite red with no attributable failure, naming it", () => {
		expect(() =>
			assertRedSuitesAreAttributed([
				{ suite: "website", red: false, items: [] },
				{ suite: "sidecar", red: true, items: [] },
			]),
		).toThrow(/sidecar/)
	})

	it("accepts a red suite whose failures are attributable", () => {
		expect(() =>
			assertRedSuitesAreAttributed([
				{ suite: "ui", red: true, items: ["ui :: a.test.ts :: boom"] },
			]),
		).not.toThrow()
	})
})

describe("unit test files changed since origin/main", () => {
	it("keeps the test files under the source folder of the workspace", () => {
		expect(
			changedTestFiles({
				root: "apps/website",
				paths: [
					"apps/website/src/login-search.test.ts",
					"apps/website/src/login-search.ts",
					"apps/website/vitest.config.ts",
					"apps/app/sidecar/src/contracts.test.ts",
					"packages/ui/src/hooks/use-skeleton-timing.test.tsx",
				],
			}),
		).toEqual(["apps/website/src/login-search.test.ts"])
	})

	it("keeps the tsx test files of packages/ui", () => {
		expect(
			changedTestFiles({
				root: "packages/ui",
				paths: ["packages/ui/src/hooks/use-skeleton-timing.test.tsx"],
			}),
		).toEqual(["packages/ui/src/hooks/use-skeleton-timing.test.tsx"])
	})

	it.each([
		["apps/app/sidecar", ["apps/app/sidecar/src/contracts.test.ts"]],
		[".github", [".github/workflows/ci.yml"]],
	])("finds none on a branch that changes only %s", (_, paths) => {
		expect(changedTestFiles({ root: "apps/website", paths })).toEqual([])
		expect(changedTestFiles({ root: "packages/ui", paths })).toEqual([])
	})
})
