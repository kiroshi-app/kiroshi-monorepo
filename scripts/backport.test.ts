import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const BACKPORT = fileURLToPath(new URL("./backport.sh", import.meta.url))

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const RELEASE = "release/0.27"

const BACKPORT_BRANCH = "backport/0.27/pr-42"

const TITLE = "fix(app): keep the draft on reload (OPE-1)"

const PULL_REQUEST_URL =
	"https://github.com/kiroshi-app/kiroshi-monorepo/pull/43"

const COMMITTER = {
	GIT_AUTHOR_NAME: "Kiroshi",
	GIT_AUTHOR_EMAIL: "ci@kiroshi.test",
	GIT_COMMITTER_NAME: "Kiroshi",
	GIT_COMMITTER_EMAIL: "ci@kiroshi.test",
}

const ARGUMENT_SEPARATOR = "\u001f"

const CALL_SEPARATOR = "\u001e"

const STUB_GH = `#!/bin/bash
set -euo pipefail
printf '%s\\037' "$@" >>"$GH_STUB/calls"
printf '\\036' >>"$GH_STUB/calls"
filter=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then filter=$argument; fi
	previous=$argument
done
case "$1 $2" in
"pr view") response=$(cat "$GH_STUB/pull-request.json") ;;
"pr create")
	echo "${PULL_REQUEST_URL}"
	exit 0
	;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let seed: string
let origin: string
let repository: string

type Scenario = {
	arguments?: string[]
	state?: string
	base?: string
	isConflicting?: boolean
}

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const git = (directory: string, ...gitArguments: string[]) => {
	const run = Bun.spawnSync({
		cmd: ["git", "-C", directory, ...gitArguments],
		env: { ...withoutGitContext(), ...COMMITTER },
	})
	if (run.exitCode !== 0) {
		throw new Error(
			`git ${gitArguments.join(" ")} failed: ${run.stderr.toString()}`,
		)
	}
	return run.stdout.toString().trim()
}

const commitFile = (path: string, content: string, message: string) => {
	writeFileSync(join(seed, path), content)
	git(seed, "add", path)
	git(seed, "commit", "--quiet", "-m", message)
	return git(seed, "rev-parse", "HEAD")
}

const seedOrigin = (isConflicting: boolean) => {
	git(seed, "init", "--quiet", "--initial-branch", "main")
	commitFile("draft.ts", "keep = false\n", "root")
	git(seed, "checkout", "--quiet", "-b", RELEASE)
	commitFile(
		isConflicting ? "draft.ts" : "release.ts",
		"keep = undefined\n",
		"release only",
	)
	git(seed, "checkout", "--quiet", "main")
	commitFile("feature.ts", "after the cut\n", "feat: after the cut (#41)")
	const squash = commitFile("draft.ts", "keep = true\n", `${TITLE} (#42)`)
	git(seed, "push", "--quiet", origin, "main", RELEASE)
	return squash
}

const ghCalls = () => {
	const log = join(stub, "calls")
	if (!existsSync(log)) return []
	return readFileSync(log, "utf8")
		.split(CALL_SEPARATOR)
		.filter(Boolean)
		.map((call) => call.split(ARGUMENT_SEPARATOR).slice(0, -1))
}

const pullRequestsCreated = () =>
	ghCalls().filter(
		([command, action]) => `${command} ${action}` === "pr create",
	)

