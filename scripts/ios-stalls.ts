const SLOW_QUERY_SECONDS = 10

const TIMED_OUT_QUERY = "Timed out while evaluating UI query"

const QUERY_STEP =
	/^(Checking existence of|Find the|Get number of matches for|Get all elements|Requesting snapshot)/

const TIMESTAMPED = /^﻿?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/
const TEST_STARTED = /^Test Case '-\[(\S+) (\S+)\]' started\.$/
const TEST_ENDED =
	/^Test Case '-\[(\S+) (\S+)\]' (?:passed|failed|skipped) \((\d+(?:\.\d+)?) seconds\)\.$/
const STEP = /^\s*t =\s+(\d+(?:\.\d+)?)s\s+(.*)$/

type Stall = {
	test: string
	seconds: number
	offsetSeconds: number
	hasTimedOutQuery: boolean
	slowestQuerySeconds: number
}

type LogLine = { at: number; text: string }

type TestRun = {
	test: string
	startedAt: number
	lines: string[]
	seconds?: number
}

const logLines = (log: string): LogLine[] =>
	log.split("\n").flatMap((line) => {
		const match = TIMESTAMPED.exec(line.trimEnd())
		if (!match) return []
		return [{ at: Date.parse(match[1]), text: match[2] }]
	})

const testRuns = (lines: LogLine[]) => {
	const runs: TestRun[] = []
	let current: TestRun | undefined
	for (const { at, text } of lines) {
		const started = TEST_STARTED.exec(text)
		if (started) {
			current = {
				test: `${started[1]}/${started[2]}`,
				startedAt: at,
				lines: [],
			}
			runs.push(current)
			continue
		}
		if (!current) continue
		const ended = TEST_ENDED.exec(text)
		if (ended) {
			current.seconds = Number(ended[3])
			current = undefined
			continue
		}
		current.lines.push(text)
	}
	return runs
}

const slowestQuerySeconds = (lines: string[]) => {
	const steps = lines.flatMap((line) => {
		const match = STEP.exec(line)
		return match ? [{ t: Number(match[1]), title: match[2] }] : []
	})
	return steps.reduce((slowest, step, index) => {
		const next = steps[index + 1]
		if (!next || !QUERY_STEP.test(step.title)) return slowest
		return Math.max(slowest, next.t - step.t)
	}, 0)
}

const lastTimestamp = (lines: LogLine[]) => lines.at(-1)?.at ?? 0

const round = (seconds: number) => Math.round(seconds * 10) / 10

export const findStalls = (log: string): Stall[] => {
	const lines = logLines(log)
	const runs = testRuns(lines)
	const firstStart = runs[0]?.startedAt ?? 0
	return runs.flatMap((run) => {
		const hasTimedOutQuery = run.lines.some((line) =>
			line.includes(TIMED_OUT_QUERY),
		)
		const slowest = slowestQuerySeconds(run.lines)
		if (!hasTimedOutQuery && slowest <= SLOW_QUERY_SECONDS) return []
		return [
			{
				test: run.test,
				seconds:
					run.seconds ?? round((lastTimestamp(lines) - run.startedAt) / 1000),
				offsetSeconds: round((run.startedAt - firstStart) / 1000),
				hasTimedOutQuery,
				slowestQuerySeconds: round(slowest),
			},
		]
	})
}

type JobEnvironment = {
	imageVersion?: string
	xcodeVersion?: string
	simulatorRuntime?: string
	gateToFirstTestSeconds?: number
}

const firstCapture = (log: string, pattern: RegExp) => pattern.exec(log)?.[1]

export const readJobEnvironment = (log: string): JobEnvironment => {
	const lines = logLines(log)
	const gate = lines.find(({ text }) =>
		text.startsWith("##[group]Run bun scripts/ci.ts ios"),
	)
	const firstTest = lines.find(({ text }) => TEST_STARTED.test(text))
	return {
		imageVersion: firstCapture(
			log,
			/##\[group\]Runner Image\s+\S+ Image: \S+\s+\S+ Version: (\S+)/,
		),
		xcodeVersion: firstCapture(
			log,
			/\/Applications\/Xcode_([^/]+)\.app\/Contents/,
		),
		simulatorRuntime: firstCapture(
			log,
			/SimulatorRuntime-v(\d+\.\d+\.\d+\.\d+)/,
		),
		gateToFirstTestSeconds:
			gate && firstTest ? round((firstTest.at - gate.at) / 1000) : undefined,
	}
}

