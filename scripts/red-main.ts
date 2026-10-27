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
	createdAt: string
}

type Step = { name: string; conclusion: string | null }

export type Job = { name: string; conclusion: string | null; steps: Step[] }

export type PullRequest = { number: number; authorLogin: string }

export type QueuedPullRequest = PullRequest & { headSha: string }

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
	readQueueRuns: (run: Run) => Promise<Run[]>
	readPullRequest: (number: number) => Promise<QueuedPullRequest>
}

export type GraphQLRequest = {
	query: string
	variables: Record<string, unknown>
}

export type LinearTransport = (request: GraphQLRequest) => Promise<Response>

type Ports = {
	github: GitHub
	linear: LinearTransport
	pause?: (ms: number) => Promise<void>
}

type QueueEntry = { pullRequest: number; baseSha: string }

type QueuedRun = QueueEntry & { run: Run }

type LinearAnswer = {
	data?: Record<string, unknown>
	errors?: { message: string }[]
}

const TEAM_ID = "10814938-0dfc-41ad-9e16-bea303d81728"
const PROJECT_ID = "e5a723ee-03fa-46c8-8c73-2def41925fdb"
const BUG_LABEL_ID = "8b4d77ec-bddc-475e-9d19-fc581ef758ce"
const TODO_STATE_ID = "84f63beb-26f5-47ff-89e4-1c41e9128f6c"

const FAILED_JOB_CONCLUSIONS = ["failure", "timed_out"]

const FAILED_STEP_CONCLUSIONS = ["failure", "cancelled"]

const QUEUE_BRANCH = /^gh-readonly-queue\/main\/pr-(\d+)-([0-9a-f]{40})$/

const SETTLE_POLL_MS = 30_000

const SETTLE_MAX_POLLS = 60

const REQUEST_TIMEOUT_MS = 30_000

const ISSUES_REPORTING_RUN = `query IssuesReportingRun($teamId: ID!, $runUrl: String!) {
	issues(first: 1, filter: { team: { id: { eq: $teamId } }, description: { contains: $runUrl } }) {
		nodes { identifier }
	}
}`

const ISSUES_REPORTING_PULL_REQUEST_HEAD = `query IssuesReportingPullRequestHead($teamId: ID!, $titleEnd: String!, $headLine: String!) {
	issues(first: 1, filter: { team: { id: { eq: $teamId } }, state: { type: { nin: ["completed", "canceled"] } }, title: { endsWith: $titleEnd }, description: { contains: $headLine } }) {
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
}: RunReport): IssueInput => ({
	...FILED_IN,
	title: `Red main: ${failedJobNames(jobs).join(", ")} at ${shortSha(run.headSha)}`,
	description: [
		`Run: ${run.url}`,
		`Commit: ${firstLine(run.commitMessage)}`,
		pullRequestLine(pullRequests),
		`Commit author: ${run.commitAuthor}`,
		"Classify: flake or break",
	].join("\n\n"),
})

const parseQueueBranch = (branch: string): QueueEntry | undefined => {
	const match = QUEUE_BRANCH.exec(branch)
	if (!match?.[1] || !match[2]) return undefined
	return { pullRequest: Number(match[1]), baseSha: match[2] }
}

const queueEntryOf = (run: Run): QueueEntry => {
	const entry = parseQueueBranch(run.headBranch)
	if (!entry)
		throw new Error(
			`read the queue branch: "${run.headBranch}" is not gh-readonly-queue/main/pr-<N>-<sha>`,
		)
	return entry
}

const failedStepLine = (jobs: Job[], jobName: string) => {
	const steps = jobs.find((job) => job.name === jobName)?.steps ?? []
	const failedStep = steps.find((step) =>
		FAILED_STEP_CONCLUSIONS.includes(step.conclusion ?? ""),
	)
	return `Failed step: ${jobName} / ${failedStep?.name ?? "none recorded"}`
}

type EjectedReport = {
	entry: QueuedRun
	jobs: Job[]
	pullRequest: QueuedPullRequest
	batch: QueuedRun[]
}

const ejectedIssue = ({
	entry,
	jobs,
	pullRequest,
	batch,
}: EjectedReport): IssueInput => {
	const failedJobs = failedJobNames(jobs)
	return {
		...FILED_IN,
		title: `Ejected: ${failedJobs.join(", ")} at ${shortSha(entry.run.headSha)}, PR #${entry.pullRequest}`,
		description: [
			...failedJobs.map((jobName) => failedStepLine(jobs, jobName)),
			`Run: ${entry.run.url}`,
			pullRequestLine([pullRequest]),
			`PR head: ${pullRequest.headSha}`,
			`Batch: ${batch.map((member) => `#${member.pullRequest}`).join(", ")}`,
			`Reproduce on main at ${entry.baseSha} before classifying as pre-existing`,
		].join("\n\n"),
	}
}

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

