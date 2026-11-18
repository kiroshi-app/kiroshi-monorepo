import { afterAll, describe, expect, it } from "bun:test"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, normalize, relative } from "node:path"
import { fileURLToPath } from "node:url"

import {
	decideJobs,
	PATHS_RUST_READS_OUTSIDE_SRC_TAURI,
	touchedJobs,
} from "./ci-changes"

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
const CI_EVENTS = ["pull_request", "merge_group", "push"] as const

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

const PARENT_PATH_LITERAL = /"([^"\n]*\.\.\/[^"\n]*)"/g

const JOIN_CHAIN = /(?:\.join\(\s*"[^"\n]*"\s*\)\s*)+/g

const JOINED_SEGMENT = /"([^"\n]*)"/g

const pathsNamedIn = (rust: string) =>
	[
		...new Set([
			...[...rust.matchAll(PARENT_PATH_LITERAL)].map(
				([, literal]) => literal ?? "",
			),
			...[...rust.matchAll(JOIN_CHAIN)].map(([chain]) =>
				[...chain.matchAll(JOINED_SEGMENT)]
					.map(([, segment]) => segment)
					.join("/"),
			),
		]),
	].filter((named) => basename(normalize(named)) !== "..")

const isRepositoryPathOutsideSrcTauri = (path: string) =>
	path.startsWith(REPO) &&
	relative(SRC_TAURI, path).startsWith("..") &&
	existsSync(path)

const pathsReachedOutsideSrcTauriBy = (source: string) => {
	const file = join(SRC_TAURI, source)
	return pathsNamedIn(readFileSync(file, "utf8"))
		.flatMap((named) => [join(dirname(file), named), join(SRC_TAURI, named)])
		.filter(isRepositoryPathOutsideSrcTauri)
		.map((reached) => ({
			source: relative(REPO, file),
			reached: relative(REPO, reached),
		}))
}

const pathsRustReachesOutsideSrcTauri = () =>
	git(SRC_TAURI, "ls-files", "*.rs")
		.split("\n")
		.flatMap(pathsReachedOutsideSrcTauriBy)

const firstTrackedFileAt = (path: string) =>
	git(REPO, "ls-files", "--", path).split("\n")[0] ?? ""

const runChangeDetectorOn = (branch: string, cwd: string, ...args: string[]) =>
	Bun.spawnSync(
		[
			process.execPath,
			new URL("./ci-changes.ts", import.meta.url).pathname,
			...args,
		],
		{ cwd, env: { ...process.env, GITHUB_REF_NAME: branch } },
	)

const runChangeDetectorIn = (cwd: string, ...args: string[]) =>
	runChangeDetectorOn("main", cwd, ...args)

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

const commitFiles = (repo: string, files: Record<string, string>) => {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, path)), { recursive: true })
		writeFileSync(join(repo, path), content)
		git(repo, "add", path)
	}
	git(repo, "commit", "--quiet", "--message", Object.keys(files).join(" "))
	return git(repo, "rev-parse", "HEAD")
}

const lockfileAt = (appVersion: string, react: string) => ({
	"bun.lock": `{
  "workspaces": {
    "apps/app": {
      "name": "app",
      "version": "${appVersion}",
    },
  },
  "packages": {
    "react": ["${react}", "", {}, "sha512-0"],
  },
}
`,
})

const repositoryOnMain = (name: string) => {
	const repository = join(scratch, name)
	mkdirSync(repository)
	git(repository, "init", "--quiet", "--initial-branch=main")
	git(repository, "config", "user.email", "ci@example.com")
	git(repository, "config", "user.name", "CI")
	return repository
}

