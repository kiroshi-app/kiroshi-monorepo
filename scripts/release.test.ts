import { afterEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { $ } from "bun"

import {
	computeNext,
	describeMainBump,
	nextMainVersion,
	planMainBump,
	releaseBranchOf,
} from "./release"

const SCRIPT = new URL("./release.ts", import.meta.url).pathname

const REPO = new URL("..", import.meta.url).pathname
const TAURI_CONF = "apps/app/src-tauri/tauri.conf.json"
const GIT_SETTINGS = [
	"-c",
	"user.name=Release Test",
	"-c",
	"user.email=release-test@example.invalid",
	"-c",
	"commit.gpgsign=false",
	"-c",
	"core.hooksPath=/dev/null",
]

const temporaryRoots: string[] = []

afterEach(() => {
	for (const root of temporaryRoots.splice(0))
		rmSync(root, { recursive: true, force: true })
})

const spawn = (command: string[], cwd = REPO) =>
	Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" })

const git = (cwd: string, ...args: string[]) => {
	const result = spawn(["git", ...GIT_SETTINGS, ...args], cwd)
	if (result.exitCode !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)
	return result.stdout.toString()
}

const createClone = (mainVersion?: string) => {
	const root = mkdtempSync(join(tmpdir(), "release-test-"))
	temporaryRoots.push(root)
	const origin = join(root, "origin")
	const clone = join(root, "clone")
	mkdirSync(origin)
	mkdirSync(clone)
	git(origin, "init", "--quiet", "-b", "main")
	if (mainVersion) {
		mkdirSync(join(origin, dirname(TAURI_CONF)), { recursive: true })
		writeFileSync(
			join(origin, TAURI_CONF),
			JSON.stringify({ version: mainVersion }),
		)
		git(origin, "add", ".")
		git(origin, "commit", "--quiet", "-m", "main")
	}
	git(clone, "init", "--quiet", "-b", "release/0.1")
	git(clone, "remote", "add", "origin", origin)
	return clone
}

const runRelease = (...args: string[]) => spawn(["bun", SCRIPT, ...args])

const runReleaseIn = (clone: string, ...args: string[]) =>
	spawn(["bun", SCRIPT, ...args], clone)

describe("release", () => {
	it("accepts an explicit beta version", () => {
		expect(computeNext("0.24.1", "0.25.0-beta.1")).toBe("0.25.0-beta.1")
	})

	it("accepts an explicit version from a beta current", () => {
		expect(computeNext("0.25.0-beta.1", "0.25.0-beta.2")).toBe("0.25.0-beta.2")
		expect(computeNext("0.25.0-beta.2", "0.25.0")).toBe("0.25.0")
	})

	it("still bumps a stable current", () => {
		expect(computeNext("0.24.1", "patch")).toBe("0.24.2")
		expect(computeNext("0.24.1", "minor")).toBe("0.25.0")
		expect(computeNext("0.24.1", "major")).toBe("1.0.0")
	})

	it.each([
		["0.27.0", "release/0.27"],
		["0.27.2", "release/0.27"],
		["0.28.0-beta.3", "release/0.28"],
		["10.2.11", "release/10.2"],
	])("releases %s from %s only", (version, branch) => {
		expect(releaseBranchOf(version)).toBe(branch)
	})

	it("refuses to bump a beta current and asks for an explicit version", () => {
		for (const bump of ["patch", "minor", "major"])
			expect(() => computeNext("0.25.0-beta.1", bump)).toThrow(
				/explicit version/,
			)
	})

	it("refuses a pre-release suffix other than beta", () => {
		expect(() => computeNext("0.24.1", "0.25.0-rc.1")).toThrow(
			/Invalid argument/,
		)
	})

	it("prints the beta tag on a dry run", () => {
		const result = runRelease("0.0.0-beta.1", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain(
			"-> 0.0.0-beta.1 (v0.0.0-beta.1)",
		)
	})

	it("refuses the dropped --notes option", () => {
		const result = runRelease("patch", "--notes", "notes.md", "--dry-run")
		expect(result.exitCode).toBe(1)
		expect(result.stderr.toString()).toContain("Usage: bun run release")
	})

	it("moves main to the next minor beta.0 after a stable X.Y.0", () => {
		expect(nextMainVersion("0.27.0")).toBe("0.28.0-beta.0")
		expect(nextMainVersion("1.9.0")).toBe("1.10.0-beta.0")
	})

	it("moves main nowhere after a beta or a patch", () => {
		expect(nextMainVersion("0.27.0-beta.3")).toBeUndefined()
		expect(nextMainVersion("0.27.1")).toBeUndefined()
	})

	it("opens the main bump when origin/main reads a lower version", () => {
		expect(planMainBump("0.28.0-beta.0", "0.27.0-beta.3")).toEqual({
			kind: "open",
			version: "0.28.0-beta.0",
			branch: "chore/bump-main-0.28.0-beta.0",
			title: "chore(app): move main to 0.28.0-beta.0",
		})
	})

	it("skips the main bump when origin/main reads it or above", () => {
		for (const mainVersion of ["0.28.0-beta.0", "0.28.0-beta.10", "0.29.0"]) {
			const bump = planMainBump("0.28.0-beta.0", mainVersion)
			expect(bump.kind).toBe("skip")
			expect(describeMainBump(bump)).toBe(
				`Main bump skipped: origin/main already reads ${mainVersion}, at or above 0.28.0-beta.0.`,
			)
		}
	})

	it("prints the main bump of a stable on a dry run from a fetched origin/main", () => {
		const clone = createClone("0.1.0-beta.0")
		const result = runReleaseIn(clone, "99.0.0", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain(
			'Main bump: chore/bump-main-99.1.0-beta.0 moves main to 99.1.0-beta.0, pull request "chore(app): move main to 99.1.0-beta.0".',
		)
		expect(result.stdout.toString()).toContain(
			"Dry run: nothing written, committed or pushed.",
		)
	})

	it("prints the skipped main bump on a dry run when main is already above", () => {
		const clone = createClone("99.0.0")
		const result = runReleaseIn(clone, "0.1.0", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain(
			"Main bump skipped: origin/main already reads 99.0.0, at or above 0.2.0-beta.0.",
		)
	})

	it("prints the main bump as unknown on a dry run when origin/main is missing", () => {
		const clone = createClone()
		const result = runReleaseIn(clone, "99.0.0", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toMatch(
			/^Main bump unknown: git fetch origin main: .+$/m,
		)
		expect(result.stdout.toString()).toContain(
			"Dry run: nothing written, committed or pushed.",
		)
	})

	it("prints no main bump on a dry run of a beta or a patch", () => {
		for (const version of ["0.27.0-beta.6", "0.27.1"]) {
			const result = runRelease(version, "--dry-run")
			expect(result.exitCode).toBe(0)
			expect(result.stdout.toString()).not.toContain("Main bump")
		}
	})

	it("writes, commits and pushes nothing on a dry run", () => {
		const clone = createClone("0.1.0-beta.0")
		const repoStatus = () => git(REPO, "status", "--porcelain")
		const before = repoStatus()
		runReleaseIn(clone, "99.0.0", "--dry-run")
		expect(repoStatus()).toBe(before)
		expect(git(clone, "for-each-ref", "refs/heads", "refs/tags")).toBe("")
	})

	it("prints the commands that finish the main bump by hand after a failed step", () => {
		const clone = createClone()
		const result = spawn(
			[
				"bun",
				"-e",
				`import { describeMainBumpFailure, openMainBump, planMainBump } from ${JSON.stringify(SCRIPT)}
const failure = await openMainBump(planMainBump("99.1.0-beta.0", "0.1.0"), "v99.0.0", "owner/repository")
console.log(describeMainBumpFailure(failure, "v99.0.0"))`,
			],
			clone,
		)
		const lines = result.stdout.toString().trim().split("\n")
		const worktree = lines.at(-1)?.match(/--force "?([^"]+)"?$/)?.[1] ?? ""
		if (worktree) temporaryRoots.push(worktree)
		const shellWorktree = $.escape(worktree)

		expect(result.exitCode).toBe(0)
		expect(worktree).toContain("kiroshi-main-bump-")
		expect(lines[0]).toStartWith(
			'Main bump failed at "create chore/bump-main-99.1.0-beta.0 from origin/main": ',
		)
		expect(lines[1]).toBe(
			"v99.0.0 stays pushed. Finish the bump by hand from the repository root:",
		)
		expect(lines.slice(2)).toEqual([
			`  git worktree add --quiet -b "chore/bump-main-99.1.0-beta.0" ${shellWorktree} origin/main`,
			`  bun -e "import { writeVersion } from \\"./scripts/release.ts\\"; await writeVersion(\\"${worktree}\\", \\"99.1.0-beta.0\\")"`,
			`  git -C ${shellWorktree} commit --quiet --all -m "chore(app): move main to 99.1.0-beta.0"`,
			`  git -C ${shellWorktree} push --quiet -u origin "chore/bump-main-99.1.0-beta.0"`,
			'  gh pr create --repo owner/repository --base main --head "chore/bump-main-99.1.0-beta.0" --title "chore(app): move main to 99.1.0-beta.0" --body "Moves main to 99.1.0-beta.0 after the stable v99.0.0, so a build of main is offered every later beta and stable."',
			`  git worktree remove --force ${shellWorktree}`,
		])
	})
})
