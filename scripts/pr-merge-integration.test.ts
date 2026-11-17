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

const PR_MERGE_INTEGRATION = fileURLToPath(
	new URL("./pr-merge-integration.sh", import.meta.url),
)

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const BRANCH = "feature/ope-1-fix"

const BASE = "feature/home"

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
fields=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then filter=$argument; fi
	if [ "$previous" = "--json" ]; then fields=$argument; fi
	previous=$argument
done
case "$1 $2" in
"pr merge")
	if [ -f "$GH_STUB/merge-refused" ]; then
		echo "GraphQL: head commit moved" >&2
		exit 1
	fi
	exit 0
	;;
"pr list") response=$(cat "$GH_STUB/pull-requests.json") ;;
"pr view")
	if [ "$fields" = "state" ]; then
		response=$(cat "$GH_STUB/state.json")
	else
		response=$(cat "$GH_STUB/pull-request.json")
	fi
	;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let repository: string
let origin: string
let headSha: string

type CheckRun = {
	__typename: "CheckRun"
	name: string
	status: string
	conclusion: string
}

type StatusContext = {
	__typename: "StatusContext"
	context: string
	state: string
}

type Check = CheckRun | StatusContext

type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN"

type History =
	| "ordinary"
	| "merge of its base"
	| "catch-up"
	| "catch-up behind its base"

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequestNumbers?: number[]
	base?: string
	mergeable?: Mergeable
	checks?: Check[]
	isMergeRefused?: boolean
	stateAfterMerge?: string
	history?: History
	isPushRefused?: boolean
}

const completed = (name: string, conclusion: string): CheckRun => ({
	__typename: "CheckRun",
	name,
	status: "COMPLETED",
	conclusion,
})

const pending = (name: string, status: string): CheckRun => ({
	__typename: "CheckRun",
	name,
	status,
	conclusion: "",
})

const PASSING_CHECKS = [
	completed("lint", "SUCCESS"),
	completed("rust", "SKIPPED"),
	completed("labeler", "NEUTRAL"),
	completed("verify", "SUCCESS"),
]

const NO_CHECK_SUCCEEDED =
	"pr-merge-integration.sh: PR #42 has no check that succeeded on its head commit, CI did not run: feature/home may predate the feature/** pull_request trigger of ci.yml\n"

const withoutJqFilter = (call: string[]) => {
	const filter = call.indexOf("--jq")
	return filter === -1 ? call : call.toSpliced(filter, 2)
}

const ghCalls = () => {
	const log = join(stub, "calls")
	if (!existsSync(log)) return []
	return readFileSync(log, "utf8")
		.split(CALL_SEPARATOR)
		.filter(Boolean)
		.map((line) =>
			withoutJqFilter(line.split(ARGUMENT_SEPARATOR).slice(0, -1)).join(" "),
		)
}

const LIST = `pr list --repo ${REPOSITORY} --head ${BRANCH} --state open --json number`
const READ_PULL_REQUEST = `pr view 42 --repo ${REPOSITORY} --json baseRefName,headRefOid,mergeable,statusCheckRollup`
const merge = () =>
	`pr merge 42 --repo ${REPOSITORY} --squash --match-head-commit ${headSha}`
const READ_STATE = `pr view 42 --repo ${REPOSITORY} --json state`

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

const seedOrigin = (history: History) => {
	const tree = git(origin, "mktree")
	const commit = (message: string, ...parents: string[]) =>
		git(
			origin,
			"commit-tree",
			tree,
			...parents.flatMap((parent) => ["-p", parent]),
			"-m",
			message,
		)
	const root = commit("root")
	const feature = commit("feature", root)
	const work = commit("work", feature)
	const movedMain = commit("main moved", root)
	const movedFeature = commit("feature moved", feature)
	const catchUp = commit("merge main", work, movedMain)
	const branches = {
		ordinary: { base: feature, head: work },
		"merge of its base": {
			base: movedFeature,
			head: commit("merge feature/home", work, movedFeature),
		},
		"catch-up": { base: feature, head: catchUp },
		"catch-up behind its base": { base: movedFeature, head: catchUp },
	}[history]
	git(origin, "update-ref", "refs/heads/main", movedMain)
	git(origin, "update-ref", `refs/heads/${BASE}`, branches.base)
	git(origin, "update-ref", `refs/heads/${BRANCH}`, branches.head)
	return branches
}

