import { afterAll, describe, expect, it } from "bun:test"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

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
const CI_EVENTS = ["pull_request", "push", "tag"] as const

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

const REPO = fileURLToPath(new URL("..", import.meta.url))

const SRC_TAURI = join(REPO, "apps/app/src-tauri")

const EMBEDDED_PATH = /include_(?:str|bytes)!\(\s*"([^"]+)"\s*\)/g

const embeddedPathsOf = (source: string) => {
	const file = join(SRC_TAURI, source)
	return [...readFileSync(file, "utf8").matchAll(EMBEDDED_PATH)].map(
		([, embedded]) => relative(REPO, join(dirname(file), embedded ?? "")),
	)
}

const filesSrcTauriEmbeds = () =>
	[...new Bun.Glob("{src,tests}/**/*.rs").scanSync({ cwd: SRC_TAURI })].flatMap(
		embeddedPathsOf,
	)

const runChangeDetectorIn = (cwd: string, ...args: string[]) =>
	Bun.spawnSync(
		[
			process.execPath,
			new URL("./ci-changes.ts", import.meta.url).pathname,
			...args,
		],
		{ cwd },
	)

const runChangeDetector = (...args: string[]) =>
	runChangeDetectorIn(REPO, ...args)

const outputOf = (detection: ReturnType<typeof runChangeDetector>) =>
	Object.fromEntries(
		detection.stdout
			.toString()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [job, runs] = line.split("=")
				return [job, runs === "true"]
			}),
	)

const scratch = mkdtempSync(join(tmpdir(), "kiroshi-ci-changes-test-"))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const git = (cwd: string, ...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args], { cwd })
	if (!run.success) throw new Error(`git ${args.join(" ")}: ${run.stderr}`)
	return run.stdout.toString().trim()
}

const commitFile = (repo: string, path: string) => {
	mkdirSync(dirname(join(repo, path)), { recursive: true })
	writeFileSync(join(repo, path), path)
	git(repo, "add", path)
	git(repo, "commit", "--quiet", "--message", path)
	return git(repo, "rev-parse", "HEAD")
}

const shallowCheckoutPastGreen = (name: string) => {
	const origin = join(scratch, `${name}-origin`)
	mkdirSync(origin)
	git(origin, "init", "--quiet", "--initial-branch=main")
	git(origin, "config", "user.email", "ci@example.com")
	git(origin, "config", "user.name", "CI")
	const green = commitFile(origin, "packages/ui/src/button.tsx")
	commitFile(origin, "apps/website/src/page.tsx")
	commitFile(origin, "apps/app/src-tauri/src/lib.rs")
	const checkout = join(scratch, `${name}-checkout`)
	git(scratch, "clone", "--quiet", "--depth=1", `file://${origin}`, checkout)
	return { checkout, green }
}

const ABSENT_SHA = "0123456789abcdef0123456789abcdef01234567"

describe("ci jobs per event", () => {
	it.each(PATH_MIXES)(
		"selects only vitest and rust on a pull_request, on the paths they watch, on %p",
		(...paths) => {
			expect(decideJobs({ event: "pull_request", paths })).toEqual({
				...none,
				vitest: touchedJobs(paths).vitest,
				rust: touchedJobs(paths).rust,
			})
		},
	)

	it("skips storybook, website and ios on a pull_request touching every path", () => {
		const jobs = decideJobs({ event: "pull_request", paths: ["bun.lock"] })

		expect(jobs).toEqual({ ...none, vitest: true, rust: true })
	})

	it.each(PATH_MIXES)(
		"selects rust, vitest, website and storybook on the paths they watch on a push to main, and ios always, on %p",
		(...paths) => {
			expect(decideJobs({ event: "push", paths })).toEqual({
				...touchedJobs(paths),
				ios: true,
			})
		},
	)

	it("selects every job on a push to main touching a shared path", () => {
		expect(decideJobs({ event: "push", paths: ["bun.lock"] })).toEqual(every)
	})

	it.each(PATH_MIXES)(
		"selects vitest, website, rust and storybook on a v* tag, never ios, on %p",
		(...paths) => {
			expect(decideJobs({ event: "tag", paths })).toEqual({
				...every,
				ios: false,
			})
		},
	)

	it.each(CI_EVENTS)("selects rust-check on no %s", (event) => {
		expect(decideJobs({ event, paths: ["bun.lock"] })).not.toHaveProperty(
			"rust-check",
		)
	})

	it("decides a tag without a BASE to diff against", () => {
		const detection = runChangeDetector("tag")

		expect(detection.exitCode).toBe(0)
		expect(detection.stdout.toString().split("\n")).toContain("rust=true")
	})

	it("refuses a pull_request without a BASE to diff against", () => {
		const detection = runChangeDetector("pull_request")

		expect(detection.exitCode).toBe(1)
		expect(detection.stderr.toString()).toContain("BASE is required")
	})

	it("selects every job on a push to main when no CI push run on main concluded success", () => {
		const detection = runChangeDetector("push")

		expect(detection.exitCode).toBe(0)
		expect(outputOf(detection)).toEqual(every)
		expect(detection.stderr.toString()).toContain(
			"no CI push run on main concluded success: every job runs",
		)
	})

	it("selects every job on a push to main when the last green sha is absent from origin", () => {
		const { checkout } = shallowCheckoutPastGreen("absent")

		const detection = runChangeDetectorIn(checkout, "push", ABSENT_SHA)

		expect(detection.exitCode).toBe(0)
		expect(outputOf(detection)).toEqual(every)
		expect(detection.stderr.toString()).toContain(
			`fetching the last green sha ${ABSENT_SHA} failed`,
		)
	})

	it("diffs a push to main against the last green sha, covering every commit pushed since", () => {
		const { checkout, green } = shallowCheckoutPastGreen("green")

		const detection = runChangeDetectorIn(checkout, "push", green)

		expect(detection.exitCode).toBe(0)
		expect(outputOf(detection)).toEqual({
			...none,
			website: true,
			rust: true,
			ios: true,
		})
	})

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

	it("runs only rust on .claude/settings.json, since src-tauri embeds it", () => {
		expect(touching(".claude/settings.json")).toEqual({ ...none, rust: true })
	})

	it("runs rust and vitest on apps/app/src/lib/host/index.ts, since a src-tauri test embeds it", () => {
		expect(touching("apps/app/src/lib/host/index.ts")).toEqual({
			...none,
			rust: true,
			vitest: true,
		})
	})

	it("runs rust on every file src-tauri embeds with include_str! or include_bytes!", () => {
		const embedded = filesSrcTauriEmbeds()

		expect(embedded).toContain(".claude/settings.json")
		expect(embedded.filter((path) => !touching(path).rust)).toEqual([])
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
