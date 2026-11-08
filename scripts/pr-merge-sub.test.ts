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

const PR_MERGE_SUB = fileURLToPath(
	new URL("./pr-merge-sub.sh", import.meta.url),
)

const CODEOWNERS = readFileSync(
	fileURLToPath(new URL("../.github/CODEOWNERS", import.meta.url)),
	"utf8",
)

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const BRANCH = "feature/ope-1-port"

const BASE = "rune/foundations"

const HEAD_SHA = "4f2c9e1d7b3a5c8e0f6d2b9a1c4e7f3d5b8a0c6e"

const ARGUMENT_SEPARATOR = "\u001f"

const STUB_GH = `#!/bin/bash
set -euo pipefail
printf '%s\\037' "\${@//$'\\n'/ }" >>"$GH_STUB/calls"
echo >>"$GH_STUB/calls"
filter=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then filter=$argument; fi
	previous=$argument
done
case "$1 $2" in
"pr merge")
	if [ ! -f "$GH_STUB/merge-ineffective" ]; then touch "$GH_STUB/merged"; fi
	exit 0
	;;
"pr list") response=$(cat "$GH_STUB/pull-requests.json") ;;
"pr view")
	if [ -f "$GH_STUB/merged" ]; then
		response=$(jq '.mergedAt = "2026-11-07T00:00:00Z"' "$GH_STUB/pull-request.json")
	else
		response=$(cat "$GH_STUB/pull-request.json")
	fi
	;;
"api --paginate") response=$(cat "$GH_STUB/files.json") ;;
*)
	cat "$GH_STUB/codeowners"
	exit 0
	;;
esac
if [ -n "$filter" ]; then jq -r "$filter" <<<"$response"; else echo "$response"; fi
`

type CheckRun = {
	__typename: "CheckRun"
	name: string
	status: string
	conclusion: string | null
}

type StatusContext = {
	__typename: "StatusContext"
	context: string
	state: string
}

type Check = CheckRun | StatusContext

type PullRequest = {
	baseRefName: string
	headRefOid: string
	isDraft: boolean
	mergeable: string
	changedFiles?: number
	statusCheckRollup: Check[]
}

type ChangedFile = { filename: string; previous_filename?: string }

type Scenario = {
	arguments?: string[]
	pullRequestNumbers?: number[]
	pullRequest?: Partial<PullRequest>
	files?: ChangedFile[]
	codeowners?: string
	isMergeIneffective?: boolean
}

const completed = (name: string, conclusion: string): CheckRun => ({
	__typename: "CheckRun",
	name,
	status: "COMPLETED",
	conclusion,
})

const GREEN_CHECKS: Check[] = [
	completed("lint", "SUCCESS"),
	completed("ios", "SKIPPED"),
	completed("website", "NEUTRAL"),
	{ __typename: "StatusContext", context: "deploy", state: "SUCCESS" },
]

const GREEN_PULL_REQUEST: PullRequest = {
	baseRefName: BASE,
	headRefOid: HEAD_SHA,
	isDraft: false,
	mergeable: "MERGEABLE",
	statusCheckRollup: GREEN_CHECKS,
}

const UNOWNED_FILES: ChangedFile[] = [
	{ filename: "packages/ui/src/components/rune/kit.tsx" },
	{ filename: "packages/ui/.github/notes.md" },
	{ filename: "apps/app/src-tauri/build.rs.orig" },
	{ filename: "apps/app/src-tauri/src/accounting/ledger.rs" },
	{ filename: "apps/app/src-tauri/src/rune/not_migrations.rs" },
	{
		filename: "apps/app/src-tauri/src/rune/kit.rs",
		previous_filename: "apps/app/src-tauri/src/kit.rs",
	},
]

const LIST = `pr list --repo ${REPOSITORY} --head ${BRANCH} --state open`
const VIEW = `pr view 42 --repo ${REPOSITORY}`
const READ_CODEOWNERS = `api --method GET repos/${REPOSITORY}/contents/.github/CODEOWNERS -f ref=${BASE} -H Accept: application/vnd.github.raw+json`
const LIST_FILES = `api --paginate repos/${REPOSITORY}/pulls/42/files`
const MERGE = `pr merge 42 --repo ${REPOSITORY} --squash --match-head-commit ${HEAD_SHA}`

let stub: string
let repository: string

