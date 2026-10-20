import { describe, expect, it } from "bun:test"

import { decideJobs, touchedJobs } from "./ci-changes"

const none = {
	rust: false,
	vitest: false,
	website: false,
	storybook: false,
	ios: false,
}
const every = {
	rust: true,
	vitest: true,
	website: true,
	storybook: true,
	ios: true,
}
const noJob = { ...none, lint: false, "rust-check": false }

const SHARED_ONLY_PATHS = [
	"packages/shared/permission-modes.json",
	"packages/shared/src/index.ts",
]

const PATH_MIXES = [
	[],
	["bun.lock"],
	["packages/ui/src/components/button.tsx"],
	["apps/app/src/main.tsx"],
	["apps/app/src-tauri/src/lib.rs"],
	["apps/ios/Kiroshi/App.swift"],
	SHARED_ONLY_PATHS,
]

const touching = (...paths: string[]) => touchedJobs(paths)

const runChangeDetector = (...args: string[]) =>
	Bun.spawnSync([
		process.execPath,
		new URL("./ci-changes.ts", import.meta.url).pathname,
		...args,
	])

describe("ci jobs per event", () => {
	it.each(PATH_MIXES)(
		"runs only lint and vitest on a pull_request, vitest on the paths it watches, on %p",
		(...paths) => {
			expect(decideJobs({ event: "pull_request", paths })).toEqual({
				...noJob,
				lint: true,
				vitest: touchedJobs(paths).vitest,
			})
		},
	)

	it("skips storybook, rust, rust-check, website and ios on a pull_request touching every path", () => {
		const jobs = decideJobs({ event: "pull_request", paths: ["bun.lock"] })

		expect(jobs).toEqual({ ...noJob, lint: true, vitest: true })
	})

	it.each(PATH_MIXES)(
		"runs lint, then rust-check, rust, vitest, website and storybook on the paths they watch on a merge_group, never ios, on %p",
		(...paths) => {
			const touched = touchedJobs(paths)

			expect(decideJobs({ event: "merge_group", paths })).toEqual({
				lint: true,
				"rust-check": touched.rust,
				rust: touched.rust,
				vitest: touched.vitest,
				website: touched.website,
				storybook: touched.storybook,
				ios: false,
			})
		},
	)

	it("runs every desktop job on a merge_group touching a shared path", () => {
		expect(decideJobs({ event: "merge_group", paths: ["bun.lock"] })).toEqual({
			...every,
			lint: true,
			"rust-check": true,
			ios: false,
		})
	})

	it.each(PATH_MIXES)(
		"runs only ios on a push to main, the merge_group run of the commit having run the rest, on %p",
		(...paths) => {
			expect(decideJobs({ event: "push", paths })).toEqual({
				...noJob,
				ios: true,
			})
		},
	)

	it.each(PATH_MIXES)(
		"runs lint, vitest, website, rust and storybook on a v* tag, never rust-check or ios, on %p",
		(...paths) => {
			expect(decideJobs({ event: "tag", paths })).toEqual({
				...every,
				lint: true,
				"rust-check": false,
				ios: false,
			})
		},
	)

	it.each([
		["push", "ios=true"],
		["tag", "rust=true"],
	])("decides a %s without a BASE to diff against", (event, line) => {
		const detection = runChangeDetector(event)

		expect(detection.exitCode).toBe(0)
		expect(detection.stdout.toString().split("\n")).toContain(line)
	})

	it.each(["pull_request", "merge_group"])(
		"refuses a %s without a BASE to diff against",
		(event) => {
			const detection = runChangeDetector(event)

			expect(detection.exitCode).toBe(1)
			expect(detection.stderr.toString()).toContain("BASE is required")
		},
	)

	it("refuses an event it does not know", () => {
		const detection = runChangeDetector("schedule")

		expect(detection.exitCode).toBe(1)
		expect(detection.stderr.toString()).toContain(
			'unsupported event "schedule"',
		)
	})
})