const originBranches = () =>
	git(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads")
		.split("\n")
		.sort()

const spawnBackport = async (scriptArguments: string[]) => {
	const running = Bun.spawn({
		cmd: [BACKPORT, ...scriptArguments],
		cwd: repository,
		env: {
			...withoutGitContext(),
			...COMMITTER,
			GH_STUB: stub,
			PATH: `${join(stub, "bin")}:${process.env.PATH}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	})
	return {
		exitCode: await running.exited,
		stdout: await new Response(running.stdout).text(),
		stderr: await new Response(running.stderr).text(),
	}
}

const runBackport = async ({
	arguments: scriptArguments = ["42", RELEASE],
	state = "MERGED",
	base = "main",
	isConflicting = false,
}: Scenario) => {
	const squash = seedOrigin(isConflicting)
	git(tmpdir(), "clone", "--quiet", origin, repository)
	writeFileSync(
		join(stub, "pull-request.json"),
		JSON.stringify({
			state,
			baseRefName: base,
			mergeCommit: state === "MERGED" ? { oid: squash } : null,
			title: TITLE,
		}),
	)
	return { squash, ...(await spawnBackport(scriptArguments)) }
}

const expectNothingChanged = () => {
	expect(originBranches()).toEqual(["main", RELEASE])
	expect(git(repository, "branch", "--list", BACKPORT_BRANCH)).toBe("")
	expect(git(repository, "worktree", "list").split("\n")).toHaveLength(1)
	expect(pullRequestsCreated()).toEqual([])
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-backport-stub-"))
	seed = mkdtempSync(join(tmpdir(), "kiroshi-backport-seed-"))
	origin = mkdtempSync(join(tmpdir(), "kiroshi-backport-origin-"))
	repository = join(mkdtempSync(join(tmpdir(), "kiroshi-backport-")), "clone")
	git(origin, "init", "--quiet", "--bare")
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	for (const directory of [stub, seed, origin, join(repository, "..")])
		rmSync(directory, { recursive: true, force: true })
})

describe("scripts/backport.sh", () => {
	it("pushes the squash commit alone on a branch of the release branch and opens a PR into it under the original title", async () => {
		const result = await runBackport({})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(`${PULL_REQUEST_URL}\n`)
		expect(originBranches()).toEqual([BACKPORT_BRANCH, "main", RELEASE])
		expect(git(origin, "rev-parse", `${BACKPORT_BRANCH}^`)).toBe(
			git(origin, "rev-parse", RELEASE),
		)
		expect(git(origin, "diff", "--name-only", RELEASE, BACKPORT_BRANCH)).toBe(
			"draft.ts",
		)
		expect(git(origin, "show", `${BACKPORT_BRANCH}:draft.ts`)).toBe(
			"keep = true",
		)
		expect(git(origin, "log", "-1", "--format=%B", BACKPORT_BRANCH)).toContain(
			`(cherry picked from commit ${result.squash})`,
		)
		expect(pullRequestsCreated()).toEqual([
			[
				"pr",
				"create",
				"--repo",
				REPOSITORY,
				"--base",
				RELEASE,
				"--head",
				BACKPORT_BRANCH,
				"--title",
				TITLE,
				"--body",
				`Backport of #42 to ${RELEASE}.`,
			],
		])
		expect(git(repository, "worktree", "list").split("\n")).toHaveLength(1)
		expect(git(repository, "symbolic-ref", "--short", "HEAD")).toBe("main")
	})

	it.each([
		["OPEN", "PR #42 is not merged, it is OPEN"],
		["CLOSED", "PR #42 is not merged, it is CLOSED"],
	])("refuses a PR %s and changes nothing", async (state, cause) => {
		const result = await runBackport({ state })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(`backport.sh: ${cause}\n`)
		expectNothingChanged()
	})

	it("refuses a PR merged into another branch than main and changes nothing", async () => {
		const result = await runBackport({ base: "feature/home" })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"backport.sh: PR #42 was merged into feature/home, not main\n",
		)
		expectNothingChanged()
	})

	it("refuses a release branch missing on origin, naming it", async () => {
		const result = await runBackport({ arguments: ["42", "release/0.99"] })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"backport.sh: release branch release/0.99 does not exist on origin\n",
		)
		expectNothingChanged()
	})

	it("aborts a conflicting cherry-pick, deletes its branch and prints the conflicting files", async () => {
		const result = await runBackport({ isConflicting: true })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toEndWith(
			`backport.sh: PR #42 conflicts with ${RELEASE}, nothing pushed, conflicting files:\ndraft.ts\n`,
		)
		expectNothingChanged()
	})

	it("refuses a second backport of the same PR to the same release branch", async () => {
		await runBackport({})
		const second = await spawnBackport(["42", RELEASE])

		expect(second.exitCode).toBe(1)
		expect(second.stderr).toBe(
			`backport.sh: branch ${BACKPORT_BRANCH} already exists, PR #42 may already be backported to ${RELEASE}\n`,
		)
		expect(pullRequestsCreated()).toHaveLength(1)
	})

	it.each([
		[[]],
		[["42"]],
		[["42", RELEASE, "extra"]],
		[["#42", RELEASE]],
		[["42", "main"]],
	])("exits 64 with the usage on the arguments %p", async (scriptArguments) => {
		const result = await runBackport({ arguments: scriptArguments })

		expect(result.exitCode).toBe(64)
		expect(result.stderr).toBe(
			"backport.sh: usage: scripts/backport.sh <merged PR number of main> <release/X.Y>\n",
		)
		expectNothingChanged()
		expect(ghCalls()).toEqual([])
	})
})
