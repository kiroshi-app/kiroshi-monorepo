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
	if [ -f "$GH_STUB/merge-refused" ]; then
		echo "GraphQL: auto-merge refused" >&2
		exit 1
	fi
	exit 0
else
	response=$(cat "$GH_STUB/pull-request.json")
fi
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

let stub: string
let repository: string

type Scenario = {
	arguments?: string[]
	branch?: string
	pullRequestNumbers?: number[]
	isMergeRefused?: boolean
	autoMergeRequest?: object | null
}

const ARMED = { enabledAt: "2026-10-26T00:00:00Z", mergeMethod: "SQUASH" }

const ghCalls = () => {
	const log = join(stub, "calls")
	if (!existsSync(log)) return []
	return readFileSync(log, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const call = line.split(ARGUMENT_SEPARATOR).slice(0, -1)
			if (call[0] === "pr" && call[1] === "list")
				return `pr list --head ${call[call.indexOf("--head") + 1]}`
			const output = call.indexOf("--json")
			return (output === -1 ? call : call.slice(0, output)).join(" ")
		})
}

const LIST = `pr list --head ${BRANCH}`
const ARM = `pr merge --auto 42 --repo ${REPOSITORY}`
const READ_AUTO_MERGE = `pr view 42 --repo ${REPOSITORY}`

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
	autoMergeRequest = ARMED,
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
		JSON.stringify({ autoMergeRequest }),
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
	it("arms auto-merge on the PR of the branch with no merge method, reads it back and prints it", async () => {
		const result = await runPrEnqueue({ pullRequestNumbers: [42] })

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=true\n")
		expect(ghCalls()).toEqual([LIST, ARM, READ_AUTO_MERGE])
	})

	it("fails naming the PR when the read-back shows no auto-merge armed", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			autoMergeRequest: null,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe("pr-enqueue.sh: PR #42 autoMergeArmed=false\n")
		expect(result.stderr).toBe(
			"pr-enqueue.sh: PR #42 has no auto-merge armed after gh pr merge --auto\n",
		)
		expect(ghCalls()).toEqual([LIST, ARM, READ_AUTO_MERGE])
	})

	it("fails with the refusal of gh and reads nothing back when gh refuses to arm auto-merge", async () => {
		const result = await runPrEnqueue({
			pullRequestNumbers: [42],
			isMergeRefused: true,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("GraphQL: auto-merge refused\n")
		expect(ghCalls()).toEqual([LIST, ARM])
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