describe("the paths each job watches", () => {
	it("runs every job when a shared root path changed", () => {
		expect(touching("bun.lock")).toEqual(every)
		expect(touching("patches/a.patch")).toEqual(every)
		expect(touching(".github/workflows/release.yml")).toEqual(every)
	})

	it("runs vitest, website and storybook on a story under packages/ui, since tsc -b checks it", () => {
		const uiJobs = { ...none, vitest: true, website: true, storybook: true }

		expect(touching("packages/ui/src/components/button.stories.tsx")).toEqual(
			uiJobs,
		)
		expect(touching("packages/ui/.storybook/preview.tsx")).toEqual(uiJobs)
	})

	it.each(["package.json", "bun.lock", "turbo.json", "tsconfig.base.json"])(
		"runs website when the root build input %s changed",
		(path) => {
			expect(touching(path).website).toBe(true)
		},
	)

	it("runs vitest, website and storybook on a component under packages/ui", () => {
		expect(touching("packages/ui/src/components/button.tsx")).toEqual({
			...none,
			vitest: true,
			website: true,
			storybook: true,
		})
	})

	it("runs vitest and storybook on the scripts and baselines the gate reads", () => {
		const both = { ...none, vitest: true, storybook: true }

		expect(touching("scripts/baseline.ts")).toEqual(both)
		expect(touching("baselines/tests.txt")).toEqual(both)
	})

	it("runs only rust on a Rust file under src-tauri", () => {
		expect(touching("apps/app/src-tauri/src/lib.rs")).toEqual({
			...none,
			rust: true,
		})
	})

	it("runs rust and vitest on a sidecar file", () => {
		expect(touching("apps/app/sidecar/src/index.ts")).toEqual({
			...none,
			rust: true,
			vitest: true,
		})
	})

	it("runs rust on a Cargo manifest anywhere", () => {
		expect(touching("crates/relay/Cargo.toml").rust).toBe(true)
	})

	it("runs every job but ios on paths only under packages/shared", () => {
		expect(touching(...SHARED_ONLY_PATHS)).toEqual({
			...every,
			ios: false,
		})
	})

	it("runs storybook on paths only under packages/shared, since packages/ui depends on it", () => {
		expect(touching(...SHARED_ONLY_PATHS).storybook).toBe(true)
	})

	it("runs website on paths only under packages/shared, since apps/website resolves it through packages/ui", () => {
		expect(touching(...SHARED_ONLY_PATHS).website).toBe(true)
	})

	it("runs rust on packages/shared/permission-modes.json alone, since src-tauri embeds it", () => {
		expect(touching("packages/shared/permission-modes.json").rust).toBe(true)
	})

	it("runs every job when the change detector scripts/ci-changes.ts changed", () => {
		expect(touching("scripts/ci-changes.ts")).toEqual(every)
	})

	it("runs only vitest and storybook on scripts/ci-changes.test.ts alone, as any other script", () => {
		expect(touching("scripts/ci-changes.test.ts")).toEqual({
			...none,
			vitest: true,
			storybook: true,
		})
	})

	it("leaves rust unselected on packages/ui", () => {
		expect(touching("packages/ui/src/components/button.tsx").rust).toBe(false)
	})

	it("runs only vitest on a sibling like packages/sharedfoo", () => {
		expect(touching("packages/sharedfoo/x.ts")).toEqual({
			...none,
			vitest: true,
		})
	})

	it("runs only vitest on an app file outside src-tauri", () => {
		expect(touching("apps/app/src/main.tsx")).toEqual({
			...none,
			vitest: true,
		})
	})

	it("runs only website on a file under apps/website", () => {
		expect(touching("apps/website/src/main.tsx")).toEqual({
			...none,
			website: true,
		})
	})

	it("runs only ios on the paths the ios filter watches", () => {
		expect(touching("apps/ios/Kiroshi/App.swift")).toEqual({
			...none,
			ios: true,
		})
		expect(touching(".xcode-version")).toEqual({ ...none, ios: true })
		expect(touching(".swift-format")).toEqual({ ...none, ios: true })
	})

	it("runs nothing filtered on a path no job watches", () => {
		expect(touching("docs/relay/notes.md")).toEqual(none)
		expect(touching()).toEqual(none)
	})

	it("treats a nested package.json as local, not shared", () => {
		expect(touching("apps/website/package.json")).toEqual({
			...none,
			website: true,
		})
	})
})