const describeCall = (call: string[]) => {
	const output = call.findIndex(
		(argument) => argument === "--json" || argument === "--jq",
	)
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

const withoutGitContext = () => {
	const {
		GIT_DIR: _dir,
		GIT_WORK_TREE: _workTree,
		GIT_INDEX_FILE: _index,
		...environment
	} = process.env
	return environment
}

const runPrMergeSub = async ({
	arguments: prMergeSubArguments = [],
	pullRequestNumbers = [42],
	pullRequest = {},
	files = UNOWNED_FILES,
	codeowners = CODEOWNERS,
	isMergeIneffective = false,
}: Scenario) => {
	const initialised = Bun.spawnSync({
		cmd: ["git", "init", "--quiet", "--initial-branch", BRANCH, repository],
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
			changedFiles: files.length,
			...GREEN_PULL_REQUEST,
			...pullRequest,
			mergedAt: null,
		}),
	)
	writeFileSync(join(stub, "files.json"), JSON.stringify(files))
	writeFileSync(join(stub, "codeowners"), codeowners)
	if (isMergeIneffective) writeFileSync(join(stub, "merge-ineffective"), "")
	const running = Bun.spawn({
		cmd: [PR_MERGE_SUB, ...prMergeSubArguments],
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

const expectNoMerge = () => {
	expect(ghCalls().filter((call) => call.startsWith("pr merge"))).toEqual([])
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-pr-merge-sub-stub-"))
	repository = mkdtempSync(join(tmpdir(), "kiroshi-pr-merge-sub-repository-"))
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
	rmSync(repository, { recursive: true, force: true })
})

describe("scripts/pr-merge-sub.sh", () => {
	it("squash-merges the green PR of the branch on the head sha its checks were read on, reads it back and prints it", async () => {
		const result = await runPrMergeSub({})

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(
			`pr-merge-sub.sh: PR #42 base=${BASE} merged=true\n`,
		)
		expect(ghCalls()).toEqual([
			LIST,
			VIEW,
			READ_CODEOWNERS,
			LIST_FILES,
			MERGE,
			VIEW,
		])
	})

	it("fails naming the PR when the read-back shows it not merged", async () => {
		const result = await runPrMergeSub({ isMergeIneffective: true })

		expect(result.exitCode).not.toBe(0)
		expect(result.stdout).toBe(
			`pr-merge-sub.sh: PR #42 base=${BASE} merged=false\n`,
		)
		expect(result.stderr).toBe(
			"pr-merge-sub.sh: PR #42 is not merged after gh pr merge --squash\n",
		)
		expect(ghCalls().filter((call) => call === MERGE)).toHaveLength(1)
	})

	it("refuses any argument with a usage line and calls gh not at all", async () => {
		const result = await runPrMergeSub({ arguments: ["42"] })

		expect(result.exitCode).toBe(64)
		expect(result.stderr).toStartWith("pr-merge-sub.sh: usage:")
		expect(ghCalls()).toEqual([])
	})

	it("fails naming the branch when it has no open PR", async () => {
		const result = await runPrMergeSub({ pullRequestNumbers: [] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: branch ${BRANCH} has no open PR\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("fails naming the PRs when the branch has several open PRs", async () => {
		const result = await runPrMergeSub({ pullRequestNumbers: [42, 43] })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: branch ${BRANCH} has several open PRs: 42 43\n`,
		)
		expect(ghCalls()).toEqual([LIST])
	})

	it("refuses a PR whose base is main and points at scripts/pr-enqueue.sh", async () => {
		const result = await runPrMergeSub({
			pullRequest: { baseRefName: "main" },
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			"pr-merge-sub.sh: PR #42 targets main, which merges only through scripts/pr-enqueue.sh\n",
		)
		expectNoMerge()
	})

	it("refuses a draft PR", async () => {
		const result = await runPrMergeSub({ pullRequest: { isDraft: true } })

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe("pr-merge-sub.sh: PR #42 is a draft\n")
		expectNoMerge()
	})

	it("refuses a PR that conflicts with its base", async () => {
		const result = await runPrMergeSub({
			pullRequest: { mergeable: "CONFLICTING" },
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: PR #42 conflicts with its base ${BASE}\n`,
		)
		expectNoMerge()
	})

	it("refuses a head commit with no check", async () => {
		const result = await runPrMergeSub({
			pullRequest: { statusCheckRollup: [] },
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: PR #42 has no check on its head ${HEAD_SHA}\n`,
		)
		expectNoMerge()
	})

	it("refuses a head commit with one red check", async () => {
		const result = await runPrMergeSub({
			pullRequest: { statusCheckRollup: [completed("vitest", "FAILURE")] },
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			[
				`pr-merge-sub.sh: PR #42 has checks that are not green on its head ${HEAD_SHA}:`,
				"  vitest status=COMPLETED conclusion=FAILURE",
				"",
			].join("\n"),
		)
		expectNoMerge()
	})

	it("refuses a head commit with one pending check carrying no conclusion", async () => {
		const result = await runPrMergeSub({
			pullRequest: {
				statusCheckRollup: [
					{
						__typename: "CheckRun",
						name: "rust",
						status: "QUEUED",
						conclusion: null,
					},
				],
			},
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			[
				`pr-merge-sub.sh: PR #42 has checks that are not green on its head ${HEAD_SHA}:`,
				"  rust status=QUEUED conclusion=",
				"",
			].join("\n"),
		)
		expectNoMerge()
	})

	it("refuses a head commit with a check pending, failed or cancelled, naming each with its status and conclusion", async () => {
		const result = await runPrMergeSub({
			pullRequest: {
				statusCheckRollup: [
					...GREEN_CHECKS,
					{
						__typename: "CheckRun",
						name: "rust",
						status: "IN_PROGRESS",
						conclusion: "",
					},
					completed("vitest", "FAILURE"),
					completed("storybook", "CANCELLED"),
					{ __typename: "StatusContext", context: "preview", state: "PENDING" },
				],
			},
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			[
				`pr-merge-sub.sh: PR #42 has checks that are not green on its head ${HEAD_SHA}:`,
				"  rust status=IN_PROGRESS conclusion=",
				"  vitest status=COMPLETED conclusion=FAILURE",
				"  storybook status=COMPLETED conclusion=CANCELLED",
				"  preview status=PENDING conclusion=PENDING",
				"",
			].join("\n"),
		)
		expectNoMerge()
	})

	it.each([
		["a rooted directory", ".github/workflows/ci.yml", "/.github/"],
		[
			"a rooted file",
			"apps/app/src-tauri/build.rs",
			"/apps/app/src-tauri/build.rs",
		],
		[
			"a double-star file",
			"apps/app/src-tauri/src/rune/migrations.rs",
			"**/migrations.rs",
		],
	])(
		"refuses a PR changing a file owned by %s in CODEOWNERS, naming the file and its pattern",
		async (_shape, filename, pattern) => {
			const result = await runPrMergeSub({
				files: [...UNOWNED_FILES, { filename }],
			})

			expect(result.exitCode).not.toBe(0)
			expect(result.stderr).toBe(
				[
					"pr-merge-sub.sh: PR #42 changes files owned in .github/CODEOWNERS, they need a review:",
					`  ${filename} matches ${pattern}`,
					"",
				].join("\n"),
			)
			expectNoMerge()
		},
	)

	it("refuses a PR moving a file out of a path owned in CODEOWNERS", async () => {
		const result = await runPrMergeSub({
			files: [
				{
					filename: "apps/app/src-tauri/src/rune/updates.rs",
					previous_filename: "apps/app/src-tauri/src/updates/mod.rs",
				},
			],
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toContain(
			"  apps/app/src-tauri/src/updates/mod.rs matches /apps/app/src-tauri/src/updates/\n",
		)
		expectNoMerge()
	})

	it("refuses when the base CODEOWNERS holds a pattern of another shape", async () => {
		const result = await runPrMergeSub({
			codeowners: `${CODEOWNERS}\n*.pem @owner\n`,
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: CODEOWNERS pattern *.pem on ${BASE} has a shape this script cannot match\n`,
		)
		expectNoMerge()
	})

	it("refuses when GitHub lists fewer files than the PR changes", async () => {
		const result = await runPrMergeSub({
			pullRequest: { changedFiles: UNOWNED_FILES.length + 1 },
		})

		expect(result.exitCode).not.toBe(0)
		expect(result.stderr).toBe(
			`pr-merge-sub.sh: PR #42 lists ${UNOWNED_FILES.length} of its ${UNOWNED_FILES.length + 1} changed files, the rest cannot be checked against CODEOWNERS\n`,
		)
		expectNoMerge()
	})
})
