import { describe, expect, it } from "bun:test"

import {
	type GitHub,
	type GraphQLRequest,
	type Job,
	type PullRequest,
	type QueuedPullRequest,
	type Run,
	redMainIssue,
	reportRedMain,
	skipReason,
} from "./red-main"

const RUN_URL = "https://github.com/acme/repo/actions/runs/101"

const redRun: Run = {
	id: 101,
	name: "CI",
	event: "push",
	headBranch: "main",
	conclusion: "failure",
	headSha: "8a7919a25c9b687a758d334fcaa1024e38ea3cbc",
	url: RUN_URL,
	commitMessage: "feat(search): search the current space only (#12)\n\nBody",
	commitAuthor: "Ada Lovelace",
	createdAt: "2026-10-27T16:24:55Z",
}

const job = (name: string, conclusion: string): Job => ({
	name,
	conclusion,
	steps: [],
})

const mergedBy: PullRequest = { number: 12, authorLogin: "octocat" }

const fakeGitHub = (run: Run): GitHub => ({
	readRun: async () => run,
	readJobs: async () => [job("rust", "failure"), job("verify", "failure")],
	readPullRequests: async () => [mergedBy],
	readQueueRuns: async () => [],
	readPullRequest: async (number) => ({ ...mergedBy, number, headSha: "" }),
})

const linearAnswering = (...bodies: object[]) => {
	const requests: GraphQLRequest[] = []
	const linear = async (request: GraphQLRequest) => {
		requests.push(request)
		return new Response(JSON.stringify(bodies[requests.length - 1]))
	}
	return { linear, requests }
}

const noIssueYet = { data: { issues: { nodes: [] } } }

describe("the red main filter", () => {
	it("rejects a pull_request run", () => {
		expect(skipReason({ ...redRun, event: "pull_request" })).toBe(
			"run 101 is a pull_request run",
		)
	})

	it("rejects a tag run", () => {
		expect(skipReason({ ...redRun, headBranch: "v1.2.0" })).toBe(
			"run 101 ran on v1.2.0, not main",
		)
	})

	it("rejects a success run", () => {
		expect(skipReason({ ...redRun, conclusion: "success" })).toBe(
			"run 101 concluded success",
		)
	})

	it("accepts a push run on main concluded failure", () => {
		expect(skipReason(redRun)).toBeUndefined()
	})

	it("rejects a red merge_group run, its queue entry never reaching main", () => {
		expect(
			skipReason({
				...redRun,
				event: "merge_group",
				headBranch: "gh-readonly-queue/main/pr-12-8a7919a",
			}),
		).toBe("run 101 is a merge_group run")
	})

	it.each([
		["pull_request", "ope-1103-branch", false],
		["merge_group", "gh-readonly-queue/main/pr-12-8a7919a", false],
		["push", "v1.2.0", false],
		["push", "main", true],
	])(
		"reports a red %s run on %s only when it is a push to main: %p",
		(event, headBranch, isReported) => {
			expect(skipReason({ ...redRun, event, headBranch }) === undefined).toBe(
				isReported,
			)
		},
	)
})

describe("the red main issue", () => {
	it("titles several failed jobs without verify, with the short sha", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [
				job("lint", "failure"),
				job("rust", "timed_out"),
				job("ios", "skipped"),
				job("vitest", "success"),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
		})

		expect(issue.title).toBe("Red main: lint, rust at 8a7919a")
	})

	it("titles the post-merge rust and storybook jobs that failed", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [
				job("rust-check", "skipped"),
				job("rust", "failure"),
				job("storybook", "timed_out"),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
		})

		expect(issue.title).toBe("Red main: rust, storybook at 8a7919a")
	})

	it("titles ios, the one gated job a push to main runs", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [
				job("changes", "success"),
				job("lint", "skipped"),
				job("rust", "skipped"),
				job("storybook", "skipped"),
				job("ios", "failure"),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
		})

		expect(issue.title).toBe("Red main: ios at 8a7919a")
	})

	it("titles verify when it is the sole failed job", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [job("lint", "success"), job("verify", "failure")],
			pullRequests: [mergedBy],
		})

		expect(issue.title).toBe("Red main: verify at 8a7919a")
	})

	it("describes the run, the commit, its pull request and its author", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [mergedBy],
		})

		expect(issue.description.split("\n\n")).toEqual([
			`Run: ${RUN_URL}`,
			"Commit: feat(search): search the current space only (#12)",
			"PR: #12 by octocat",
			"Commit author: Ada Lovelace",
			"Classify: flake or break",
		])
	})

	it("writes PR: none when the commit has no pull request", () => {
		const issue = redMainIssue({ run: redRun, jobs: [], pullRequests: [] })

		expect(issue.description).toContain("\n\nPR: none\n\n")
	})

	it("files the issue in the team, project, label and state of red main", () => {
		expect(
			redMainIssue({ run: redRun, jobs: [], pullRequests: [] }),
		).toMatchObject({
			teamId: "10814938-0dfc-41ad-9e16-bea303d81728",
			projectId: "e5a723ee-03fa-46c8-8c73-2def41925fdb",
			labelIds: ["8b4d77ec-bddc-475e-9d19-fc581ef758ce"],
			stateId: "84f63beb-26f5-47ff-89e4-1c41e9128f6c",
		})
	})
})

