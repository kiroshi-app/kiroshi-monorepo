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

const PR_DEQUEUE = fileURLToPath(new URL("./pr-dequeue.sh", import.meta.url))

const BRANCH = "feature/ope-1-fix"

const NODE_ID = "PR_kwDOqueued"

const ARGUMENT_SEPARATOR = "\u001f"

const STUB_GH = `#!/bin/bash
set -euo pipefail
printf '%s\\037' "$@" >>"$GH_STUB/calls"
echo >>"$GH_STUB/calls"
filter=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then filter=$argument; fi
	previous=$argument
done
if [ "$1 $2" = "pr list" ]; then
	response=$(cat "$GH_STUB/pull-requests.json")
elif [ "$1 $2" = "pr merge" ]; then
	exit 0
elif [[ "$*" == *"query=mutation"* ]]; then
	exit 0
else
	reads=$(($(cat "$GH_STUB/reads" 2>/dev/null || echo 0) + 1))
	echo "$reads" >"$GH_STUB/reads"
	response="{\\"data\\":{\\"node\\":$(sed -n "\${reads}p" "$GH_STUB/states")}}"
fi
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let repository: string

type PullRequest = { number: number; id: string }

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequests?: PullRequest[]
	states?: PullRequestState[]
}

type PullRequestState = {
	isMergeQueueEnabled: boolean
	isInMergeQueue: boolean
	autoMergeRequest: { enabledAt: string } | null
}

const ARMED: PullRequest = { number: 42, id: NODE_ID }

const AUTO_MERGE_REQUEST = { enabledAt: "2026-10-26T00:00:00Z" }

const QUEUE_OFF_UNARMED: PullRequestState = {
	isMergeQueueEnabled: false,
	isInMergeQueue: false,
	autoMergeRequest: null,
}

const QUEUE_OFF_ARMED: PullRequestState = {
	...QUEUE_OFF_UNARMED,
	autoMergeRequest: AUTO_MERGE_REQUEST,
}

const QUEUE_ON_IDLE: PullRequestState = {
	isMergeQueueEnabled: true,
	isInMergeQueue: false,
	autoMergeRequest: null,
}

const QUEUE_ON_QUEUED: PullRequestState = {
	...QUEUE_ON_IDLE,
	isInMergeQueue: true,
}

const QUEUE_ON_ARMED: PullRequestState = {
	...QUEUE_ON_IDLE,
	autoMergeRequest: AUTO_MERGE_REQUEST,
}

const QUEUE_ON_QUEUED_AND_ARMED: PullRequestState = {
	...QUEUE_ON_QUEUED,
	autoMergeRequest: AUTO_MERGE_REQUEST,
}

const valueAfter = (call: string[], flag: string) =>
	call[call.indexOf(flag) + 1]

const describeCall = (call: string[]) => {
	if (call[1] === "list") return `pr list --head ${valueAfter(call, "--head")}`
	if (call[0] === "pr") return call.join(" ")
	const query = call.find((argument) => argument.startsWith("query=")) ?? ""
	const [, kind, field] = /^query=(\w+)[^{]*\{\s*(\w+)/.exec(query) ?? []
	const id = call.find((argument) => argument.startsWith("id="))
	return `${call.slice(0, 2).join(" ")} ${kind} ${field} ${id}`
}

const ghCalls = () => {
	const log = join(stub, "calls")
	if (!existsSync(log)) return []
	return readFileSync(log, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => describeCall(line.split(ARGUMENT_SEPARATOR).slice(0, -1)))
}

const LIST = `pr list --head ${BRANCH}`
const READ_STATE = `api graphql query node id=${NODE_ID}`
const DEQUEUE = `api graphql mutation dequeuePullRequest id=${NODE_ID}`
const DISARM = "pr merge --disable-auto 42 --repo kiroshi-app/kiroshi-monorepo"

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const runPrDequeue = async ({
	arguments: prDequeueArguments = [],
	branch = BRANCH,
	pullRequests = [],
	states = [],
}: Scenario) => {
	const initialised = Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", branch, repository],
		env: withoutGitContext(),
	})
	if (initialised.exitCode !== 0) {
		throw new Error(`git init failed: ${initialised.stderr.toString()}`)
	}
	writeFileSync(join(stub, "pull-requests.json"), JSON.stringify(pullRequests))
	writeFileSync(
		join(stub, "states"),
		`${states.map((state) => JSON.stringify(state)).join("\n")}\n`,
	)
	const running = Bun.spawn({
		cmd: [PR_DEQUEUE, ...prDequeueArguments],
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
	stub = mkdtempSync(join(tmpdir(), "kiroshi-pr-dequeue-stub-"))
	repository = mkdtempSync(join(tmpdir(), "kiroshi-pr-dequeue-repository-"))
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
})

describe("scripts/pr-dequeue.sh", () => {
	it("disarms auto-merge on the PR of the branch, reads it back and prints it", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_OFF_ARMED, QUEUE_OFF_UNARMED],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-dequeue.sh: PR #42 autoMergeArmed=false\n")
		expect(ghCalls()).toEqual([LIST, READ_STATE, DISARM, READ_STATE])
	})

	it("disarms nothing and exits 0 when the PR has no auto-merge armed", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_OFF_UNARMED],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 has no auto-merge armed\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE])
	})

	it("takes a queued PR out of the merge queue without closing it, reads it back and prints it", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_QUEUED, QUEUE_ON_IDLE],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 inQueue=false autoMergeArmed=false\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, DEQUEUE, READ_STATE])
	})

	it("disarms auto-merge too when the PR is still armed once out of the merge queue", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_QUEUED_AND_ARMED, QUEUE_ON_ARMED, QUEUE_ON_IDLE],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 inQueue=false autoMergeArmed=false\n",
		)
		expect(ghCalls()).toEqual([
			LIST,
			READ_STATE,
			DEQUEUE,
			READ_STATE,
			DISARM,
			READ_STATE,
		])
	})

	it("disarms auto-merge and leaves the merge queue alone when the queue of main is on and the PR is armed but not queued", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_ARMED, QUEUE_ON_IDLE],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 inQueue=false autoMergeArmed=false\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, DISARM, READ_STATE])
	})

	it("acts on nothing and exits 0 when the queue of main is on and the PR is neither queued nor armed", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_IDLE],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 is not in the merge queue and has no auto-merge armed\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE])
	})

	it("fails naming the PR when the read-back still shows it in the merge queue", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_QUEUED, QUEUE_ON_QUEUED],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 inQueue=true autoMergeArmed=false\n",
		)
		expect(result.stderr).toBe(
			"pr-dequeue.sh: PR #42 is still in the merge queue or armed for auto-merge\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, DEQUEUE, READ_STATE])
	})

	it("fails naming the PR when the queue of main is on and the read-back still shows auto-merge armed", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_ON_ARMED, QUEUE_ON_ARMED],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe(
			"pr-dequeue.sh: PR #42 inQueue=false autoMergeArmed=true\n",
		)
		expect(result.stderr).toBe(
			"pr-dequeue.sh: PR #42 is still in the merge queue or armed for auto-merge\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, DISARM, READ_STATE])
	})

	it("fails naming the branch and disarms nothing when the branch has no open PR", async () => {
		const result = await runPrDequeue({ pullRequests: [] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-dequeue.sh: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails and disarms nothing when the branch has several open PRs", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED, { number: 43, id: "PR_kwDOother" }],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-dequeue.sh: branch ${BRANCH} has several open PRs: 42 43\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("refuses to run on main and calls gh not at all", async () => {
		const result = await runPrDequeue({
			branch: "main",
			pullRequests: [ARMED],
			states: [QUEUE_OFF_ARMED, QUEUE_OFF_UNARMED],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toContain("main")
		expect(ghCalls()).toEqual([])
	})

	it("fails naming the PR when the read-back still shows auto-merge armed", async () => {
		const result = await runPrDequeue({
			pullRequests: [ARMED],
			states: [QUEUE_OFF_ARMED, QUEUE_OFF_ARMED],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe("pr-dequeue.sh: PR #42 autoMergeArmed=true\n")
		expect(result.stderr).toBe(
			"pr-dequeue.sh: PR #42 still has auto-merge armed after gh pr merge --disable-auto\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, DISARM, READ_STATE])
	})

	it("refuses a PR number argument and calls gh not at all", async () => {
		const result = await runPrDequeue({
			arguments: ["42"],
			pullRequests: [ARMED],
			states: [QUEUE_OFF_ARMED, QUEUE_OFF_UNARMED],
		})

		expect(result.exitCode).toBe(64)
		expect(ghCalls()).toEqual([])
	})
})