const issueReportingPullRequestHead = async (
	linear: LinearTransport,
	pullRequest: QueuedPullRequest,
) => {
	const data = await askLinear(
		linear,
		"look up an issue for the pull request head",
		{
			query: ISSUES_REPORTING_PULL_REQUEST_HEAD,
			variables: {
				teamId: TEAM_ID,
				titleEnd: `PR #${pullRequest.number}`,
				headLine: `PR head: ${pullRequest.headSha}`,
			},
		},
	)
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

const settledRun = async (
	github: GitHub,
	pause: (ms: number) => Promise<void>,
	run: Run,
) => {
	let current = run
	for (let poll = 0; current.conclusion === null; poll++) {
		if (poll === SETTLE_MAX_POLLS)
			throw new Error(
				`wait for the earlier queue entry: run ${run.id} still runs after ${(SETTLE_MAX_POLLS * SETTLE_POLL_MS) / 60_000} minutes`,
			)
		await pause(SETTLE_POLL_MS)
		current = await github.readRun(String(run.id))
	}
	return current
}

type EarlierEntries = { reds: QueuedRun[]; brokenFirst?: QueuedRun }

const readEarlierEntries = async (
	github: GitHub,
	pause: (ms: number) => Promise<void>,
	entry: QueuedRun,
	queue: QueuedRun[],
	failedJobs: string[],
): Promise<EarlierEntries> => {
	const reds: QueuedRun[] = []
	let current = entry
	for (;;) {
		const listed = queue.find(
			(queued) => queued.run.headSha === current.baseSha,
		)
		if (!listed) return { reds }
		const earlier = {
			...listed,
			run: await settledRun(github, pause, listed.run),
		}
		if (earlier.run.conclusion !== "failure") return { reds }
		const earlierFailedJobs = failedJobNames(
			await github.readJobs(String(earlier.run.id)),
		)
		if (failedJobs.every((name) => earlierFailedJobs.includes(name)))
			return { reds, brokenFirst: earlier }
		reds.unshift(earlier)
		current = earlier
	}
}

const laterEntries = (entry: QueuedRun, queue: QueuedRun[]): QueuedRun[] =>
	queue
		.filter((queued) => queued.baseSha === entry.run.headSha)
		.flatMap((later) => [later, ...laterEntries(later, queue)])

const queuedRuns = (runs: Run[], workflowName: string): QueuedRun[] =>
	runs
		.filter((run) => run.name === workflowName)
		.flatMap((run) => {
			const entry = parseQueueBranch(run.headBranch)
			return entry ? [{ ...entry, run }] : []
		})

const reportEjected = async (
	run: Run,
	{ github, linear, pause = Bun.sleep }: Ports,
): Promise<string> => {
	if (run.conclusion !== "failure")
		return `no issue: run ${run.id} concluded ${run.conclusion}`
	const entry: QueuedRun = { ...queueEntryOf(run), run }
	const [jobs, runs] = await Promise.all([
		github.readJobs(String(run.id)),
		github.readQueueRuns(run),
	])
	const queue = queuedRuns(runs, run.name)
	const { reds, brokenFirst } = await readEarlierEntries(
		github,
		pause,
		entry,
		queue,
		failedJobNames(jobs),
	)
	if (brokenFirst)
		return `no issue: PR #${entry.pullRequest} follows PR #${brokenFirst.pullRequest} in its queue batch, which broke on the same jobs in ${brokenFirst.run.url}`
	const pullRequest = await github.readPullRequest(entry.pullRequest)
	const existing = await issueReportingPullRequestHead(linear, pullRequest)
	if (existing)
		return `no issue: ${existing} already reports PR #${pullRequest.number} at ${shortSha(pullRequest.headSha)}`
	const batch = [...reds, entry, ...laterEntries(entry, queue)]
	const issue = await createIssue(
		linear,
		ejectedIssue({ entry, jobs, pullRequest, batch }),
	)
	return `created ${issue.identifier} ${issue.url}`
}

export const reportRedMain = async (
	runId: string,
	ports: Ports,
): Promise<string> => {
	const { github, linear } = ports
	const run = await github.readRun(runId)
	if (run.name === "CI" && run.event === "merge_group")
		return reportEjected(run, ports)
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
	created_at: string
}

type GitHubPullRequest = { number: number; user: { login: string } }

type GitHubJob = {
	name: string
	conclusion: string | null
	steps?: Step[]
}

const QUEUE_WINDOW_MS = 3 * 60 * 60 * 1000

const toRun = (run: GitHubRun): Run => ({
	id: run.id,
	name: run.name,
	event: run.event,
	headBranch: run.head_branch,
	conclusion: run.conclusion,
	headSha: run.head_sha,
	url: run.html_url,
	commitMessage: run.head_commit?.message ?? "",
	commitAuthor: run.head_commit?.author.name ?? "unknown",
	createdAt: run.created_at,
})

const createdAround = (createdAt: string) => {
	const created = Date.parse(createdAt)
	const from = new Date(created - QUEUE_WINDOW_MS).toISOString()
	const to = new Date(created + QUEUE_WINDOW_MS).toISOString()
	return encodeURIComponent(`${from}..${to}`)
}

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
			return toRun(run)
		},
		readJobs: async (runId) => {
			const { jobs } = await read<{ jobs: GitHubJob[] }>(
				"read the jobs of the run",
				`/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
			)
			return jobs.map(({ name, conclusion, steps = [] }) => ({
				name,
				conclusion,
				steps: steps.map((step) => ({
					name: step.name,
					conclusion: step.conclusion,
				})),
			}))
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
		readQueueRuns: async (run) => {
			const { workflow_runs } = await read<{ workflow_runs: GitHubRun[] }>(
				"list the merge queue runs",
				`/actions/runs?event=merge_group&created=${createdAround(run.createdAt)}&per_page=100`,
			)
			return workflow_runs.map(toRun)
		},
		readPullRequest: async (number) => {
			const pullRequest = await read<
				GitHubPullRequest & { head: { sha: string } }
			>("read the pull request", `/pulls/${number}`)
			return {
				number: pullRequest.number,
				authorLogin: pullRequest.user.login,
				headSha: pullRequest.head.sha,
			}
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
