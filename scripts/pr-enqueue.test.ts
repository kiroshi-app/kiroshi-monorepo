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

import { copyUnwiredPrEnqueue, copyWiredPrEnqueue } from "./pr-enqueue-wiring"

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const BRANCH = "feature/ope-1-fix"

const NODE_ID = "PR_kwDO42"

const HEAD = "3f9c2a1e0b7d4c6a8e5f1b2d3c4a5e6f7a8b9c0d"

const ARGUMENT_SEPARATOR = "\u001f"

const STUB_GH = `#!/bin/bash
set -euo pipefail
printf '%s\\037' "$@" >>"$GH_STUB/calls"
echo >>"$GH_STUB/calls"
call="$1 $2"
filter=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then filter=$argument; fi
	if [ "$call" = "run list" ] && { [ "$argument" = "--commit" ] || [ "$argument" = "--event" ]; }; then call="run list $argument"; fi
	previous=$argument
done
case "$call" in
"pr merge")
	if [ -f "$GH_STUB/merge-refused" ]; then
		echo "GraphQL: auto-merge refused" >&2
		exit 1
	fi
	exit 0
	;;
"pr list") response=$(cat "$GH_STUB/pull-requests.json") ;;
"pr view") response='{"headRefOid":"${HEAD}"}' ;;
"run list --commit") response='[{"createdAt":"2026-10-27T09:00:00Z"}]' ;;
"run list --event") response='[]' ;;
*) response="{\\"data\\":{\\"node\\":$(cat "$GH_STUB/armed-state.json")}}" ;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let repository: string
let prEnqueue: string

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequestNumbers?: number[]
	isMergeRefused?: boolean
	armedState?: ArmedState
}

type ArmedState = {
	autoMergeRequest: { enabledAt: string } | null
	isInMergeQueue: boolean
}

const ARMED: ArmedState = {
	autoMergeRequest: { enabledAt: "2026-10-26T00:00:00Z" },
	isInMergeQueue: false,
}

const QUEUED: ArmedState = { autoMergeRequest: null, isInMergeQueue: true }

const NEITHER: ArmedState = { autoMergeRequest: null, isInMergeQueue: false }

const READ_FIELDS = /\b(autoMergeRequest|isInMergeQueue)\b/g

const describeCall = (call: string[]) => {
	if (call[0] === "api") {
		const query = call.find((argument) => argument.startsWith("query=")) ?? ""
		const id = call.find((argument) => argument.startsWith("id="))
		return `api graphql ${query.match(READ_FIELDS)?.join(" ")} ${id}`
	}
	const output = call.indexOf("--json")
	return (output === -1 ? call : call.slice(0, output)).join(" ")
}

const ghCalls = () => {
	const log = join(stub, "calls")
	if (!existsSync(log)) return []
	return readFileSync(log, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => describeCall(line.split(ARGUMENT_SEPARATOR).slice(0, -1)))
}

const LIST = `pr list --repo ${REPOSITORY} --head ${BRANCH} --state open`
const ARM = `pr merge --auto 42 --repo ${REPOSITORY}`
const READ_ARMED_STATE = `api graphql autoMergeRequest isInMergeQueue id=${NODE_ID}`
const VIEW = `pr view 42 --repo ${REPOSITORY}`
const HEAD_RUNS = `run list --repo ${REPOSITORY} --commit ${HEAD} --limit 100`
const FAILED_QUEUE_RUNS = `run list --repo ${REPOSITORY} --event merge_group --status failure --limit 100`

type Variant = {
	copyPrEnqueue: (directory: string) => string
	requeueCheckCalls: string[]
	resolvingScript: string
}

const VARIANTS: [string, Variant][] = [
	[
		"as on main",
		{
			copyPrEnqueue: copyUnwiredPrEnqueue,
			requeueCheckCalls: [],
			resolvingScript: "pr-enqueue.sh",
		},
	],
	[
		"wired to the requeue check",
		{
			copyPrEnqueue: copyWiredPrEnqueue,
			requeueCheckCalls: [LIST, VIEW, HEAD_RUNS, FAILED_QUEUE_RUNS],
			resolvingScript: "pr-requeue-check.sh",
		},
	],
]

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const runPrEnqueue = async ({
	arguments: prEnqueueArguments = [],
	branch = BRANCH,
	pullRequestNumbers = [],
	isMergeRefused = false,
	armedState = ARMED,
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
		JSON.stringify(
			pullRequestNumbers.map((number) => ({ number, id: `PR_kwDO${number}` })),
		),
	)
	writeFileSync(join(stub, "armed-state.json"), JSON.stringify(armedState))
	if (isMergeRefused) writeFileSync(join(stub, "merge-refused"), "")
	const running = Bun.spawn({
		cmd: [prEnqueue, ...prEnqueueArguments],
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
	stub = mkdtempSync(join(tmpdir(), "kiroshi-pr-enqueue-stub-"))
	repository = mkdtempSync(join(tmpdir(), "kiroshi-pr-enqueue-repository-"))
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
})

describe.each(VARIANTS)("scripts/pr-enqueue.sh %s", (_, variant) => {
	const { requeueCheckCalls, resolvingScript } = variant

	beforeEach(() => {
		prEnqueue = variant.copyPrEnqueue(stub)
	})

	it("arms auto-merge on the PR of the branch with no merge method, reads it back and prints it", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [42] })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=true\n")
		expect(ghCalls()).toEqual([
			...requeueCheckCalls,
			LIST,
			ARM,
			READ_ARMED_STATE,
		])
	})

	it("counts a PR already in the merge queue with no auto-merge request as armed", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			armedState: QUEUED,
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=true\n")
		expect(ghCalls()).toEqual([
			...requeueCheckCalls,
			LIST,
			ARM,
			READ_ARMED_STATE,
		])
	})

	it("fails naming the PR when the read-back shows neither auto-merge armed nor the PR queued", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			armedState: NEITHER,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=false\n")
		expect(result.stderr).toBe(
			"pr-enqueue.sh: PR #42 has no auto-merge armed and is not in the merge queue after gh pr merge --auto\n",
		)
		expect(ghCalls()).toEqual([
			...requeueCheckCalls,
			LIST,
			ARM,
			READ_ARMED_STATE,
		])
	})

	it("fails with the refusal of gh and reads nothing back when gh refuses to arm auto-merge", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			isMergeRefused: true,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("GraphQL: auto-merge refused\n")
		expect(ghCalls()).toEqual([...requeueCheckCalls, LIST, ARM])
	})

	it("fails naming the branch and arms nothing when the branch has no open PR", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`${resolvingScript}: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails naming the PRs and arms nothing when the branch has several open PRs", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [42, 43] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`${resolvingScript}: branch ${BRANCH} has several open PRs: 42 43\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("refuses to run on main and calls gh not at all", async () => {
		const result = await runPrEnqueue({
			branch: "main",
			pullRequestNumbers: [42],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toContain("main")
		expect(ghCalls()).toEqual([])
	})

	it("refuses a PR number argument with a usage line and calls gh not at all", async () => {
		const result = await runPrEnqueue({
			arguments: ["42"],
			pullRequestNumbers: [42],
		})

		expect(result.exitCode).toBe(64)
		expect(result.stderr).toStartWith("pr-enqueue.sh: usage:")
		expect(ghCalls()).toEqual([])
	})
})
