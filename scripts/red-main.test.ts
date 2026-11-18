import { describe, expect, it } from "bun:test"

import {
	type GitHub,
	type GraphQLRequest,
	type GreenRange,
	isRunnerFailure,
	type Job,
	type JobStep,
	type PullRequest,
	type Run,
	redMainIssue,
	reportRedMain,
	runnerFailureIssue,
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
	attempt: 1,
}

const redNight: Run = { ...redRun, event: "schedule" }

const step = (name: string, conclusion: string | null): JobStep => ({
	name,
	conclusion,
})

const job = (
	name: string,
	conclusion: string,
	steps = [step("Gate", conclusion)],
): Job => ({ name, conclusion, steps })

const endedBeforeItsFirstTest = (name: string) =>
	job(name, "failure", [
		step("Gate", "failure"),
		step("Runner failure", "failure"),
	])

const failedOnATest = (name: string) =>
	job(name, "failure", [
		step("Gate", "failure"),
		step("Runner failure", "skipped"),
	])

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

const fakeGitHub = (
	run: Run,
	greenShas: string[] = [GREEN_SHA],
	jobs = [job("rust", "failure"), job("verify", "failure")],
) => {
	const asked: string[] = []
	const github: GitHub = {
		readRun: async () => run,
		readJobs: async () => jobs,
		rerunFailedJobs: async (runId) => {
			asked.push(`rerun the failed jobs of ${runId}`)
		},
		readPullRequests: async (sha) =>
			sha === CANCELLED_SHA ? [mergedBefore] : [mergedBy],
		readLastGreenSha: async ({ event, headBranch, createdAt }) => {
			asked.push(`last green ${event} on ${headBranch} before ${createdAt}`)
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

	it("rejects a push run on a branch other than main or a release/** branch", () => {
		expect(skipReason({ ...redRun, headBranch: "feature/home" })).toBe(
			"run 101 ran on feature/home, not main or a release/** branch",
		)
	})

	it("rejects a push run on a v* tag, which CI no longer runs on", () => {
		expect(skipReason({ ...redRun, headBranch: "v0.27.0" })).toBe(
			"run 101 ran on v0.27.0, not main or a release/** branch",
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

	it("accepts a scheduled run on main concluded failure", () => {
		expect(skipReason(redNight)).toBeUndefined()
	})

	it.each([
		["pull_request", "ope-1103-branch", false],
		["push", "feature/home", false],
		["push", "v1.2.0", false],
		["push", "release/0.27", true],
		["push", "main", true],
		["schedule", "main", true],
	])(
		"reports a red %s run on %s only when it is a push to main or a release/** branch, or a scheduled run on main: %p",
		(event, headBranch, isReported) => {
			expect(skipReason({ ...redRun, event, headBranch }) === undefined).toBe(
				isReported,
			)
		},
	)
})

describe("a runner failure", () => {
	it("is an ios job whose Runner failure step failed", () => {
		expect(isRunnerFailure(endedBeforeItsFirstTest("ios (2)"))).toBe(true)
	})

	it.each(["ios (1)", "ios (5)"])(
		"reads %s by the rule of every ios shard",
		(name) => {
			expect(isRunnerFailure(endedBeforeItsFirstTest(name))).toBe(true)
			expect(isRunnerFailure(failedOnATest(name))).toBe(false)
		},
	)

	it("is an ios job whose setup failed before its gate, the Runner failure step saying so", () => {
		const lostItsBuildProducts = job("ios (3)", "failure", [
			step("Set up job", "success"),
			step("Download the build products", "failure"),
			step("Gate", "skipped"),
			step("Runner failure", "failure"),
		])

		expect(isRunnerFailure(lostItsBuildProducts)).toBe(true)
	})

	it("is an ios job with zero completed steps", () => {
		expect(isRunnerFailure(job("ios (1)", "failure", []))).toBe(true)
		expect(
			isRunnerFailure(
				job("ios-build", "failure", [
					step("Set up job", null),
					step("Gate", null),
				]),
			),
		).toBe(true)
	})

	it("is not an ios job whose gate failed with the Runner failure step skipped", () => {
		expect(isRunnerFailure(failedOnATest("ios (2)"))).toBe(false)
	})

	it("is an ios-build job whose setup failed before its gate, the Runner failure step saying so", () => {
		const lostXcodeGen = job("ios-build", "failure", [
			step("Set up job", "success"),
			step("Install XcodeGen", "failure"),
			step("Gate", "skipped"),
			step("Runner failure", "failure"),
			step("Pack the build products", "skipped"),
		])

		expect(isRunnerFailure(lostXcodeGen)).toBe(true)
	})

	it("is not an ios-build job whose gate failed, a red like any failed build", () => {
		const brokeTheBuild = job("ios-build", "failure", [
			step("Install XcodeGen", "success"),
			step("Gate", "failure"),
			step("Runner failure", "skipped"),
			step("Pack the build products", "skipped"),
		])

		expect(isRunnerFailure(brokeTheBuild)).toBe(false)
		expect(
			redMainIssue({
				run: redRun,
				jobs: [brokeTheBuild, job("verify", "failure")],
				pullRequests: [mergedBy],
				sinceGreen,
			}).title,
		).toBe("Red main: ios-build at 8a7919a")
	})

	it("is never another job, zero completed steps or not", () => {
		expect(isRunnerFailure(job("rust", "failure", []))).toBe(false)
		expect(isRunnerFailure(endedBeforeItsFirstTest("storybook"))).toBe(false)
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
			sinceGreen,
		})

		expect(issue.title).toBe("Red main: lint, rust at 8a7919a")
	})

	it.each([["release/0.27", "Red release/0.27: rust at 8a7919a"]])(
		"names %s in place of main in the title",
		(headBranch, title) => {
			const issue = redMainIssue({
				run: { ...redRun, headBranch },
				jobs: [job("rust", "failure"), job("verify", "failure")],
				pullRequests: [mergedBy],
				sinceGreen: { kind: "none" },
			})

			expect(issue.title).toBe(title)
			expect(issue.description.split("\n\n")).toContain(
				`Last green: none, no CI push run on ${headBranch} concluded success before this run`,
			)
		},
	)

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

	it("titles a scheduled run Red night, never Red main, with the ios jobs a night runs", () => {
		const issue = redMainIssue({
			run: redNight,
			jobs: [
				job("changes", "success"),
				job("lint", "success"),
				job("rust", "skipped"),
				job("storybook", "skipped"),
				job("ios-build", "success"),
				job("ios (2)", "failure"),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
			sinceGreen,
		})

		expect(issue.title).toBe("Red night: ios (2) at 8a7919a")
		expect(issue.title).not.toContain("Red main")
	})

	it("writes that no green scheduled run precedes a red night in place of the range", () => {
		const issue = redMainIssue({
			run: redNight,
			jobs: [],
			pullRequests: [mergedBy],
			sinceGreen: { kind: "none" },
		})

		expect(issue.description.split("\n\n")).toContain(
			"Last green: none, no CI schedule run on main concluded success before this run",
		)
	})

	it("titles only the jobs where a test failed, and lists the runner failures on their own line", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [
				job("rust", "failure"),
				endedBeforeItsFirstTest("ios (1)"),
				failedOnATest("ios (2)"),
				job("ios (3)", "failure", []),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
			sinceGreen,
		})

		expect(issue.title).toBe("Red main: rust, ios (2) at 8a7919a")
		expect(issue.description.split("\n\n").slice(0, 3)).toEqual([
			`Run: ${RUN_URL}`,
			"Runner failures: ios (1), ios (3)",
			"Commit: feat(search): search the current space only (#12)",
		])
	})

	it("writes no runner failure line when every failed job failed on a test", () => {
		const issue = redMainIssue({
			run: redRun,
			jobs: [failedOnATest("ios (2)"), job("verify", "failure")],
			pullRequests: [mergedBy],
			sinceGreen,
		})

		expect(issue.title).toBe("Red main: ios (2) at 8a7919a")
		expect(issue.description).not.toContain("Runner failure")
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

describe("the runner failure issue", () => {
	it("titles the runner failures with the short sha, never Red main, and carries the run URL", () => {
		const issue = runnerFailureIssue({
			run: { ...redRun, attempt: 2 },
			jobs: [
				endedBeforeItsFirstTest("ios (2)"),
				job("ios (3)", "failure", []),
				job("verify", "failure"),
			],
			pullRequests: [mergedBy],
		})

		expect(issue.title).toBe("Runner failure: ios (2), ios (3) at 8a7919a")
		expect(issue.description).toBe(
			[
				`Run: ${RUN_URL}`,
				"Commit: feat(search): search the current space only (#12)",
				"PR: #12 by octocat",
				"Commit author: Ada Lovelace",
				"Attempt 2: every failed job ended before its first test started, after the failed jobs were rerun once",
			].join("\n\n"),
		)
		expect(issue).toMatchObject({
			teamId: "10814938-0dfc-41ad-9e16-bea303d81728",
			labelIds: ["8b4d77ec-bddc-475e-9d19-fc581ef758ce"],
		})
	})
})

describe("reporting a run", () => {
	const RUNNER_FAILURES_ONLY = [
		job("lint", "success"),
		endedBeforeItsFirstTest("ios (2)"),
		job("ios (3)", "failure", []),
		job("verify", "failure"),
	]

	it("reruns the failed jobs once and asks Linear nothing when every failed job of a first attempt is a runner failure", async () => {
		const { linear, requests } = linearAnswering()
		const { github, asked } = fakeGitHub(redRun, [], RUNNER_FAILURES_ONLY)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe(
			"no issue: reran the failed jobs of run 101, each a runner failure (ios (2), ios (3))",
		)
		expect(asked).toEqual(["rerun the failed jobs of 101"])
		expect(requests).toEqual([])
	})

	it("reruns the failed jobs once when the fifth ios shard ended before its first test", async () => {
		const { linear, requests } = linearAnswering()
		const { github, asked } = fakeGitHub(
			redRun,
			[],
			[endedBeforeItsFirstTest("ios (5)"), job("verify", "failure")],
		)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe(
			"no issue: reran the failed jobs of run 101, each a runner failure (ios (5))",
		)
		expect(asked).toEqual(["rerun the failed jobs of 101"])
		expect(requests).toEqual([])
	})

	it("opens one Runner failure issue, reruns nothing and reads no commit range when the rerun ends on runner failures only", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-9", url: "https://linear.app/i/KIR-9" },
				},
			},
		})
		const { github, asked } = fakeGitHub(
			{ ...redRun, attempt: 2 },
			[GREEN_SHA],
			RUNNER_FAILURES_ONLY,
		)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe("created KIR-9 https://linear.app/i/KIR-9")
		expect(requests[0]?.variables.runUrl).toBe(RUN_URL)
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Runner failure: ios (2), ios (3) at 8a7919a",
		})
		expect(asked).toEqual([])
	})

	it("opens no second Runner failure issue when one already carries the run URL", async () => {
		const { linear, requests } = linearAnswering({
			data: { issues: { nodes: [{ identifier: "KIR-9" }] } },
		})
		const { github } = fakeGitHub(
			{ ...redRun, attempt: 3 },
			[],
			RUNNER_FAILURES_ONLY,
		)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe(`no issue: KIR-9 already reports ${RUN_URL}`)
		expect(requests).toHaveLength(1)
	})

	it("opens the Red main issue and reruns nothing when a first attempt mixes runner failures and failed tests", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-10", url: "https://linear.app/i/KIR-10" },
				},
			},
		})
		const { github, asked } = fakeGitHub(
			redRun,
			[],
			[
				endedBeforeItsFirstTest("ios (1)"),
				failedOnATest("ios (2)"),
				job("verify", "failure"),
			],
		)

		await reportRedMain("101", { github, linear })

		expect(requests[1]?.variables.input).toMatchObject({
			title: "Red main: ios (2) at 8a7919a",
		})
		expect(descriptionSent(requests[1])).toContain("Runner failures: ios (1)")
		expect(asked).not.toContain("rerun the failed jobs of 101")
	})

	it("opens the Runner failure issue carrying the refusal, without throwing, when GitHub refuses the rerun", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-11", url: "https://linear.app/i/KIR-11" },
				},
			},
		})
		const { github } = fakeGitHub(redRun, [], RUNNER_FAILURES_ONLY)
		const refusing: GitHub = {
			...github,
			rerunFailedJobs: async () => {
				throw new Error("rerun the failed jobs of the run: GitHub answered 403")
			},
		}

		const outcome = await reportRedMain("101", { github: refusing, linear })

		expect(outcome).toBe("created KIR-11 https://linear.app/i/KIR-11")
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Runner failure: ios (2), ios (3) at 8a7919a",
		})
		expect(descriptionSent(requests[1])).toEndWith(
			"Attempt 1: every failed job ended before its first test started. Rerun refused: rerun the failed jobs of the run: GitHub answered 403",
		)
	})

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
			`last green push on main before ${redRun.createdAt}`,
			`commits ${GREEN_SHA}...${redRun.headSha}`,
		])
		expect(descriptionSent(requests[1])).toContain(
			"- 5d7f9b1 #11 fix(app): keep the draft on reload (#11)",
		)
	})

	it("opens the issue of a red release branch from the last green push run of that branch", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-10", url: "https://linear.app/i/KIR-10" },
				},
			},
		})
		const releaseRun = { ...redRun, headBranch: "release/0.27" }
		const { github, asked } = fakeGitHub(releaseRun)

		await reportRedMain("101", { github, linear })

		expect(asked[0]).toBe(
			`last green push on release/0.27 before ${releaseRun.createdAt}`,
		)
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Red release/0.27: rust at 8a7919a",
		})
	})

	it("creates one Red night issue for a red scheduled run, its range read since the last green scheduled run", async () => {
		const { linear, requests } = linearAnswering(noIssueYet, {
			data: {
				issueCreate: {
					success: true,
					issue: { identifier: "KIR-10", url: "https://linear.app/i/KIR-10" },
				},
			},
		})
		const { github, asked } = fakeGitHub(
			redNight,
			[GREEN_SHA],
			[failedOnATest("ios (2)"), job("verify", "failure")],
		)

		const outcome = await reportRedMain("101", { github, linear })

		expect(outcome).toBe("created KIR-10 https://linear.app/i/KIR-10")
		expect(requests[1]?.variables.input).toMatchObject({
			title: "Red night: ios (2) at 8a7919a",
		})
		expect(asked).toEqual([
			`last green schedule on main before ${redNight.createdAt}`,
			`commits ${GREEN_SHA}...${redNight.headSha}`,
		])
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

		expect(asked).toEqual([
			`last green push on main before ${redRun.createdAt}`,
		])
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