const originBaseHead = () => git(origin, "rev-parse", `refs/heads/${BASE}`)

const runPrMergeIntegration = async ({
	arguments: scriptArguments = [],
	branch = BRANCH,
	pullRequestNumbers = [42],
	base = BASE,
	mergeable = "MERGEABLE",
	checks = PASSING_CHECKS,
	isMergeRefused = false,
	stateAfterMerge = "MERGED",
	history = "ordinary",
	isPushRefused = false,
}: Scenario) => {
	const seeded = seedOrigin(history)
	headSha = seeded.head
	if (isPushRefused) {
		const preReceive = join(origin, "hooks", "pre-receive")
		writeFileSync(
			preReceive,
			`#!/bin/sh\necho "${BASE} is locked" >&2\nexit 1\n`,
		)
		chmodSync(preReceive, 0o755)
	}
	const initialised = Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", branch, repository],
		env: withoutGitContext(),
	})
	if (initialised.exitCode !== 0) {
		throw new Error(`git init failed: ${initialised.stderr.toString()}`)
	}
	git(repository, "remote", "add", "origin", origin)
	writeFileSync(
		join(stub, "pull-requests.json"),
		JSON.stringify(pullRequestNumbers.map((number) => ({ number }))),
	)
	writeFileSync(
		join(stub, "pull-request.json"),
		JSON.stringify({
			baseRefName: base,
			headRefOid: headSha,
			mergeable,
			statusCheckRollup: checks,
		}),
	)
	writeFileSync(
		join(stub, "state.json"),
		JSON.stringify({ state: stateAfterMerge }),
	)
	if (isMergeRefused) writeFileSync(join(stub, "merge-refused"), "")
	const running = Bun.spawn({
		cmd: [PR_MERGE_INTEGRATION, ...scriptArguments],
		cwd: repository,
		env: {
			...withoutGitContext(),
			GH_STUB: stub,
			PATH: `${join(stub, "bin")}:${process.env.PATH}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	})
	return {
		seededBase: seeded.base,
		exitCode: await running.exited,
		stdout: await new Response(running.stdout).text(),
		stderr: await new Response(running.stderr).text(),
	}
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-pr-merge-integration-stub-"))
	repository = mkdtempSync(
		join(tmpdir(), "kiroshi-pr-merge-integration-repository-"),
	)
	origin = mkdtempSync(join(tmpdir(), "kiroshi-pr-merge-integration-origin-"))
	git(origin, "init", "--quiet", "--bare")
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
	rmSync(origin, { recursive: true, force: true })
})

describe("scripts/pr-merge-integration.sh", () => {
	it("squash-merges the PR pinned to its head sha, reads the merged state back and prints it", async () => {
		const result = await runPrMergeIntegration({})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-merge-integration.sh: PR #42 merged into feature/home\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, merge(), READ_STATE])
	})

	it("refuses a PR that has no check run at all, pointing at a base older than the feature/** trigger, and merges nothing", async () => {
		const result = await runPrMergeIntegration({ checks: [] })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(NO_CHECK_SUCCEEDED)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
	})

	it("refuses a PR whose checks were all skipped, pointing at a base older than the feature/** trigger, and merges nothing", async () => {
		const result = await runPrMergeIntegration({
			checks: [completed("Proof", "SKIPPED"), completed("rust", "SKIPPED")],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(NO_CHECK_SUCCEEDED)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
	})

	it("refuses a PR whose verify was skipped though lint succeeded, naming the base, and merges nothing", async () => {
		const result = await runPrMergeIntegration({
			checks: [completed("lint", "SUCCESS"), completed("verify", "SKIPPED")],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"pr-merge-integration.sh: PR #42 did not pass the fast gate into feature/home: verify did not succeed on its head commit\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
	})

	it.each(["main", "release/1.0", "home"])(
		"refuses a PR based on %s naming the base and merges nothing",
		async (base) => {
			const result = await runPrMergeIntegration({ base })

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toBe(
				`pr-merge-integration.sh: PR #42 targets ${base}, not a feature/* integration branch, run scripts/pr-enqueue.sh instead\n`,
			)
			expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
		},
	)

	it("refuses naming every pending or failing check and merges nothing", async () => {
		const result = await runPrMergeIntegration({
			checks: [
				completed("lint", "SUCCESS"),
				pending("vitest", "IN_PROGRESS"),
				pending("rust", "QUEUED"),
				completed("storybook", "FAILURE"),
				completed("ios", "CANCELLED"),
				{ __typename: "StatusContext", context: "external", state: "PENDING" },
			],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"pr-merge-integration.sh: PR #42 has checks not passing: vitest (IN_PROGRESS), rust (QUEUED), storybook (FAILURE), ios (CANCELLED), external (PENDING)\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
	})

	it("refuses a conflicting PR and merges nothing", async () => {
		const result = await runPrMergeIntegration({ mergeable: "CONFLICTING" })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			"pr-merge-integration.sh: PR #42 conflicts with feature/home, rebase it first\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
	})

	it("fails naming the state when the read-back is not MERGED", async () => {
		const result = await runPrMergeIntegration({ stateAfterMerge: "OPEN" })

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe("")
		expect(result.stderr).toBe(
			"pr-merge-integration.sh: PR #42 is OPEN after gh pr merge --squash\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, merge(), READ_STATE])
	})

	it("fails with the refusal of gh and reads nothing back when gh refuses the merge", async () => {
		const result = await runPrMergeIntegration({ isMergeRefused: true })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("GraphQL: head commit moved\n")
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, merge()])
	})

	it("fails naming the branch and merges nothing when the branch has no open PR", async () => {
		const result = await runPrMergeIntegration({ pullRequestNumbers: [] })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			`pr-merge-integration.sh: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails naming the PRs and merges nothing when the branch has several open PRs", async () => {
		const result = await runPrMergeIntegration({ pullRequestNumbers: [42, 43] })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			`pr-merge-integration.sh: branch ${BRANCH} has several open PRs: 42 43\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fast-forwards the base to a catch-up of main, keeping both parents of the merge, reads the state back and squashes nothing", async () => {
		const result = await runPrMergeIntegration({ history: "catch-up" })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			`pr-merge-integration.sh: PR #42 is MERGED, ${BASE} fast-forwarded to ${headSha}\n`,
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, READ_STATE])
		const [baseHead, ...parents] = git(
			origin,
			"rev-list",
			"--parents",
			"-n",
			"1",
			BASE,
		).split(" ")
		expect(baseHead).toBe(headSha)
		expect(parents).toHaveLength(2)
	})

	it("refuses a catch-up whose base moved past it, printing the merge of the base to run, and pushes nothing", async () => {
		const result = await runPrMergeIntegration({
			history: "catch-up behind its base",
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toBe(
			`pr-merge-integration.sh: PR #42 carries a merge of main but ${BASE} moved past it: run git merge origin/${BASE} on ${BRANCH}, push it, wait for its checks, then run scripts/pr-merge-integration.sh again\n`,
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
		expect(originBaseHead()).toBe(result.seededBase)
	})

	it("fails with the refusal of git and the manual path when the fast-forward push is refused, and squashes nothing", async () => {
		const result = await runPrMergeIntegration({
			history: "catch-up",
			isPushRefused: true,
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain(`${BASE} is locked`)
		expect(result.stderr).toContain("[remote rejected]")
		expect(result.stderr).toEndWith(
			`pr-merge-integration.sh: PR #42 carries a merge of main and ${BASE} refused the fast-forward to ${headSha}: if ${BASE} moved, run git merge origin/${BASE} on ${BRANCH} and push it, otherwise have a maintainer run git push origin ${headSha}:refs/heads/${BASE}, never a squash, a rebase merge or the merge button\n`,
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST])
		expect(originBaseHead()).toBe(result.seededBase)
	})

	it("squash-merges a sub-PR that merged its base but not main, as before, and pushes nothing", async () => {
		const result = await runPrMergeIntegration({ history: "merge of its base" })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			`pr-merge-integration.sh: PR #42 merged into ${BASE}\n`,
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, merge(), READ_STATE])
		expect(originBaseHead()).toBe(result.seededBase)
	})

	it("refuses to run on main and calls gh not at all", async () => {
		const result = await runPrMergeIntegration({ branch: "main" })

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain("main")
		expect(ghCalls()).toEqual([])
	})

	it("refuses a PR number argument with a usage line and calls gh not at all", async () => {
		const result = await runPrMergeIntegration({ arguments: ["42"] })

		expect(result.exitCode).toBe(64)
		expect(result.stderr).toStartWith("pr-merge-integration.sh: usage:")
		expect(ghCalls()).toEqual([])
	})
})
