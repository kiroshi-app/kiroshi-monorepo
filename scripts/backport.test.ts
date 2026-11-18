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

const EARLIER_TITLE = "fix(app): list the drafts after the cut (OPE-2)"

const BATCH_BRANCH = "backport/0.27/pr-41-42"

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
"pr view")
	file="$GH_STUB/pull-request-$3.json"
	if [ ! -f "$file" ]; then file="$GH_STUB/pull-request.json"; fi
	response=$(cat "$file")
	;;
"pr create")
	if [ -f "$GH_STUB/create-refused" ]; then
		echo "GraphQL: was submitted too quickly" >&2
		exit 1
	fi
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
	earlierState?: string
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
	const earlierSquash = commitFile(
		"drafts.ts",
		"list = true\n",
		`${EARLIER_TITLE} (#41)`,
	)
	const squash = commitFile("draft.ts", "keep = true\n", `${TITLE} (#42)`)
	git(seed, "push", "--quiet", origin, "main", RELEASE)
	return { earlierSquash, squash }
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

const stubbedEnvironment = () => ({
	...withoutGitContext(),
	...COMMITTER,
	GH_STUB: stub,
	PATH: `${join(stub, "bin")}:${process.env.PATH}`,
})

const spawnBackport = async (scriptArguments: string[]) => {
	const running = Bun.spawn({
		cmd: [BACKPORT, ...scriptArguments],
		cwd: repository,
		env: stubbedEnvironment(),
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
	earlierState = "MERGED",
}: Scenario) => {
	const { earlierSquash, squash } = seedOrigin(isConflicting)
	git(tmpdir(), "clone", "--quiet", origin, repository)
	writeFileSync(
		join(stub, "pull-request.json"),
		JSON.stringify({
			state,
			baseRefName: base,
			mergeCommit: state === "MERGED" ? { oid: squash } : null,
			mergedAt: state === "MERGED" ? "2026-11-18T17:32:40Z" : null,
			title: TITLE,
		}),
	)
	writeFileSync(
		join(stub, "pull-request-41.json"),
		JSON.stringify({
			state: earlierState,
			baseRefName: "main",
			mergeCommit: earlierState === "MERGED" ? { oid: earlierSquash } : null,
			mergedAt: earlierState === "MERGED" ? "2026-11-18T17:20:10Z" : null,
			title: EARLIER_TITLE,
		}),
	)
	return { earlierSquash, squash, ...(await spawnBackport(scriptArguments)) }
}

const expectNothingChanged = () => {
	expect(originBranches()).toEqual(["main", RELEASE])
	expect(git(repository, "branch", "--list", "backport/*")).toBe("")
	expect(git(repository, "worktree", "list").split("\n")).toHaveLength(1)
	expect(pullRequestsCreated()).toEqual([])
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-backport-stub-"))
	seed = mkdtempSync(join(tmpdir(), "kiroshi-backport-seed-"))
	origin = mkdtempSync(join(tmpdir(), "kiroshi-backport-origin-"))
	repository = join(mkdtempSync(join(tmpdir(), "kiroshi-backport-")), "clone")
	git(origin, "init", "--quiet", "--bare", "--initial-branch", "main")
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

	it("cherry-picks several PRs in the order they merged on main onto one branch and opens one PR naming each of them", async () => {
		const result = await runBackport({ arguments: ["42", "41", RELEASE] })
		const references = "#41, #42"

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(`${PULL_REQUEST_URL}\n`)
		expect(originBranches()).toEqual([BATCH_BRANCH, "main", RELEASE])
		expect(
			git(
				origin,
				"log",
				"--reverse",
				"--format=%s",
				`${RELEASE}..${BATCH_BRANCH}`,
			),
		).toBe(`${EARLIER_TITLE} (#41)\n${TITLE} (#42)`)
		expect(
			git(origin, "log", "--format=%B", `${RELEASE}..${BATCH_BRANCH}`),
		).toContain(`(cherry picked from commit ${result.earlierSquash})`)
		expect(pullRequestsCreated()).toEqual([
			[
				"pr",
				"create",
				"--repo",
				REPOSITORY,
				"--base",
				RELEASE,
				"--head",
				BATCH_BRANCH,
				"--title",
				`chore(release): backport ${references} to ${RELEASE}`,
				"--body",
				`Backport of ${references} to ${RELEASE}, cherry-picked in the order they merged on main:\n- #41 ${EARLIER_TITLE}\n- #42 ${TITLE}`,
			],
		])
		expect(git(repository, "worktree", "list").split("\n")).toHaveLength(1)
	})

	it("refuses several PRs when one of them is not merged, naming it and changing nothing", async () => {
		const result = await runBackport({
			arguments: ["41", "42", RELEASE],
			earlierState: "OPEN",
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"backport.sh: PR #41 is not merged, it is OPEN\n",
		)
		expectNothingChanged()
	})

	it("pushes nothing for several PRs when one conflicts, naming it with its conflicting files", async () => {
		const result = await runBackport({
			arguments: ["41", "42", RELEASE],
			isConflicting: true,
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toEndWith(
			`backport.sh: PR #42 conflicts with ${RELEASE}, nothing pushed, conflicting files:\ndraft.ts\n`,
		)
		expectNothingChanged()
	})

	it("refuses a second backport of the same PRs to the same release branch", async () => {
		await runBackport({ arguments: ["41", "42", RELEASE] })
		const second = await spawnBackport(["42", "41", RELEASE])

		expect(second.exitCode).toBe(1)
		expect(second.stderr).toBe(
			`backport.sh: branch ${BATCH_BRANCH} already exists, PRs #41, #42 may already be backported to ${RELEASE}\n`,
		)
		expect(pullRequestsCreated()).toHaveLength(1)
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

	it("keeps the pushed branch and prints the gh pr create command to rerun when the PR cannot be opened", async () => {
		writeFileSync(join(stub, "create-refused"), "")

		const result = await runBackport({})
		const prefix = `backport.sh: pushed ${BACKPORT_BRANCH} to origin but gh pr create failed, open its PR with: `
		const lastLine = result.stderr.trimEnd().split("\n").at(-1) ?? ""

		expect(result.exitCode).toBe(1)
		expect(lastLine).toStartWith(prefix)
		expect(originBranches()).toEqual([BACKPORT_BRANCH, "main", RELEASE])
		rmSync(join(stub, "create-refused"))
		const rerun = Bun.spawnSync({
			cmd: ["bash", "-c", lastLine.slice(prefix.length)],
			env: stubbedEnvironment(),
		})
		expect(rerun.stdout.toString()).toBe(`${PULL_REQUEST_URL}\n`)
		const [refused, reran] = pullRequestsCreated()
		expect(reran).toEqual(refused)
		expect(reran).toContain(TITLE)
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
		[["41", "#42", RELEASE]],
		[["42", "42", RELEASE]],
		[["41", "42", "41", RELEASE]],
		[["42", "main"]],
	])("exits 64 with the usage on the arguments %p", async (scriptArguments) => {
		const result = await runBackport({ arguments: scriptArguments })

		expect(result.exitCode).toBe(64)
		expect(result.stderr).toBe(
			"backport.sh: usage: scripts/backport.sh <merged PR number of main>... <release/X.Y>\n",
		)
		expectNothingChanged()
		expect(ghCalls()).toEqual([])
	})
})
