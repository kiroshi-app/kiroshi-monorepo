import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	chmodSync,
	copyFileSync,
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

const PR_REQUEUE_CHECK = fileURLToPath(
	new URL("./pr-requeue-check.sh", import.meta.url),
)

const PR_ENQUEUE = fileURLToPath(new URL("./pr-enqueue.sh", import.meta.url))

const ENQUEUE_ARGUMENT_CHECK = "if [ $# -ne 0 ]; then\n"

const ENQUEUE_LINE = `if [ $# -eq 0 ] || { [ $# -eq 2 ] && [ "$1" = --reason ]; }; then "$(dirname "$0")/pr-requeue-check.sh" "$@"; set --; fi\n`

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const BRANCH = "feature/ope-1-fix"

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
if [ "$(cat "$GH_STUB/failing-call" 2>/dev/null)" = "$call" ]; then
	echo "HTTP 502: Bad Gateway" >&2
	exit 1
fi
case "$call" in
"pr merge") exit 0 ;;
"pr list") response=$(cat "$GH_STUB/pull-requests.json") ;;
"pr view") response=$(cat "$GH_STUB/pull-request.json") ;;
"run list --commit") response=$(cat "$GH_STUB/head-runs.json") ;;
"run list --event") response=$(cat "$GH_STUB/failed-queue-runs.json") ;;
*) response=$(cat "$GH_STUB/armed-state.json") ;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

type QueueRun = { databaseId: number; headBranch: string; createdAt: string }

type GhCall = "pr list" | "pr view" | "run list --commit" | "run list --event"

type Scenario = {
	script?: string
	arguments?: string[]
	headRunTimes?: string[]
	failedQueueRuns?: QueueRun[]
	failingCall?: GhCall
}

const HEAD_RUN_TIMES = ["2026-10-27T09:05:00Z", "2026-10-27T09:00:00Z"]

const queueRun = (
	databaseId: number,
	pullRequest: number,
	createdAt: string,
): QueueRun => ({
	databaseId,
	headBranch: `gh-readonly-queue/main/pr-${pullRequest}-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567`,
	createdAt,
})

const OTHER_PULL_REQUEST_EJECTIONS = [
	queueRun(9101, 421, "2026-10-27T11:00:00Z"),
	queueRun(9102, 4, "2026-10-27T10:30:00Z"),
]

const EJECTION_ON_OLDER_HEAD = queueRun(9001, 42, "2026-10-27T08:30:00Z")

const EJECTION_ON_CURRENT_HEAD = queueRun(9002, 42, "2026-10-27T10:00:00Z")

let stub: string
let repository: string

