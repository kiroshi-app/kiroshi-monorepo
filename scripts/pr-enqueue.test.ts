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

const PR_ENQUEUE = fileURLToPath(new URL("./pr-enqueue.sh", import.meta.url))

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const BRANCH = "feature/ope-1-fix"

const NODE_ID = "PR_kwDO42"

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
case "$1 $2" in
"pr merge")
	if [ -f "$GH_STUB/merge-refused" ]; then
		echo "GraphQL: auto-merge refused" >&2
		exit 1
	fi
	exit 0
	;;
"pr list") response=$(cat "$GH_STUB/pull-requests.json") ;;
*)
	reads=$(($(cat "$GH_STUB/reads" 2>/dev/null || echo 0) + 1))
	echo "$reads" >"$GH_STUB/reads"
	response="{\\"data\\":{\\"node\\":$(sed -n "\${reads}p" "$GH_STUB/states")}}"
	;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let repository: string

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequestNumbers?: number[]
	isMergeRefused?: boolean
	states?: PullRequestState[]
}

type PullRequestState = {
	isMergeQueueEnabled: boolean
	isInMergeQueue: boolean
	autoMergeRequest: { enabledAt: string } | null
}

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

const READ_FIELDS = /\b(isMergeQueueEnabled|isInMergeQueue|autoMergeRequest)\b/g

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
const ARM = `pr merge --auto --squash 42 --repo ${REPOSITORY}`
const ENQUEUE = `pr merge --auto 42 --repo ${REPOSITORY}`
const READ_STATE = `api graphql isMergeQueueEnabled isInMergeQueue autoMergeRequest id=${NODE_ID}`

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
	states = [QUEUE_OFF_UNARMED, QUEUE_OFF_ARMED],
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
	writeFileSync(
		join(stub, "states"),
		`${states.map((state) => JSON.stringify(state)).join("\n")}\n`,
	)
	if (isMergeRefused) writeFileSync(join(stub, "merge-refused"), "")
	const running = Bun.spawn({
		cmd: [PR_ENQUEUE, ...prEnqueueArguments],
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

describe("scripts/pr-enqueue.sh", () => {
	it("arms auto-merge with the squash method on the PR of the branch, reads it back and prints it", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [42] })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=true\n")
		expect(ghCalls()).toEqual([LIST, READ_STATE, ARM, READ_STATE])
	})

	it("fails naming the PR when the read-back shows no auto-merge armed", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			states: [QUEUE_OFF_UNARMED, QUEUE_OFF_UNARMED],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=false\n")
		expect(result.stderr).toBe(
			"pr-enqueue.sh: PR #42 has no auto-merge armed after gh pr merge --auto --squash\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, ARM, READ_STATE])
	})

	it("adds the PR to the merge queue without a merge method and prints it queued when the queue of main is on and the gate is green", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			states: [QUEUE_ON_IDLE, QUEUE_ON_QUEUED],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-enqueue.sh: PR #42 inQueue=true autoMergeArmed=false\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, ENQUEUE, READ_STATE])
	})

	it("prints the PR armed and not queued when the queue of main is on and the PR waits on its gate", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			states: [QUEUE_ON_IDLE, QUEUE_ON_ARMED],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			"pr-enqueue.sh: PR #42 inQueue=false autoMergeArmed=true\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, ENQUEUE, READ_STATE])
	})

	it("fails naming the PR when the queue of main is on and the read-back shows it neither queued nor armed", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			states: [QUEUE_ON_IDLE, QUEUE_ON_IDLE],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe(
			"pr-enqueue.sh: PR #42 inQueue=false autoMergeArmed=false\n",
		)
		expect(result.stderr).toBe(
			"pr-enqueue.sh: PR #42 is neither in the merge queue nor armed for auto-merge after gh pr merge --auto\n",
		)
		expect(ghCalls()).toEqual([LIST, READ_STATE, ENQUEUE, READ_STATE])
	})

	it("fails with the refusal of gh and reads nothing back when gh refuses to arm auto-merge", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			isMergeRefused: true,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("GraphQL: auto-merge refused\n")
		expect(ghCalls()).toEqual([LIST, READ_STATE, ARM])
	})

	it("fails naming the branch and arms nothing when the branch has no open PR", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-enqueue.sh: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails naming the PRs and arms nothing when the branch has several open PRs", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [42, 43] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-enqueue.sh: branch ${BRANCH} has several open PRs: 42 43\n`,
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