type JobStep = {
	name: string
	number: number
	started_at: string | null
	completed_at: string | null
}

type ApiJob = {
	id: number
	run_id: number
	name: string
	status: string
	conclusion: string | null
	steps: JobStep[]
}

const SHARD_JOB = /^ios \((\d+)\)$/

const setupSteps = (steps: JobStep[]) => {
	const gate = steps.find(({ name }) => name === "Gate")
	return steps
		.filter(({ number }) => gate === undefined || number < gate.number)
		.map(({ name, started_at, completed_at }) => ({
			name,
			seconds:
				started_at && completed_at
					? (Date.parse(completed_at) - Date.parse(started_at)) / 1000
					: undefined,
		}))
}

const gh = async (args: string[]) => {
	const child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" })
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	])
	if (exitCode !== 0) {
		throw new Error(
			`gh ${args.join(" ")} exited with ${exitCode}: ${stderr.trim()}`,
		)
	}
	return stdout
}

const RUN_LIMIT = "30"

const listRunIds = async (filter: string[]) => {
	const runs: { databaseId: number }[] = JSON.parse(
		await gh([
			"run",
			"list",
			"--workflow",
			"ci.yml",
			"--limit",
			RUN_LIMIT,
			"--json",
			"databaseId",
			...filter,
		]),
	)
	return runs.map(({ databaseId }) => databaseId)
}

const listShardJobs = async (runId: number) => {
	const { jobs }: { jobs: ApiJob[] } = JSON.parse(
		await gh([
			"api",
			`repos/{owner}/{repo}/actions/runs/${runId}/jobs?per_page=100`,
		]),
	)
	return jobs.filter(
		({ name, status, conclusion }) =>
			SHARD_JOB.test(name) &&
			status === "completed" &&
			conclusion !== "skipped",
	)
}

const seconds = (value: number | undefined) =>
	value === undefined ? "?" : `${Math.round(value)}s`

const describeJob = async (job: ApiJob, event: string) => {
	const shard = SHARD_JOB.exec(job.name)?.[1]
	const setup = setupSteps(job.steps)
		.map(({ name, seconds: took }) => `${name} ${seconds(took)}`)
		.join("; ")
	const head = `${job.run_id} | ${event} | ${shard} | ${job.conclusion}`
	try {
		const log = await gh([
			"api",
			"--allow-escape-sequences",
			`repos/{owner}/{repo}/actions/jobs/${job.id}/logs`,
		])
		const environment = readJobEnvironment(log)
		const stalls = findStalls(log)
		return `${head} | ${environment.imageVersion ?? "?"} | ${environment.xcodeVersion ?? "?"} | ${environment.simulatorRuntime ?? "?"} | ${setup} | ${seconds(environment.gateToFirstTestSeconds)} | ${stalls.length} | ${stalls[0] ? seconds(stalls[0].offsetSeconds) : "-"}`
	} catch (error) {
		return `${head} | log unreadable: ${error instanceof Error ? error.message : String(error)} | ${setup}`
	}
}

const printInventory = async () => {
	console.log(
		"run | event | shard | conclusion | image | xcode | runtime | setup steps | gate to first test | stalls | first stall offset",
	)
	const sources = [
		{ event: "push", filter: ["--branch", "main", "--event", "push"] },
		{ event: "pull_request", filter: ["--event", "pull_request"] },
	]
	for (const { event, filter } of sources) {
		for (const runId of await listRunIds(filter)) {
			const jobs = await listShardJobs(runId)
			for (const row of await Promise.all(
				jobs.map((job) => describeJob(job, event)),
			)) {
				console.log(row)
			}
		}
	}
}

const printStalls = async (logPath: string) => {
	const log = await Bun.file(logPath).text()
	console.log(JSON.stringify(findStalls(log), null, "\t"))
}

if (import.meta.main) {
	const logPath = process.argv[2]
	await (logPath ? printStalls(logPath) : printInventory())
}