const describeCall = (call: string[]) => {
	if (call[0] === "api") return "api graphql"
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
const VIEW = `pr view 42 --repo ${REPOSITORY}`
const HEAD_RUNS = `run list --repo ${REPOSITORY} --commit ${HEAD} --limit 100`
const FAILED_QUEUE_RUNS = `run list --repo ${REPOSITORY} --event merge_group --status failure --limit 100`
const ARM = `pr merge --auto 42 --repo ${REPOSITORY}`

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const writeStubResponses = ({
	headRunTimes = HEAD_RUN_TIMES,
	failedQueueRuns = OTHER_PULL_REQUEST_EJECTIONS,
	failingCall,
}: Scenario) => {
	const respond = (file: string, response: unknown) =>
		writeFileSync(join(stub, file), JSON.stringify(response))
	respond("pull-requests.json", [{ number: 42 }])
	respond("pull-request.json", { headRefOid: HEAD })
	respond(
		"head-runs.json",
		headRunTimes.map((createdAt) => ({ createdAt })),
	)
	respond("failed-queue-runs.json", failedQueueRuns)
	respond("armed-state.json", {
		data: {
			node: {
				autoMergeRequest: { enabledAt: "2026-10-27T12:00:00Z" },
				isInMergeQueue: false,
			},
		},
	})
	if (failingCall) writeFileSync(join(stub, "failing-call"), failingCall)
}

const run = async (scenario: Scenario) => {
	const initialised = Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", BRANCH, repository],
		env: withoutGitContext(),
	})
	if (initialised.exitCode !== 0) {
		throw new Error(`git init failed: ${initialised.stderr.toString()}`)
	}
	writeStubResponses(scenario)
	const running = Bun.spawn({
		cmd: [scenario.script ?? PR_REQUEUE_CHECK, ...(scenario.arguments ?? [])],
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

const wiredPrEnqueue = () => {
	const source = readFileSync(PR_ENQUEUE, "utf8")
	if (!source.includes(ENQUEUE_ARGUMENT_CHECK)) {
		throw new Error("pr-enqueue.sh has no argument check to wire before")
	}
	const scripts = join(stub, "scripts")
	mkdirSync(scripts)
	const wired = join(scripts, "pr-enqueue.sh")
	writeFileSync(
		wired,
		source.includes(ENQUEUE_LINE)
			? source
			: source.replace(
					ENQUEUE_ARGUMENT_CHECK,
					`${ENQUEUE_LINE}${ENQUEUE_ARGUMENT_CHECK}`,
				),
	)
	chmodSync(wired, 0o755)
	copyFileSync(PR_REQUEUE_CHECK, join(scripts, "pr-requeue-check.sh"))
	chmodSync(join(scripts, "pr-requeue-check.sh"), 0o755)
	return wired
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-pr-requeue-check-stub-"))
	repository = mkdtempSync(
		join(tmpdir(), "kiroshi-pr-requeue-check-repository-"),
	)
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
})

describe("scripts/pr-requeue-check.sh", () => {
	it("passes silently when only other PRs were ejected from the merge queue", async () => {
		const result = await run({})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("")
		expect(result.stderr).toBe("")
		expect(ghCalls()).toEqual([LIST, VIEW, HEAD_RUNS, FAILED_QUEUE_RUNS])
	})

	it("passes when the only ejection of the PR predates its current head", async () => {
		const result = await run({
			failedQueueRuns: [
				EJECTION_ON_OLDER_HEAD,
				...OTHER_PULL_REQUEST_EJECTIONS,
			],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stderr).toBe("")
	})

	it("refuses naming the run and the head when the PR was ejected on its current head", async () => {
		const result = await run({
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD, EJECTION_ON_OLDER_HEAD],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe("")
		expect(result.stderr).toBe(
			`pr-requeue-check.sh: PR #42 was ejected from the merge queue by run 9002 on its current head ${HEAD}, push a fix or pass --reason <text> to queue it again\n`,
		)
	})

	it("passes and prints the reason when the PR was ejected on its current head and --reason is given", async () => {
		const result = await run({
			arguments: ["--reason", "runner lost mid-job"],
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			`pr-requeue-check.sh: PR #42 queued again on head ${HEAD} after run 9002, reason: runner lost mid-job\n`,
		)
	})

	it("reads the PR named by its number instead of the PR of the branch", async () => {
		const result = await run({
			arguments: ["42", "--reason", "runner lost mid-job"],
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD],
		})

		expect(result.exitCode).toBe(0)
		expect(ghCalls()).toEqual([VIEW, HEAD_RUNS, FAILED_QUEUE_RUNS])
	})

	it("passes without reading the merge queue when no run exists on the current head yet", async () => {
		const result = await run({
			headRunTimes: [],
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD],
		})

		expect(result.exitCode).toBe(0)
		expect(ghCalls()).toEqual([LIST, VIEW, HEAD_RUNS])
	})

	it.each([
		["pr list", "gh pr list --head feature/ope-1-fix failed"],
		["pr view", "gh pr view 42 failed"],
		["run list --commit", `gh run list --commit ${HEAD} failed`],
		["run list --event", "gh run list --event merge_group failed"],
	] as const)(
		"fails naming the command when gh %s fails",
		async (failingCall, named) => {
			const result = await run({ failingCall })

			expect(result.exitCode).not.toBe(0)
			expect(result.stderr).toBe(
				`HTTP 502: Bad Gateway\npr-requeue-check.sh: ${named}\n`,
			)
		},
	)

	it.each([
		[["--reason"]],
		[["--reason", ""]],
		[["--reason", "  "]],
		[["--reason", "flake", "--reason", "again"]],
		[["42", "43"]],
		[["#42"]],
		[["--force"]],
	])(
		"refuses %j with a usage line and calls gh not at all",
		async (badArguments) => {
			const result = await run({ arguments: badArguments })

			expect(result.exitCode).toBe(64)
			expect(result.stderr).toStartWith("pr-requeue-check.sh: usage:")
			expect(ghCalls()).toEqual([])
		},
	)
})

describe("scripts/pr-enqueue.sh wired to the requeue check", () => {
	it("refuses a PR ejected on its current head and arms nothing", async () => {
		const result = await run({
			script: wiredPrEnqueue(),
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD],
		})

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain(`run 9002 on its current head ${HEAD}`)
		expect(ghCalls()).not.toContain(ARM)
	})

	it("arms auto-merge on a PR ejected on its current head when --reason is given", async () => {
		const result = await run({
			script: wiredPrEnqueue(),
			arguments: ["--reason", "runner lost mid-job"],
			failedQueueRuns: [EJECTION_ON_CURRENT_HEAD],
		})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			`pr-requeue-check.sh: PR #42 queued again on head ${HEAD} after run 9002, reason: runner lost mid-job\npr-enqueue.sh: PR #42 autoMergeArmed=true\n`,
		)
		expect(ghCalls()).toContain(ARM)
	})

	it.each([[["42"]], [["--reason"]], [["--reason", "flake", "42"]]])(
		"still refuses %j with its own usage line and calls gh not at all",
		async (badArguments) => {
			const result = await run({
				script: wiredPrEnqueue(),
				arguments: badArguments,
			})

			expect(result.exitCode).toBe(64)
			expect(result.stderr).toStartWith("pr-enqueue.sh: usage:")
			expect(ghCalls()).toEqual([])
		},
	)
})
