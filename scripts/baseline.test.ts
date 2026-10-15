import { describe, expect, it } from "bun:test"

import {
	assertRedSuitesAreAttributed,
	changedTestFiles,
	compareItems,
	compareStories,
	mergeVerdicts,
	testedStoryIds,
	vitestFailures,
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
			committed: ["ui :: panel.stories.tsx :: Picking The Mode"],
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

describe("baseline test items", () => {
	it("emits an item for a failed file holding no failed assertion", () => {
		const items = vitestFailures({
			suite: "app",
			report: {
				success: false,
				testResults: [
					{
						name: "apps/app/src/broken.test.ts",
						status: "failed",
						message: "collection blew\n   up",
						assertionResults: [],
					},
				],
			},
		})

		expect(items).toEqual([
			"app :: apps/app/src/broken.test.ts :: collection blew up",
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

	it("emits nothing for a green file", () => {
		const items = vitestFailures({
			suite: "app",
			report: {
				success: true,
				testResults: [
					{
						name: "apps/app/src/fine.test.ts",
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
				{ suite: "app", red: false, items: [] },
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

describe("baseline stories", () => {
	it("fails on a story id the baseline does not record, naming it", () => {
		const verdict = compareStories({
			committed: ["primitives-button--variants"],
			live: ["primitives-button--variants", "primitives-button--sizes"],
		})

		expect(verdict.failures).toHaveLength(1)
		expect(verdict.failures[0]).toContain("primitives-button--sizes")
	})

	it("fails on a recorded story id no longer reported, naming it", () => {
		const verdict = compareStories({
			committed: ["overlays-dialog--playground", "overlays-dialog--nested"],
			live: ["overlays-dialog--playground"],
		})

		expect(verdict.failures).toHaveLength(1)
		expect(verdict.failures[0]).toContain("overlays-dialog--nested")
		expect(verdict.warnings).toEqual([])
	})

	it("fails on a story moved between families", () => {
		const verdict = compareStories({
			committed: ["forms-switch--playground"],
			live: ["primitives-switch--playground"],
		})

		expect(verdict.failures).toHaveLength(2)
	})

	it("passes when the reported story ids are exactly the recorded ones", () => {
		const verdict = compareStories({
			committed: ["layout-shell--playground", "forms-field--playground"],
			live: ["forms-field--playground", "layout-shell--playground"],
		})

		expect(verdict.failures).toEqual([])
	})
})

describe("story ids read from the storybook index", () => {
	it("keeps the stories the storybook vitest project plays, nothing else", () => {
		const ids = testedStoryIds({
			entries: {
				played: { id: "chat--played", type: "story", tags: ["dev", "test"] },
				untested: { id: "chat--untested", type: "story", tags: ["dev"] },
				untagged: { id: "chat--untagged", type: "story" },
				docs: { id: "chat--docs", type: "docs", tags: ["dev", "test"] },
			},
		})

		expect(ids).toEqual(["chat--played"])
	})
})

describe("unit test files changed since origin/main", () => {
	it("keeps the test files under the source folder of the workspace", () => {
		expect(
			changedTestFiles({
				root: "apps/app",
				paths: [
					"apps/app/src/lib/chat/rotation.test.ts",
					"apps/app/src/lib/chat/rotation.ts",
					"apps/app/vitest.config.ts",
					"apps/app/sidecar/src/contracts.test.ts",
					"packages/ui/src/hooks/use-skeleton-timing.test.tsx",
				],
			}),
		).toEqual(["apps/app/src/lib/chat/rotation.test.ts"])
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
		["apps/website", ["apps/website/src/pages/index.test.ts"]],
		[".github", [".github/workflows/ci.yml"]],
	])("finds none on a branch that changes only %s", (_, paths) => {
		expect(changedTestFiles({ root: "apps/app", paths })).toEqual([])
		expect(changedTestFiles({ root: "packages/ui", paths })).toEqual([])
	})
})
