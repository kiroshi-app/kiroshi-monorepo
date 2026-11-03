export type Run = {
	id: number
	name: string
	event: string
	headBranch: string
	conclusion: string | null
	headSha: string
	createdAt: string
	url: string
	commitMessage: string
	commitAuthor: string
}

export type Job = { name: string; conclusion: string | null }

export type PullRequest = { number: number; authorLogin: string }

export type Commit = { sha: string; message: string }

export type MergedCommit = Commit & { pullRequests: PullRequest[] }

export type GreenRange = {
	kind: "range"
	greenSha: string
	commits: MergedCommit[]
}

export type SinceGreen =
	| GreenRange
	| { kind: "none" }
	| { kind: "unavailable"; reason: string }

export type RunReport = {
	run: Run
	jobs: Job[]
	pullRequests: PullRequest[]
	sinceGreen: SinceGreen
}

export type IssueInput = {
	teamId: string
	projectId: string
	labelIds: string[]
	stateId: string
	title: string
	description: string
}

export type GitHub = {
	readRun: (runId: string) => Promise<Run>
	readJobs: (runId: string) => Promise<Job[]>
	readPullRequests: (sha: string) => Promise<PullRequest[]>
	readLastGreenSha: (createdBefore: string) => Promise<string | undefined>
	readCommits: (base: string, head: string) => Promise<Commit[]>
}

export type GraphQLRequest = {
	query: string
	variables: Record<string, unknown>
}

export type LinearTransport = (request: GraphQLRequest) => Promise<Response>

type Ports = {
	github: GitHub
	linear: LinearTransport
}

type LinearAnswer = {
	data?: Record<string, unknown>
	errors?: { message: string }[]
}

const TEAM_ID = "10814938-0dfc-41ad-9e16-bea303d81728"
const PROJECT_ID = "e5a723ee-03fa-46c8-8c73-2def41925fdb"
const BUG_LABEL_ID = "8b4d77ec-bddc-475e-9d19-fc581ef758ce"
const TODO_STATE_ID = "84f63beb-26f5-47ff-89e4-1c41e9128f6c"

const FAILED_JOB_CONCLUSIONS = ["failure", "timed_out"]

const REQUEST_TIMEOUT_MS = 30_000

const ISSUES_REPORTING_RUN = `query IssuesReportingRun($teamId: ID!, $runUrl: String!) {
	issues(first: 1, filter: { team: { id: { eq: $teamId } }, description: { contains: $runUrl } }) {
		nodes { identifier }
	}
}`

const CREATE_ISSUE = `mutation CreateRedMainIssue($input: IssueCreateInput!) {
	issueCreate(input: $input) { success issue { identifier url } }
}`

export const skipReason = (run: Run): string | undefined => {
	if (run.name !== "CI") return `run ${run.id} belongs to ${run.name}, not CI`
	if (run.event !== "push") return `run ${run.id} is a ${run.event} run`
	if (run.headBranch !== "main")
		return `run ${run.id} ran on ${run.headBranch}, not main`
	if (run.conclusion !== "failure")
		return `run ${run.id} concluded ${run.conclusion}`
	return undefined
}

const shortSha = (sha: string) => sha.slice(0, 7)

const firstLine = (text: string) => text.split("\n")[0] ?? ""

const failedJobNames = (jobs: Job[]) => {
	const failed = jobs
		.filter((job) => FAILED_JOB_CONCLUSIONS.includes(job.conclusion ?? ""))
		.map((job) => job.name)
	const withoutVerify = failed.filter((name) => name !== "verify")
	return withoutVerify.length > 0 ? withoutVerify : failed
}

const pullRequestLine = (pullRequests: PullRequest[]) => {
	const [pullRequest] = pullRequests
	if (!pullRequest) return "PR: none"
	return `PR: #${pullRequest.number} by ${pullRequest.authorLogin}`
}

const pullRequestNumbers = (pullRequests: PullRequest[]) =>
	pullRequests.length === 0
		? "no PR"
		: pullRequests.map(({ number }) => `#${number}`).join(", ")

