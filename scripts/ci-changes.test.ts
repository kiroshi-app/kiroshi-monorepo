import { describe, expect, it } from "bun:test"

import { decideJobs } from "./ci-changes"

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

const onPullRequest = (...paths: string[]) =>
	decideJobs({ event: "pull_request", paths })

describe("ci changes", () => {
	it("runs every job on a push, whatever the paths", () => {
		expect(decideJobs({ event: "push", paths: [] })).toEqual(every)
		expect(
			decideJobs({ event: "push", paths: ["apps/ios/Kiroshi/App.swift"] }),
		).toEqual(every)
	})

	it("runs every job when a shared root path changed", () => {
		expect(onPullRequest("bun.lock")).toEqual(every)
		expect(onPullRequest("patches/a.patch")).toEqual(every)
		expect(onPullRequest(".github/workflows/release.yml")).toEqual(every)
	})

	it("runs vitest, website and storybook on a story under packages/ui, since tsc -b checks it", () => {
		const uiJobs = { ...none, vitest: true, website: true, storybook: true }

		expect(
			onPullRequest("packages/ui/src/components/button.stories.tsx"),
		).toEqual(uiJobs)
		expect(onPullRequest("packages/ui/.storybook/preview.tsx")).toEqual(uiJobs)
	})

	it.each(["package.json", "bun.lock", "turbo.json", "tsconfig.base.json"])(
		"runs website when the root build input %s changed",
		(path) => {
			expect(onPullRequest(path).website).toBe(true)
		},
	)

	it("runs vitest, website and storybook on a component under packages/ui", () => {
		expect(onPullRequest("packages/ui/src/components/button.tsx")).toEqual({
			...none,
			vitest: true,
			website: true,
			storybook: true,
		})
	})

	it("runs vitest and storybook on the scripts and baselines the gate reads", () => {
		const both = { ...none, vitest: true, storybook: true }

		expect(onPullRequest("scripts/baseline.ts")).toEqual(both)
		expect(onPullRequest("baselines/tests.txt")).toEqual(both)
	})

	it("runs only rust on a Rust file under src-tauri", () => {
		expect(onPullRequest("apps/app/src-tauri/src/lib.rs")).toEqual({
			...none,
			rust: true,
		})
	})

	it("runs rust and vitest on a sidecar file", () => {
		expect(onPullRequest("apps/app/sidecar/src/index.ts")).toEqual({
			...none,
			rust: true,
			vitest: true,
		})
	})

	it("runs rust on a Cargo manifest anywhere", () => {
		expect(onPullRequest("crates/relay/Cargo.toml").rust).toBe(true)
	})

	it("runs rust and vitest, not website, storybook or ios, on paths only under packages/shared", () => {
		expect(
			onPullRequest(
				"packages/shared/permission-modes.json",
				"packages/shared/src/index.ts",
			),
		).toEqual({ ...none, rust: true, vitest: true })
	})

	it("runs rust on packages/shared/permission-modes.json alone, since src-tauri embeds it", () => {
		expect(onPullRequest("packages/shared/permission-modes.json").rust).toBe(
			true,
		)
	})

	it("runs every job when the change detector scripts/ci-changes.ts changed", () => {
		expect(onPullRequest("scripts/ci-changes.ts")).toEqual(every)
	})

	it("runs only vitest and storybook on scripts/ci-changes.test.ts alone, as any other script", () => {
		expect(onPullRequest("scripts/ci-changes.test.ts")).toEqual({
			...none,
			vitest: true,
			storybook: true,
		})
	})

	it("leaves rust unselected on packages/ui and on a sibling like packages/sharedfoo", () => {
		expect(onPullRequest("packages/ui/src/components/button.tsx").rust).toBe(
			false,
		)
		expect(onPullRequest("packages/sharedfoo/index.ts").rust).toBe(false)
	})

	it("runs only vitest on an app file outside src-tauri", () => {
		expect(onPullRequest("apps/app/src/main.tsx")).toEqual({
			...none,
			vitest: true,
		})
	})

	it("runs only website on a file under apps/website", () => {
		expect(onPullRequest("apps/website/src/main.tsx")).toEqual({
			...none,
			website: true,
		})
	})

	it("runs only ios on the paths the ios filter watches", () => {
		expect(onPullRequest("apps/ios/Kiroshi/App.swift")).toEqual({
			...none,
			ios: true,
		})
		expect(onPullRequest(".xcode-version")).toEqual({ ...none, ios: true })
		expect(onPullRequest(".swift-format")).toEqual({ ...none, ios: true })
	})

	it("runs nothing filtered on a path no job watches", () => {
		expect(onPullRequest("docs/relay/notes.md")).toEqual(none)
		expect(onPullRequest()).toEqual(none)
	})

	it("treats a nested package.json as local, not shared", () => {
		expect(onPullRequest("apps/website/package.json")).toEqual({
			...none,
			website: true,
		})
	})
})
