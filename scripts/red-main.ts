export type Run = {
	id: number
	name: string
	event: string
	headBranch: string
	conclusion: string | null
	headSha: string
	url: string
	commitMessage: string
	commitAuthor: string
}

export type Job = { name: string; conclusion: string | null }

export type PullRequest = { number: number; authorLogin: string }

export type RunReport = {
	run: Run
	jobs: Job[]
	pullRequests: PullRequest[]
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
}

export type GraphQLRequest = {
	query: string
	variables: Record<string, unknown>
}

export type LinearTransport = (request: GraphQLRequest) => Promise<Response>

type Ports = { github: GitHub; linear: LinearTransport }

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

export const redMainIssue = ({
	run,
	jobs,
	pullRequests,
}: RunReport): IssueInput => ({
	teamId: TEAM_ID,
	projectId: PROJECT_ID,
	labelIds: [BUG_LABEL_ID],
	stateId: TODO_STATE_ID,
	title: `Red main: ${failedJobNames(jobs).join(", ")} at ${shortSha(run.headSha)}`,
	description: [
		`Run: ${run.url}`,
		`Commit: ${firstLine(run.commitMessage)}`,
		pullRequestLine(pullRequests),
		`Commit author: ${run.commitAuthor}`,
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

export const reportRedMain = async (
	runId: string,
	{ github, linear }: Ports,
): Promise<string> => {
	const run = await github.readRun(runId)
	const reason = skipReason(run)
	if (reason) return `no issue: ${reason}`
	const existing = await issueReportingRun(linear, run.url)
	if (existing) return `no issue: ${existing} already reports ${run.url}`
	const [jobs, pullRequests] = await Promise.all([
		github.readJobs(runId),
		github.readPullRequests(run.headSha),
	])
	const issue = await createIssue(
		linear,
		redMainIssue({ run, jobs, pullRequests }),
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
	html_url: string
	head_commit: { message: string; author: { name: string } } | null
}

type GitHubPullRequest = { number: number; user: { login: string } }

const createGitHub = (repository: string, token: string): GitHub => {
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
			return {
				id: run.id,
				name: run.name,
				event: run.event,
				headBranch: run.head_branch,
				conclusion: run.conclusion,
				headSha: run.head_sha,
				url: run.html_url,
				commitMessage: run.head_commit?.message ?? "",
				commitAuthor: run.head_commit?.author.name ?? "unknown",
			}
		},
		readJobs: async (runId) => {
			const { jobs } = await read<{ jobs: Job[] }>(
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