describe("reporting a run", () => {
	it("creates one issue for a red main run", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-7", url: "https://linear.app/i/KIR-7" },
				},
			},
		})

		const outcome = await reportRedMain("101", {
			github: fakeGitHub(redRun),
			linear,
		})

		expect(outcome).toBe("created KIR-7 https://linear.app/i/KIR-7")
		expect(requests[0]?.variables.runUrl).toBe(RUN_URL)
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Red main: rust at 8a7919a",
		})
	})

	it("creates no issue and asks Linear nothing for a run that is not red main", async () => {
		const { linear, requests } = linearAnswering()

		const outcome = await reportRedMain("101", {
			github: fakeGitHub({ ...redRun, event: "pull_request" }),
			linear,
		})

		expect(outcome).toBe("no issue: run 101 is a pull_request run")
		expect(requests).toEqual([])
	})

	it("creates no second issue when one already carries the run URL", async () => {
		const { linear, requests } = linearAnswering({
			data: { issues: { nodes: [{ identifier: "KIR-3" }] } },
		})

		const outcome = await reportRedMain("101", {
			github: fakeGitHub(redRun),
			linear,
		})

		expect(outcome).toBe(`no issue: KIR-3 already reports ${RUN_URL}`)
		expect(requests).toHaveLength(1)
	})

	it("fails naming the step when Linear answers an errors array", async () => {
		const { linear } = linearAnswering(noIssueYet, {
			errors: [{ message: "Entity not found: Project" }],
		})

		await expect(
			reportRedMain("101", { github: fakeGitHub(redRun), linear }),
		).rejects.toThrow(
			"create the issue: Linear answered errors: Entity not found: Project",
		)
	})

	it("fails naming the step when Linear answers a non 2xx status", async () => {
		const linear = async () => new Response("", { status: 401 })

		await expect(
			reportRedMain("101", { github: fakeGitHub(redRun), linear }),
		).rejects.toThrow("look up an issue for the run: Linear answered 401")
	})
})

const MAIN_SHA = "4ff7e8dc3b8ffbabb164ac735cfeefc898d7b0e0"
const HEAD_21 = "a677757fe33a90f1ca6a36578bba8415f47e969b"
const HEAD_22 = "4d9310a4cdc786af29a208d121376b4f8bf16d23"
const HEAD_23 = "1deb4e44a335b1ad19df7435c0bb9ef251350665"
const PR_HEAD_21 = "c6b86593c7955248e2f78489dca7e1cf615abf07"

const queueRun = (
	id: number,
	pullRequest: number,
	baseSha: string,
	headSha: string,
	conclusion: string | null,
): Run => ({
	...redRun,
	id,
	event: "merge_group",
	headBranch: `gh-readonly-queue/main/pr-${pullRequest}-${baseSha}`,
	headSha,
	conclusion,
	url: `https://github.com/acme/repo/actions/runs/${id}`,
})

const entry21 = queueRun(201, 21, MAIN_SHA, HEAD_21, "failure")
const entry22 = queueRun(202, 22, HEAD_21, HEAD_22, "failure")
const entry23 = queueRun(203, 23, HEAD_22, HEAD_23, null)
const greenBefore21 = queueRun(200, 20, "0".repeat(40), MAIN_SHA, "success")

const rustBroke: Job[] = [
	{
		name: "rust",
		conclusion: "failure",
		steps: [
			{ name: "Set up job", conclusion: "success" },
			{ name: "cargo test", conclusion: "failure" },
			{ name: "Post cache", conclusion: "skipped" },
		],
	},
	{
		name: "lint",
		conclusion: "timed_out",
		steps: [{ name: "biome", conclusion: "cancelled" }],
	},
	job("vitest", "success"),
	job("verify", "failure"),
]

