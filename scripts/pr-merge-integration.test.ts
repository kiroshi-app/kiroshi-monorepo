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

const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567"

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

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequestNumbers?: number[]
	base?: string
	mergeable?: Mergeable
	checks?: Check[]
	isMergeRefused?: boolean
	stateAfterMerge?: string
}

const completed = (name: string, conclusion: string): CheckRun => ({
	__typename: "CheckRun",
	name,
	status: "COMPLETED",
	conclusion,
})

const PASSING_CHECKS = [
	completed("lint", "SUCCESS"),
	completed("rust", "SKIPPED"),
	completed("labeler", "NEUTRAL"),
]

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
const MERGE = `pr merge 42 --repo ${REPOSITORY} --squash --match-head-commit ${HEAD_SHA}`
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

const runPrMergeIntegration = async ({
	arguments: scriptArguments = [],
	branch = BRANCH,
	pullRequestNumbers = [42],
	base = "feature/home",
	mergeable = "MERGEABLE",
	checks = PASSING_CHECKS,
	isMergeRefused = false,
	stateAfterMerge = "MERGED",
}: Scenario) => {
	const initialised = Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", branch, repository],
		env: withoutGitContext(),
	})
	if (initialised.exitCode !== 0) {
		throw new Error(`git init failed: ${initialised.stderr.toString()}`)
	}
	writeFileSync(
		join(stub, "pull-requests.json"),
		JSON.stringify(pullRequestNumbers.map((number) => ({ number }))),
	)
	writeFileSync(
		join(stub, "pull-request.json"),
		JSON.stringify({
			baseRefName: base,
			headRefOid: HEAD_SHA,
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
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
})

describe("scripts/pr-merge-integration.sh", () => {
	it("squash-merges the PR pinned to its head sha, reads the merged state back and prints it", async () => {
		const result = await runPrMergeIntegration({})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-merge-integration.sh: PR #42 merged into feature/home\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, MERGE, READ_STATE])
	})

	it("merges a PR that has no check run at all", async () => {
		const result = await runPrMergeIntegration({ checks: [] })

		expect(result.exitCode).toBe(0)
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, MERGE, READ_STATE])
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
				{
					__typename: "CheckRun",
					name: "vitest",
					status: "IN_PROGRESS",
					conclusion: "",
				},
				{
					__typename: "CheckRun",
					name: "rust",
					status: "QUEUED",
					conclusion: "",
				},
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
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, MERGE, READ_STATE])
	})

	it("fails with the refusal of gh and reads nothing back when gh refuses the merge", async () => {
		const result = await runPrMergeIntegration({ isMergeRefused: true })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("GraphQL: head commit moved\n")
		expect(ghCalls()).toEqual([LIST, READ_PULL_REQUEST, MERGE])
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
