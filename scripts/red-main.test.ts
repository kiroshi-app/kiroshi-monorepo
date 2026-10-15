import { describe, expect, it } from "bun:test"

import {
	type GitHub,
	type GraphQLRequest,
	type Job,
	type PullRequest,
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
}

const job = (name: string, conclusion: string): Job => ({ name, conclusion })

const mergedBy: PullRequest = { number: 12, authorLogin: "octocat" }

const fakeGitHub = (run: Run): GitHub => ({
	readRun: async () => run,
	readJobs: async () => [job("rust", "failure"), job("verify", "failure")],
	readPullRequests: async () => [mergedBy],
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