const author21: QueuedPullRequest = {
	number: 21,
	authorLogin: "dependabot[bot]",
	headSha: PR_HEAD_21,
}

type QueueFixture = {
	listed: Run[]
	readsOf?: Record<number, Run[]>
	jobsOf?: Record<number, Job[]>
}

const fakeQueue = ({ listed, readsOf = {}, jobsOf = {} }: QueueFixture) => {
	const pauses: number[] = []
	const github: GitHub = {
		readRun: async (runId) => {
			const reads = readsOf[Number(runId)] ?? []
			const read = reads.length > 1 ? reads.shift() : reads[0]
			if (!read) throw new Error(`no run ${runId} in the fixture`)
			return read
		},
		readJobs: async (runId) => jobsOf[Number(runId)] ?? rustBroke,
		readPullRequests: async () => [],
		readQueueRuns: async () => listed,
		readPullRequest: async (number) =>
			number === 21
				? author21
				: { number, authorLogin: `author-${number}`, headSha: HEAD_22 },
	}
	const pause = async (ms: number) => {
		pauses.push(ms)
	}
	return { github, pause, pauses }
}

const createdKir9 = {
	data: {
		issueCreate: {
			success: true,
			issue: { identifier: "KIR-9", url: "https://linear.app/i/KIR-9" },
		},
	},
}

const reportEntry = async (run: Run, fixture: QueueFixture) => {
	const { github, pause, pauses } = fakeQueue({
		...fixture,
		readsOf: { [run.id]: [run], ...fixture.readsOf },
	})
	const { linear, requests } = linearAnswering(noIssueYet, createdKir9)
	const outcome = await reportRedMain(String(run.id), {
		github,
		linear,
		pause,
	})
	const created = requests[1]?.variables.input as
		| { title: string; description: string }
		| undefined
	return { outcome, requests, created, pauses }
}