const commitLine = ({ sha, message, pullRequests }: MergedCommit) =>
	`- ${shortSha(sha)} ${pullRequestNumbers(pullRequests)} ${firstLine(message)}`

const rangeSections = (run: Run, sinceGreen: SinceGreen) => {
	if (sinceGreen.kind === "none")
		return [
			"Last green: none, no CI push run on main concluded success before this run",
		]
	if (sinceGreen.kind === "unavailable")
		return [`Last green: unavailable (${sinceGreen.reason})`]
	return [
		`Last green: ${sinceGreen.greenSha}`,
		`Red: ${run.headSha}`,
		[
			"Commits since the last green:",
			...sinceGreen.commits.map(commitLine),
		].join("\n"),
	]
}

const FILED_IN = {
	teamId: TEAM_ID,
	projectId: PROJECT_ID,
	labelIds: [BUG_LABEL_ID],
	stateId: TODO_STATE_ID,
}

export const redMainIssue = ({
	run,
	jobs,
	pullRequests,
	sinceGreen,
}: RunReport): IssueInput => ({
	...FILED_IN,
	title: `Red main: ${failedJobNames(jobs).join(", ")} at ${shortSha(run.headSha)}`,
	description: [
		`Run: ${run.url}`,
		`Commit: ${firstLine(run.commitMessage)}`,
		pullRequestLine(pullRequests),
		`Commit author: ${run.commitAuthor}`,
		...rangeSections(run, sinceGreen),
		"Classify: flake or break",
	].join("\n\n"),
})

const askLinear = async (
	linear: LinearTransport,
	step: string,
	request: GraphQLRequest,
) => {
	const response = await linear(request)
	if (!response.ok)
		throw new Error(`${step}: Linear answered ${response.status}`)
	const answer = (await response.json()) as LinearAnswer
	if (answer.errors?.length) {
		const messages = answer.errors.map((error) => error.message).join("; ")
		throw new Error(`${step}: Linear answered errors: ${messages}`)
	}
	if (!answer.data) throw new Error(`${step}: Linear answered no data`)
	return answer.data
}

const issueReportingRun = async (linear: LinearTransport, runUrl: string) => {
	const data = await askLinear(linear, "look up an issue for the run", {
		query: ISSUES_REPORTING_RUN,
		variables: { teamId: TEAM_ID, runUrl },
	})
	const issues = data.issues as { nodes: { identifier: string }[] }
	return issues.nodes[0]?.identifier
}

const createIssue = async (linear: LinearTransport, input: IssueInput) => {
	const step = "create the issue"
	const data = await askLinear(linear, step, {
		query: CREATE_ISSUE,
		variables: { input },
	})
	const created = data.issueCreate as {
		success: boolean
		issue?: { identifier: string; url: string }
	}
	if (!created.success || !created.issue)
		throw new Error(`${step}: Linear refused it`)
	return created.issue
}

const readGreenRange = async (
	github: GitHub,
	run: Run,
): Promise<SinceGreen> => {
	const greenSha = await github.readLastGreenSha(run.createdAt)
	if (!greenSha) return { kind: "none" }
	const commits = await github.readCommits(greenSha, run.headSha)
	const merged = await Promise.all(
		commits.map(async (commit) => ({
			...commit,
			pullRequests: await github.readPullRequests(commit.sha),
		})),
	)
	return { kind: "range", greenSha, commits: merged }
}

const readSinceGreen = async (
	github: GitHub,
	run: Run,
): Promise<SinceGreen> => {
	try {
		return await readGreenRange(github, run)
	} catch (failure) {
		return { kind: "unavailable", reason: (failure as Error).message }
	}
}

export const reportRedMain = async (
	runId: string,
	{ github, linear }: Ports,
): Promise<string> => {
	const run = await github.readRun(runId)
	const reason = skipReason(run)
	if (reason) return `no issue: ${reason}`
	const existing = await issueReportingRun(linear, run.url)
	if (existing) return `no issue: ${existing} already reports ${run.url}`
	const [jobs, pullRequests, sinceGreen] = await Promise.all([
		github.readJobs(runId),
		github.readPullRequests(run.headSha),
		readSinceGreen(github, run),
	])
	const issue = await createIssue(
		linear,
		redMainIssue({ run, jobs, pullRequests, sinceGreen }),
	)
	return `created ${issue.identifier} ${issue.url}`
}

