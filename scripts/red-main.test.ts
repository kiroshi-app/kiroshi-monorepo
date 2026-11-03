import { describe, expect, it } from "bun:test"

import {
	type GitHub,
	type GraphQLRequest,
	type GreenRange,
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
	createdAt: "2026-11-03T10:00:00Z",
	url: RUN_URL,
	commitMessage: "feat(search): search the current space only (#12)\n\nBody",
	commitAuthor: "Ada Lovelace",
}

const job = (name: string, conclusion: string): Job => ({ name, conclusion })

const mergedBy: PullRequest = { number: 12, authorLogin: "octocat" }

const GREEN_SHA = "3c1e5b0d9f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e"

const CANCELLED_SHA = "5d7f9b1c3e5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e"

const mergedBefore: PullRequest = { number: 11, authorLogin: "hopper" }

const sinceGreen: GreenRange = {
	kind: "range",
	greenSha: GREEN_SHA,
	commits: [
		{
			sha: CANCELLED_SHA,
			message: "fix(app): keep the draft on reload (#11)\n\nBody",
			pullRequests: [mergedBefore],
		},
		{
			sha: redRun.headSha,
			message: redRun.commitMessage,
			pullRequests: [mergedBy],
		},
	],
}

const fakeGitHub = (run: Run, greenShas: string[] = [GREEN_SHA]) => {
	const asked: string[] = []
	const github: GitHub = {
		readRun: async () => run,
		readJobs: async () => [job("rust", "failure"), job("verify", "failure")],
		readPullRequests: async (sha) =>
			sha === CANCELLED_SHA ? [mergedBefore] : [mergedBy],
		readLastGreenSha: async (createdBefore) => {
			asked.push(`last green before ${createdBefore}`)
			return greenShas[0]
		},
		readCommits: async (base, head) => {
			asked.push(`commits ${base}...${head}`)
			return sinceGreen.commits.map(({ sha, message }) => ({ sha, message }))
		},
	}
	return { github, asked }
}