describe("reporting a red merge queue entry", () => {
	it("creates one Ejected issue naming the failed jobs without verify, the head sha and the pull request", async () => {
		const { outcome, created } = await reportEntry(entry21, {
			listed: [greenBefore21, entry21],
		})

		expect(outcome).toBe("created KIR-9 https://linear.app/i/KIR-9")
		expect(created?.title).toBe("Ejected: rust, lint at a677757, PR #21")
	})

	it("titles verify when it is the sole failed job of the entry", async () => {
		const { created } = await reportEntry(entry21, {
			listed: [entry21],
			jobsOf: { 201: [job("lint", "success"), job("verify", "failure")] },
		})

		expect(created?.title).toBe("Ejected: verify at a677757, PR #21")
	})

	it("describes the failed steps, the run, the pull request, its head, the batch and where to reproduce", async () => {
		const { created } = await reportEntry(entry21, {
			listed: [greenBefore21, entry21, entry22, entry23],
			jobsOf: { 202: [job("rust", "failure"), job("ios", "failure")] },
		})

		expect(created?.description.split("\n\n")).toEqual([
			"Failed step: rust / cargo test",
			"Failed step: lint / biome",
			"Run: https://github.com/acme/repo/actions/runs/201",
			"PR: #21 by dependabot[bot]",
			`PR head: ${PR_HEAD_21}`,
			"Batch: #21, #22, #23",
			`Reproduce on main at ${MAIN_SHA} before classifying as pre-existing`,
		])
	})

	it("writes none recorded for a failed job that has no failed step", async () => {
		const { created } = await reportEntry(entry21, {
			listed: [entry21],
			jobsOf: { 201: [job("storybook", "failure")] },
		})

		expect(created?.description).toStartWith(
			"Failed step: storybook / none recorded\n\n",
		)
	})

	it("files the Ejected issue in the team, project, label and state of red main through the Linear transport", async () => {
		const { requests } = await reportEntry(entry21, { listed: [entry21] })

		expect(requests[1]?.query).toContain("issueCreate(input: $input)")
		expect(requests[1]?.variables.input).toMatchObject({
			teamId: "10814938-0dfc-41ad-9e16-bea303d81728",
			projectId: "e5a723ee-03fa-46c8-8c73-2def41925fdb",
			labelIds: ["8b4d77ec-bddc-475e-9d19-fc581ef758ce"],
			stateId: "84f63beb-26f5-47ff-89e4-1c41e9128f6c",
		})
	})

	it("creates no issue when an open issue already carries the pull request and its head", async () => {
		const { github } = fakeQueue({
			listed: [entry21],
			readsOf: { 201: [entry21] },
		})
		const { linear, requests } = linearAnswering({
			data: { issues: { nodes: [{ identifier: "KIR-4" }] } },
		})

		const outcome = await reportRedMain("201", { github, linear })

		expect(outcome).toBe("no issue: KIR-4 already reports PR #21 at c6b8659")
		expect(requests).toHaveLength(1)
		expect(requests[0]?.query).toContain(
			'state: { type: { nin: ["completed", "canceled"] } }',
		)
		expect(requests[0]?.variables).toEqual({
			teamId: "10814938-0dfc-41ad-9e16-bea303d81728",
			titleEnd: "PR #21",
			headLine: `PR head: ${PR_HEAD_21}`,
		})
	})

	it("creates no issue for a later entry when the earlier entry broke on the same job and completed first", async () => {
		const { outcome, requests } = await reportEntry(entry22, {
			listed: [entry21, entry22, entry23],
			readsOf: { 201: [entry21] },
			jobsOf: { 202: [job("rust", "failure"), job("verify", "failure")] },
		})

		expect(outcome).toBe(
			"no issue: PR #22 follows PR #21 in its queue batch, which broke on the same jobs in https://github.com/acme/repo/actions/runs/201",
		)
		expect(requests).toEqual([])
	})

	it("waits for a running earlier entry, then creates no issue when it breaks on the same job", async () => {
		const { outcome, requests, pauses } = await reportEntry(entry22, {
			listed: [{ ...entry21, conclusion: null }, entry22],
			readsOf: { 201: [{ ...entry21, conclusion: null }, entry21] },
			jobsOf: { 202: [job("rust", "failure")] },
		})

		expect(outcome).toStartWith("no issue: PR #22 follows PR #21")
		expect(pauses).toEqual([30_000, 30_000])
		expect(requests).toEqual([])
	})

	it("lists a later entry still running in the Batch line of the earlier entry", async () => {
		const { created } = await reportEntry(entry21, {
			listed: [entry21, { ...entry22, conclusion: null }],
		})

		expect(created?.description).toContain("\n\nBatch: #21, #22\n\n")
	})

	it("creates an issue for a later entry when the earlier entry it waited for turns green", async () => {
		const { created } = await reportEntry(entry22, {
			listed: [{ ...entry21, conclusion: null }, entry22],
			readsOf: { 201: [{ ...entry21, conclusion: "success" }] },
		})

		expect(created?.title).toBe("Ejected: rust, lint at 4d9310a, PR #22")
		expect(created?.description).toContain("\n\nBatch: #22\n\n")
	})

	it("creates an issue for a later entry that broke on a job the earlier entry passed, listing the earlier red entry", async () => {
		const { created } = await reportEntry(entry22, {
			listed: [entry21, entry22],
			readsOf: { 201: [entry21] },
			jobsOf: { 201: [job("lint", "failure")] },
		})

		expect(created?.title).toBe("Ejected: rust, lint at 4d9310a, PR #22")
		expect(created?.description).toContain("\n\nBatch: #21, #22\n\n")
	})

	it("fails naming the earlier run when it still runs after thirty minutes", async () => {
		const running = { ...entry21, conclusion: null }
		const { github, pause } = fakeQueue({
			listed: [running, entry22],
			readsOf: { 201: [running], 202: [entry22] },
		})
		const { linear } = linearAnswering()

		await expect(
			reportRedMain("202", { github, linear, pause }),
		).rejects.toThrow(
			"wait for the earlier queue entry: run 201 still runs after 30 minutes",
		)
	})

	it.each(["success", "cancelled"])(
		"creates no issue and asks Linear nothing for a merge_group run concluded %s",
		async (conclusion) => {
			const { outcome, requests } = await reportEntry(
				{ ...entry21, conclusion },
				{ listed: [] },
			)

			expect(outcome).toBe(`no issue: run 201 concluded ${conclusion}`)
			expect(requests).toEqual([])
		},
	)

	it("fails naming the branch when it is not a main queue branch", async () => {
		const strayBranch = { ...entry21, headBranch: "gh-readonly-queue/main/21" }
		const { github } = fakeQueue({
			listed: [],
			readsOf: { 201: [strayBranch] },
		})
		const { linear, requests } = linearAnswering()

		await expect(reportRedMain("201", { github, linear })).rejects.toThrow(
			'read the queue branch: "gh-readonly-queue/main/21" is not gh-readonly-queue/main/pr-<N>-<sha>',
		)
		expect(requests).toEqual([])
	})
})