type GitHubRun = {
	id: number
	name: string
	event: string
	head_branch: string
	conclusion: string | null
	head_sha: string
	created_at: string
	html_url: string
	head_commit: { message: string; author: { name: string } } | null
}

type GitHubPullRequest = { number: number; user: { login: string } }

type GitHubJob = { name: string; conclusion: string | null }

type GitHubCommit = { sha: string; commit: { message: string } }

const toRun = (run: GitHubRun): Run => ({
	id: run.id,
	name: run.name,
	event: run.event,
	headBranch: run.head_branch,
	conclusion: run.conclusion,
	headSha: run.head_sha,
	createdAt: run.created_at,
	url: run.html_url,
	commitMessage: run.head_commit?.message ?? "",
	commitAuthor: run.head_commit?.author.name ?? "unknown",
})

export const createGitHub = (repository: string, token: string): GitHub => {
	const read = async <T>(step: string, path: string): Promise<T> => {
		const response = await fetch(
			`https://api.github.com/repos/${repository}${path}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			},
		)
		if (!response.ok)
			throw new Error(`${step}: GitHub answered ${response.status}`)
		return (await response.json()) as T
	}
	return {
		readRun: async (runId) => {
			const run = await read<GitHubRun>(
				"read the run",
				`/actions/runs/${runId}`,
			)
			return toRun(run)
		},
		readJobs: async (runId) => {
			const { jobs } = await read<{ jobs: GitHubJob[] }>(
				"read the jobs of the run",
				`/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
			)
			return jobs.map(({ name, conclusion }) => ({ name, conclusion }))
		},
		readPullRequests: async (sha) => {
			const pullRequests = await read<GitHubPullRequest[]>(
				"read the pull requests of the commit",
				`/commits/${sha}/pulls`,
			)
			return pullRequests.map(({ number, user }) => ({
				number,
				authorLogin: user.login,
			}))
		},
		readLastGreenSha: async (createdBefore) => {
			const filters = new URLSearchParams({
				branch: "main",
				event: "push",
				status: "success",
				created: `<${createdBefore}`,
				per_page: "1",
			})
			const { workflow_runs } = await read<{ workflow_runs: GitHubRun[] }>(
				"read the last green push run on main",
				`/actions/workflows/ci.yml/runs?${filters}`,
			)
			return workflow_runs[0]?.head_sha
		},
		readCommits: async (base, head) => {
			const { commits } = await read<{ commits: GitHubCommit[] }>(
				"read the commits since the last green run",
				`/compare/${base}...${head}`,
			)
			return commits.map(({ sha, commit }) => ({
				sha,
				message: commit.message,
			}))
		},
	}
}

const createLinearTransport =
	(apiKey: string): LinearTransport =>
	async (request) => {
		if (!apiKey) throw new Error("read LINEAR_API_KEY: it is empty")
		return fetch("https://api.linear.app/graphql", {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: apiKey },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
	}

const readEnv = (name: string) => process.env[name] ?? ""

const requiredEnv = (name: string) => {
	const value = readEnv(name)
	if (!value) throw new Error(`read ${name}: it is empty`)
	return value
}

const readRunId = () => {
	const runId = requiredEnv("RUN_ID")
	if (!/^\d+$/.test(runId))
		throw new Error(`read RUN_ID: "${runId}" is not a run id`)
	return runId
}

const main = async () => {
	const outcome = await reportRedMain(readRunId(), {
		github: createGitHub(
			requiredEnv("GITHUB_REPOSITORY"),
			requiredEnv("GH_TOKEN"),
		),
		linear: createLinearTransport(readEnv("LINEAR_API_KEY")),
	})
	console.log(`red-main  ${outcome}`)
}

if (import.meta.main) {
	try {
		await main()
	} catch (failure) {
		console.error(`red-main  ${(failure as Error).message}`)
		process.exit(1)
	}
}