const descriptionSent = (request: GraphQLRequest | undefined) =>
	(request?.variables.input as { description: string } | undefined)?.description

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

	it("rejects a cancelled run, which is never a red", () => {
		expect(skipReason({ ...redRun, conclusion: "cancelled" })).toBe(
			"run 101 concluded cancelled",
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

	it.each([
		["pull_request", "ope-1103-branch", false],
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
			sinceGreen,
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
			sinceGreen,
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
			sinceGreen,
		})

		expect(issue.title).toBe("Red main: ios at 8a7919a")
	})

	it("titles verify when it is the sole failed job", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [job("lint", "success"), job("verify", "failure")],
			pullRequests: [mergedBy],
			sinceGreen,
		})

		expect(issue.title).toBe("Red main: verify at 8a7919a")
	})

	it("describes the run, the commit, its pull request, its author and every commit since the last green run", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [mergedBy],
			sinceGreen,
		})

		expect(issue.description.split("\n\n")).toEqual([
			`Run: ${RUN_URL}`,
			"Commit: feat(search): search the current space only (#12)",
			"PR: #12 by octocat",
			"Commit author: Ada Lovelace",
			`Last green: ${GREEN_SHA}`,
			`Red: ${redRun.headSha}`,
			[
				"Commits since the last green:",
				"- 5d7f9b1 #11 fix(app): keep the draft on reload (#11)",
				"- 8a7919a #12 feat(search): search the current space only (#12)",
			].join("\n"),
			"Classify: flake or break",
		])
	})

	it("writes no PR beside a commit since the last green run that has none", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [],
			sinceGreen: {
				kind: "range",
				greenSha: GREEN_SHA,
				commits: [
					{ sha: redRun.headSha, message: "chore: bump", pullRequests: [] },
				],
			},
		})

		expect(issue.description).toContain("\n- 8a7919a no PR chore: bump\n")
	})

	it("writes that no green run precedes the red one in place of the range", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [mergedBy],
			sinceGreen: { kind: "none" },
		})

		expect(issue.description.split("\n\n")).toContain(
			"Last green: none, no CI push run on main concluded success before this run",
		)
		expect(issue.description).not.toContain("Red: ")
		expect(issue.description).not.toContain("Commits since the last green")
	})

	it("writes the reason the range is unavailable, distinct from no green run", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [mergedBy],
			sinceGreen: { kind: "unavailable", reason: "GitHub answered 502" },
		})

		expect(issue.description.split("\n\n")).toContain(
			"Last green: unavailable (GitHub answered 502)",
		)
		expect(issue.description).not.toContain("Last green: none")
	})

	it("writes PR: none when the commit has no pull request", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [],
			pullRequests: [],
			sinceGreen,
		})

		expect(issue.description).toContain("\n\nPR: none\n\n")
	})

	it("files the issue in the team, project, label and state of red main", () => {
		expect(
			redMainIssue({ run: redRun, jobs: [], pullRequests: [], sinceGreen }),
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

		const { github, asked } = fakeGitHub(redRun)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe("created KIR-7 https://linear.app/i/KIR-7")
		expect(requests[0]?.variables.runUrl).toBe(RUN_URL)
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Red main: rust at 8a7919a",
		})
		expect(asked).toEqual([
			`last green before ${redRun.createdAt}`,
			`commits ${GREEN_SHA}...${redRun.headSha}`,
		])
		expect(descriptionSent(requests[1])).toContain(
			"- 5d7f9b1 #11 fix(app): keep the draft on reload (#11)",
		)
	})

	it("reads no commit range when no green run precedes the red one", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-8", url: "https://linear.app/i/KIR-8" },
				},
			},
		})
		const { github, asked } = fakeGitHub(redRun, [])

		await reportRedMain("101", { github, linear })

		expect(asked).toEqual([`last green before ${redRun.createdAt}`])
		expect(descriptionSent(requests[1])).toContain("Last green: none")
	})

	it.each([
		["readLastGreenSha", "read the last green push run on main"],
		["readCommits", "read the commits since the last green run"],
		["readPullRequests", "read the pull requests of the commit"],
	] as const)(
		"still creates the issue, the range unavailable, when %s rejects",
		async (lookup, step) => {
			const { linear, requests } = linearAnswering(noIssueYet, {
				data: {
					issueCreate: {
						success: true,
						issue: { identifier: "KIR-9", url: "https://linear.app/i/KIR-9" },
					},
				},
			})
			const { github } = fakeGitHub(redRun)
			const failing = async () => {
				throw new Error(`${step}: GitHub answered 502`)
			}
			const rejectsRange =
				lookup === "readPullRequests"
					? {
							readPullRequests: async (sha: string) =>
								sha === CANCELLED_SHA ? failing() : [mergedBy],
						}
					: { [lookup]: failing }

			const outcome = await reportRedMain("101", {
				github: { ...github, ...rejectsRange },
				linear,
			})

			expect(outcome).toBe("created KIR-9 https://linear.app/i/KIR-9")
			expect(descriptionSent(requests[1])?.split("\n\n")).toContain(
				`Last green: unavailable (${step}: GitHub answered 502)`,
			)
			expect(descriptionSent(requests[1])).not.toContain("Last green: none")
			expect(descriptionSent(requests[1])).not.toContain(
				"Commits since the last green",
			)
		},
	)

	it("creates no issue and asks Linear nothing for a cancelled run", async () => {
		const { linear, requests } = linearAnswering()

		const outcome = await reportRedMain("101", {
			github: fakeGitHub({ ...redRun, conclusion: "cancelled" }).github,
			linear,
		})

		expect(outcome).toBe("no issue: run 101 concluded cancelled")
		expect(requests).toEqual([])
	})

	it("creates no issue and asks Linear nothing for a run that is not red main", async () => {
		const { linear, requests } = linearAnswering()

		const outcome = await reportRedMain("101", {
			github: fakeGitHub({ ...redRun, event: "pull_request" }).github,
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
			github: fakeGitHub(redRun).github,
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
			reportRedMain("101", { github: fakeGitHub(redRun).github, linear }),
		).rejects.toThrow(
			"create the issue: Linear answered errors: Entity not found: Project",
		)
	})

	it("fails naming the step when Linear answers a non 2xx status", async () => {
		const linear = async () => new Response("", { status: 401 })

		await expect(
			reportRedMain("101", { github: fakeGitHub(redRun).github, linear }),
		).rejects.toThrow("look up an issue for the run: Linear answered 401")
	})
})
