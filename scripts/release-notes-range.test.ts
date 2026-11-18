import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { resolveNotesRange } from "./release-notes-range"

const SCRIPT = fileURLToPath(
	new URL("./release-notes-range.ts", import.meta.url),
)

const COMMITTER = {
	GIT_AUTHOR_NAME: "Kiroshi",
	GIT_AUTHOR_EMAIL: "ci@kiroshi.test",
	GIT_COMMITTER_NAME: "Kiroshi",
	GIT_COMMITTER_EMAIL: "ci@kiroshi.test",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
}

let repository: string

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const git = (...gitArguments: string[]) => {
	const run = Bun.spawnSync({
		cmd: ["git", "-C", repository, ...gitArguments],
		env: { ...withoutGitContext(), ...COMMITTER },
	})
	if (run.exitCode !== 0)
		throw new Error(
			`git ${gitArguments.join(" ")} failed: ${run.stderr.toString()}`,
		)
}

const commit = (message: string) => {
	writeFileSync(join(repository, "version"), `${message}\n`)
	git("add", "version")
	git("commit", "--quiet", "-m", message)
}

const release = (tag: string) => {
	commit(`chore(app): release ${tag}`)
	git("tag", "-a", tag, "-m", `Release ${tag}`)
}

const cutReleaseBranch = (branch: string, tags: string[]) => {
	git("checkout", "--quiet", "-b", branch, "main")
	for (const tag of tags) release(tag)
	git("checkout", "--quiet", "main")
}

const resolveIn = (tag: string) =>
	Bun.spawnSync({
		cmd: ["bun", SCRIPT, tag],
		cwd: repository,
		env: withoutGitContext(),
		stdout: "pipe",
		stderr: "pipe",
	})

beforeAll(() => {
	repository = mkdtempSync(join(tmpdir(), "release-notes-range-"))
	git("init", "--quiet", "--initial-branch", "main")
	release("v0.0.1")
	commit("feat(app): first feature")
	cutReleaseBranch("release/0.1", ["v0.1.0", "v0.1.1"])
	commit("feat(app): second feature")
	cutReleaseBranch("release/0.2", ["v0.2.0-beta.1", "v0.2.0-beta.2", "v0.2.0"])
	commit("feat(app): third feature")
	release("v0.3.0")
	git("tag", "v0.3.0-rc.1")
})

afterAll(() => {
	rmSync(repository, { recursive: true, force: true })
})

describe("release notes range on a throwaway repository", () => {
	it("starts a stable cut from a release branch at the previous stable of another branch", () => {
		const result = resolveIn("v0.2.0")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toBe(
			"prerelease=false\nrange=v0.1.1..v0.2.0\n",
		)
	})

	it("starts a beta cut from a release branch at the previous beta", () => {
		const result = resolveIn("v0.2.0-beta.2")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toBe(
			"prerelease=true\nrange=v0.2.0-beta.1..v0.2.0-beta.2\n",
		)
	})

	it("starts the first beta of a release branch at the previous stable", () => {
		const result = resolveIn("v0.2.0-beta.1")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toBe(
			"prerelease=true\nrange=v0.1.1..v0.2.0-beta.1\n",
		)
	})

	it("starts a release cut from main at the previous stable of a release branch", () => {
		const result = resolveIn("v0.3.0")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toBe(
			"prerelease=false\nrange=v0.2.0..v0.3.0\n",
		)
	})

	it("fails naming the tag when no earlier tag matches", () => {
		const result = resolveIn("v0.0.1")
		expect(result.exitCode).toBe(1)
		expect(result.stdout.toString()).toBe("")
		expect(result.stderr.toString()).toContain(
			"::error::No earlier stable tag than v0.0.1",
		)
	})

	it("fails naming a tag that is neither stable nor beta", () => {
		const result = resolveIn("v0.3.0-rc.1")
		expect(result.exitCode).toBe(1)
		expect(result.stderr.toString()).toContain(
			"::error::Tag v0.3.0-rc.1 is neither a stable vX.Y.Z nor a beta vX.Y.Z-beta.N tag",
		)
	})
})

describe("resolveNotesRange", () => {
	it("orders versions numerically, not as text", () => {
		expect(resolveNotesRange("v0.10.0", ["v0.9.0", "v0.2.0"]).range).toBe(
			"v0.9.0..v0.10.0",
		)
	})

	it("ranks a stable above its own betas", () => {
		expect(
			resolveNotesRange("v0.27.0", [
				"v0.26.1",
				"v0.27.0-beta.6",
				"v0.27.0",
				"v0.28.0",
			]).range,
		).toBe("v0.26.1..v0.27.0")
		expect(
			resolveNotesRange("v0.28.0-beta.1", ["v0.27.0-beta.6", "v0.27.0"]).range,
		).toBe("v0.27.0..v0.28.0-beta.1")
	})

	it("picks the previous beta over an older stable for a beta", () => {
		expect(
			resolveNotesRange("v0.27.0-beta.6", [
				"v0.26.1",
				"v0.27.0-beta.5",
				"v0.27.0-beta.6",
			]).range,
		).toBe("v0.27.0-beta.5..v0.27.0-beta.6")
	})
})
