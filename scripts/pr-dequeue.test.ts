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
elif [[ "$*" == *mutation* ]]; then
	response='{"data":{"dequeuePullRequest":{"clientMutationId":null}}}'
else
	reads=$(($(cat "$GH_STUB/reads" 2>/dev/null || echo 0) + 1))
	echo "$reads" >"$GH_STUB/reads"
	state=$(sed -n "\${reads}p" "$GH_STUB/queue-states")
	response="{\\"data\\":{\\"node\\":{\\"isInMergeQueue\\":$state}}}"
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
	queueStates?: boolean[]
}

const QUEUED: PullRequest = { number: 42, id: NODE_ID }

const valueAfter = (call: string[], flag: string) =>
	call[call.indexOf(flag) + 1]

const describeCall = (call: string[]) => {
	if (call[0] === "pr") return `pr list --head ${valueAfter(call, "--head")}`
	const fields = call.filter((argument) => /^(query|id)=/.test(argument))
	const query = fields.find((field) => field.startsWith("query=")) ?? ""
	const [, kind, field] = /^query=(\w+)[^{]*\{\s*(\w+)/.exec(query) ?? []
	const id = fields.find((field) => field.startsWith("id="))
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
const READ_QUEUE_STATE = `api graphql query node id=${NODE_ID}`
const DEQUEUE = `api graphql mutation dequeuePullRequest id=${NODE_ID}`

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
	queueStates = [],
}: Scenario) => {
	Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", branch, repository],
		env: withoutGitContext(),
	})
	writeFileSync(join(stub, "pull-requests.json"), JSON.stringify(pullRequests))
	writeFileSync(join(stub, "queue-states"), `${queueStates.join("\n")}\n`)
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
	it("dequeues the queued PR of the branch, reads the queue state back and prints it", async () => {
		const result = await runPrDequeue({
			pullRequests: [QUEUED],
			queueStates: [true, false],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-dequeue.sh: PR #42 isInMergeQueue=false\n")
		expect(ghCalls()).toEqual([
			LIST,
			READ_QUEUE_STATE,
			DEQUEUE,
			READ_QUEUE_STATE,
		])
	})

	it("calls no mutation and exits 0 when the PR is not queued", async () => {
		const result = await runPrDequeue({
			pullRequests: [QUEUED],
			queueStates: [false],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-dequeue.sh: PR #42 is not queued\n")
		expect(ghCalls()).toEqual([LIST, READ_QUEUE_STATE])
	})

	it("fails naming the branch and calls no mutation when the branch has no open PR", async () => {
		const result = await runPrDequeue({ pullRequests: [] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-dequeue.sh: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails and calls no mutation when the branch has several open PRs", async () => {
		const result = await runPrDequeue({
			pullRequests: [QUEUED, { number: 43, id: "PR_kwDOother" }],
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
			pullRequests: [QUEUED],
			queueStates: [true, false],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toContain("main")
		expect(ghCalls()).toEqual([])
	})

	it("fails when the read-back still shows the PR in the merge queue", async () => {
		const result = await runPrDequeue({
			pullRequests: [QUEUED],
			queueStates: [true, true],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe("pr-dequeue.sh: PR #42 isInMergeQueue=true\n")
		expect(result.stderr).toBe(
			"pr-dequeue.sh: PR #42 is still in the merge queue\n",
		)
		expect(ghCalls()).toEqual([
			LIST,
			READ_QUEUE_STATE,
			DEQUEUE,
			READ_QUEUE_STATE,
		])
	})

	it("refuses a PR number argument and calls gh not at all", async () => {
		const result = await runPrDequeue({
			arguments: ["42"],
			pullRequests: [QUEUED],
			queueStates: [true, false],
		})

		expect(result.exitCode).toBe(64)
		expect(ghCalls()).toEqual([])
	})
})