const shallowCheckoutPastGreen = (name: string) => {
	const origin = repositoryOnMain(`${name}-origin`)
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
		"selects none of vitest, website, rust, storybook and ios on a merge_group, on %p",
		(...paths) => {
			expect(decideJobs({ event: "merge_group", paths })).toEqual(none)
		},
	)

	it("selects no job on a merge_group touching a shared path", () => {
		expect(decideJobs({ event: "merge_group", paths: ["bun.lock"] })).toEqual(
			none,
		)
	})

	it.each(CI_EVENTS)("selects rust-check on no %s", (event) => {
		expect(decideJobs({ event, paths: ["bun.lock"] })).not.toHaveProperty(
			"rust-check",
		)
	})

	it("decides a merge_group without a BASE to diff against", () => {
		const detection = runChangeDetector("merge_group")

		expect(detection.exitCode).toBe(0)
		expect(outputOf(detection)).toEqual(none)
	})

	it("refuses a pull_request without a BASE to diff against", () => {
		const detection = runChangeDetector("pull_request")

		expect(detection.exitCode).toBe(1)
		expect(detection.stderr.toString()).toContain("BASE is required")
	})

	it("names the release branch pushed when no CI push run on it concluded success", () => {
		const detection = runChangeDetectorOn("release/0.27", REPO, "push")

		expect(outputOf(detection)).toEqual(every)
		expect(detection.stderr.toString()).toContain(
			"no CI push run on release/0.27 concluded success: every job runs",
		)
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

	it.each([
		["bumps a workspace version only", "0.27.1", false],
		["changes a package too", "0.27.1", true],
	])(
		"runs on a push whose bun.lock %s the jobs the rest of the release commit changes, every job otherwise",
		(_, nextVersion, isPackageChanged) => {
			const origin = repositoryOnMain(`lockfile-${isPackageChanged}-origin`)
			const green = commitFiles(origin, lockfileAt("0.27.0", "react@19.0.0"))
			commitFiles(origin, {
				...lockfileAt(
					nextVersion,
					isPackageChanged ? "react@19.1.0" : "react@19.0.0",
				),
				"apps/app/package.json": `{ "version": "${nextVersion}" }`,
				"apps/app/src-tauri/Cargo.toml": `version = "${nextVersion}"`,
			})
			const checkout = join(scratch, `lockfile-${isPackageChanged}-checkout`)
			git(
				scratch,
				"clone",
				"--quiet",
				"--depth=1",
				`file://${origin}`,
				checkout,
			)

			const detection = runChangeDetectorIn(checkout, "push", green)

			expect(detection.exitCode).toBe(0)
			expect(outputOf(detection)).toEqual(
				isPackageChanged
					? every
					: { ...none, vitest: true, rust: true, ios: true },
			)
		},
	)

	it("keeps bun.lock among the paths of a push when its diff adds and removes no line", () => {
		const origin = repositoryOnMain("lockfile-mode-origin")
		const green = commitFiles(origin, lockfileAt("0.27.0", "react@19.0.0"))
		git(origin, "update-index", "--chmod=+x", "bun.lock")
		git(origin, "commit", "--quiet", "--message", "chmod bun.lock")
		const checkout = join(scratch, "lockfile-mode-checkout")
		git(scratch, "clone", "--quiet", "--depth=1", `file://${origin}`, checkout)

		const detection = runChangeDetectorIn(checkout, "push", green)

		expect(detection.exitCode).toBe(0)
		expect(outputOf(detection)).toEqual(every)
	})

	it("diffs a pull_request into a feature branch against that branch, leaving out what the branch holds over main", () => {
		const repository = repositoryOnMain("feature-base")
		const main = commitFile(repository, "README.md")
		git(repository, "switch", "--quiet", "--create", "feature/feed")
		const featureBranch = commitFile(
			repository,
			"apps/app/src-tauri/src/lib.rs",
		)
		git(repository, "switch", "--quiet", "--create", "sub-branch")
		commitFile(repository, "packages/ui/src/button.tsx")

		const againstItsBase = runChangeDetectorIn(
			repository,
			"pull_request",
			featureBranch,
		)
		const againstMain = runChangeDetectorIn(repository, "pull_request", main)

		expect(outputOf(againstItsBase)).toEqual({ ...none, vitest: true })
		expect(outputOf(againstMain)).toEqual({ ...none, vitest: true, rust: true })
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

	it("runs rust alone on the pinned toolchain", () => {
		expect(touching("rust-toolchain.toml")).toEqual({ ...none, rust: true })
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

	it("lists every repository path a Rust source of src-tauri reaches outside src-tauri", () => {
		const reached = pathsRustReachesOutsideSrcTauri()
		const unlisted = reached.filter(
			(read) => !PATHS_RUST_READS_OUTSIDE_SRC_TAURI.includes(read.reached),
		)

		expect(reached).toContainEqual({
			source: "apps/app/src-tauri/src/bundles/system.rs",
			reached: "packages/ui/src/components/markdown",
		})
		expect(
			unlisted.map(({ source, reached }) => `${reached}, read by ${source}`),
		).toEqual([])
	})

	it.each(PATHS_RUST_READS_OUTSIDE_SRC_TAURI)(
		"runs rust on a pull_request changing only a file at %s, since a Rust source reads it",
		(path) => {
			const changed = firstTrackedFileAt(path)

			expect(`${changed}/`).toStartWith(`${path}/`)
			expect(decideJobs({ event: "pull_request", paths: [changed] }).rust).toBe(
				true,
			)
		},
	)

	it("runs rust and vitest on a pull_request changing only a file under packages/ui/src/components/markdown, since a bundles::system test reads the renderer", () => {
		expect(
			decideJobs({
				event: "pull_request",
				paths: ["packages/ui/src/components/markdown/answer-block.tsx"],
			}),
		).toEqual({ ...none, rust: true, vitest: true })
	})

	it("leaves rust unselected on a pull_request changing only paths no Rust source reads", () => {
		expect(
			decideJobs({
				event: "pull_request",
				paths: [
					"packages/ui/src/components/button.tsx",
					"packages/ui/src/components/markdown-toolbar/toolbar.tsx",
					"apps/app/vite.config.ts",
					"apps/app/contracts.md",
					"apps/website/src/page.tsx",
					"apps/ios/Kiroshi/App.swift",
					"docs/relay/README.md",
					"scripts/baseline.ts",
				],
			}).rust,
		).toBe(false)
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

	it("runs only vitest on an app file outside src-tauri and the app source", () => {
		expect(touching("apps/app/vite.config.ts")).toEqual({
			...none,
			vitest: true,
		})
	})

	it("runs only vitest on a pull_request changing only an app source file no Rust source reads", () => {
		expect(
			decideJobs({
				event: "pull_request",
				paths: ["apps/app/src/components/thread-screen.tsx"],
			}),
		).toEqual({ ...none, vitest: true })
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
