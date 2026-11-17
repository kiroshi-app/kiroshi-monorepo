const SLOW_QUERY_SECONDS = 10

const WINDOW_MINUTES = 5

const TOP_PROCESS_COUNT = 3

const TIMED_OUT_QUERY = "Timed out while evaluating UI query"

const QUERY_STEP =
	/^(Checking existence of|Find the|Get number of matches for|Get all elements|Requesting snapshot)/

const TIMESTAMPED = /^﻿?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/
const TEST_STARTED = /^Test Case '-\[(\S+) (\S+)\]' started\.$/
const TEST_ENDED =
	/^Test Case '-\[(\S+) (\S+)\]' (?:passed|failed|skipped) \((\d+(?:\.\d+)?) seconds\)\.$/
const STEP = /^\s*t =\s+(\d+(?:\.\d+)?)s\s+(.*)$/

const SNAPSHOT_STARTED = /^=== sample (\S+)$/
const RUNNER_TOP_SECTION = "--- runner top"
const TOP_ROW = /^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+\S+\s+\S+$/

type Stall = {
	test: string
	seconds: number
	offsetSeconds: number
	startedAt: number
	hasTimedOutQuery: boolean
	slowestQuerySeconds: number
}

type LogLine = { at: number; text: string }

type TestRun = {
	test: string
	startedAt: number
	lines: LogLine[]
	seconds?: number
}

type QueryStep = { at: number; seconds: number }

const logLines = (log: string): LogLine[] =>
	log.split("\n").flatMap((line) => {
		const match = TIMESTAMPED.exec(line.trimEnd())
		if (!match) return []
		return [{ at: Date.parse(match[1]), text: match[2] }]
	})

const testRuns = (lines: LogLine[]) => {
	const runs: TestRun[] = []
	let current: TestRun | undefined
	for (const line of lines) {
		const started = TEST_STARTED.exec(line.text)
		if (started) {
			current = {
				test: `${started[1]}/${started[2]}`,
				startedAt: line.at,
				lines: [],
			}
			runs.push(current)
			continue
		}
		if (!current) continue
		const ended = TEST_ENDED.exec(line.text)
		if (ended) {
			current.seconds = Number(ended[3])
			current = undefined
			continue
		}
		current.lines.push(line)
	}
	return runs
}

const slowestQuery = (lines: LogLine[]) => {
	const steps = lines.flatMap(({ at, text }) => {
		const match = STEP.exec(text)
		return match ? [{ at, t: Number(match[1]), title: match[2] }] : []
	})
	return steps.reduce<QueryStep | undefined>((slowest, step, index) => {
		const next = steps[index + 1]
		if (!next || !QUERY_STEP.test(step.title)) return slowest
		const seconds = next.t - step.t
		if (slowest && slowest.seconds >= seconds) return slowest
		return { at: step.at, seconds }
	}, undefined)
}

const lastTimestamp = (lines: LogLine[]) => lines.at(-1)?.at ?? 0

const round = (seconds: number) => Math.round(seconds * 10) / 10

export const findStalls = (log: string): Stall[] => {
	const lines = logLines(log)
	const runs = testRuns(lines)
	const firstStart = runs[0]?.startedAt ?? 0
	return runs.flatMap((run) => {
		const hasTimedOutQuery = run.lines.some(({ text }) =>
			text.includes(TIMED_OUT_QUERY),
		)
		const slowest = slowestQuery(run.lines)
		const slowestSeconds = slowest?.seconds ?? 0
		if (!hasTimedOutQuery && slowestSeconds <= SLOW_QUERY_SECONDS) return []
		return [
			{
				test: run.test,
				seconds:
					run.seconds ?? round((lastTimestamp(lines) - run.startedAt) / 1000),
				offsetSeconds: round((run.startedAt - firstStart) / 1000),
				startedAt: slowest?.at ?? run.startedAt,
				hasTimedOutQuery,
				slowestQuerySeconds: round(slowestSeconds),
			},
		]
	})
}

const uiTestStarts = (log: string) =>
	testRuns(logLines(log))
		.filter(({ lines }) => lines.some(({ text }) => STEP.test(text)))
		.map(({ startedAt }) => startedAt)

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

const bootStartedAt = (steps: JobStep[]) => {
	const started = steps.find(({ name }) =>
		name.startsWith("Boot the simulator"),
	)?.started_at
	return started ? Date.parse(started) : undefined
}

export const stallOffsetsAfterBoot = (steps: JobStep[], log: string) => {
	const boot = bootStartedAt(steps)
	if (boot === undefined) return undefined
	return findStalls(log).map(({ startedAt }) =>
		Math.round((startedAt - boot) / 1000),
	)
}

type JobTimeline = {
	bootStartedAt: number
	testStarts: number[]
	stallStarts: number[]
}

export const jobTimeline = (
	steps: JobStep[],
	log: string,
): JobTimeline | undefined => {
	const boot = bootStartedAt(steps)
	if (boot === undefined) return undefined
	return {
		bootStartedAt: boot,
		testStarts: uiTestStarts(log),
		stallStarts: findStalls(log).map(({ startedAt }) => startedAt),
	}
}

type WindowCount = { fromMinute: number; tests: number; stalls: number }

const windowAfterBoot = (boot: number, at: number) =>
	Math.floor((at - boot) / 60_000 / WINDOW_MINUTES) * WINDOW_MINUTES

export const countByWindowAfterBoot = (timelines: JobTimeline[]) => {
	const windows = new Map<number, WindowCount>()
	const windowAt = (fromMinute: number) => {
		const known = windows.get(fromMinute)
		if (known) return known
		const created = { fromMinute, tests: 0, stalls: 0 }
		windows.set(fromMinute, created)
		return created
	}
	for (const { bootStartedAt, testStarts, stallStarts } of timelines) {
		for (const at of testStarts)
			windowAt(windowAfterBoot(bootStartedAt, at)).tests++
		for (const at of stallStarts)
			windowAt(windowAfterBoot(bootStartedAt, at)).stalls++
	}
	return [...windows.values()].sort((a, b) => a.fromMinute - b.fromMinute)
}

type ProcessSample = { pid: number; command: string; cpu: number }

type Snapshot = { at: number; processes: ProcessSample[] }

const readSnapshots = (sampler: string) => {
	const snapshots: Snapshot[] = []
	let isInRunnerTop = false
	for (const line of sampler.split("\n").map((text) => text.trimEnd())) {
		const started = SNAPSHOT_STARTED.exec(line)
		if (started) {
			snapshots.push({ at: Date.parse(started[1]), processes: [] })
			isInRunnerTop = false
			continue
		}
		if (line.startsWith("--- ")) {
			isInRunnerTop = line === RUNNER_TOP_SECTION
			continue
		}
		const row = TOP_ROW.exec(line)
		const current = snapshots.at(-1)
		if (!isInRunnerTop || !row || !current) continue
		current.processes.push({
			pid: Number(row[1]),
			command: row[2],
			cpu: Number(row[3]),
		})
	}
	return snapshots
}

const nearestSnapshot = (snapshots: Snapshot[], at: number) =>
	snapshots.reduce<Snapshot | undefined>(
		(nearest, snapshot) =>
			nearest && Math.abs(nearest.at - at) <= Math.abs(snapshot.at - at)
				? nearest
				: snapshot,
		undefined,
	)

export const topProcessesAtStalls = (log: string, sampler: string) => {
	const snapshots = readSnapshots(sampler)
	return findStalls(log).map(({ test, startedAt }) => {
		const snapshot = nearestSnapshot(snapshots, startedAt)
		return {
			test,
			stallStartedAt: startedAt,
			snapshotAt: snapshot?.at,
			processes: [...(snapshot?.processes ?? [])]
				.sort((a, b) => b.cpu - a.cpu)
				.slice(0, TOP_PROCESS_COUNT),
		}
	})
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

const shownSeconds = (value: number | undefined) =>
	value === undefined ? "?" : `${Math.round(value)}s`

type JobReport = { row: string; timeline?: JobTimeline }

const describeJob = async (job: ApiJob, event: string): Promise<JobReport> => {
	const shard = SHARD_JOB.exec(job.name)?.[1]
	const setup = setupSteps(job.steps)
		.map(({ name, seconds }) => `${name} ${shownSeconds(seconds)}`)
		.join("; ")
	const head = `${job.run_id} | ${event} | ${shard} | ${job.conclusion}`
	try {
		const log = await gh([
			"api",
			"--allow-escape-sequences",
			`repos/{owner}/{repo}/actions/jobs/${job.id}/logs`,
		])
		const environment = readJobEnvironment(log)
		const offsets = stallOffsetsAfterBoot(job.steps, log)
		const stalls = findStalls(log)
		const shownOffsets =
			offsets === undefined
				? "no boot step"
				: offsets.map(shownSeconds).join(" ") || "-"
		return {
			row: `${head} | ${environment.imageVersion ?? "?"} | ${environment.xcodeVersion ?? "?"} | ${environment.simulatorRuntime ?? "?"} | ${setup} | ${shownSeconds(environment.gateToFirstTestSeconds)} | ${stalls.length} | ${shownOffsets}`,
			timeline: jobTimeline(job.steps, log),
		}
	} catch (error) {
		return {
			row: `${head} | log unreadable: ${error instanceof Error ? error.message : String(error)} | ${setup}`,
		}
	}
}

const printWindows = (timelines: JobTimeline[]) => {
	console.log("\nminutes after boot | stalls/tests")
	for (const { fromMinute, tests, stalls } of countByWindowAfterBoot(
		timelines,
	)) {
		console.log(
			`${fromMinute}-${fromMinute + WINDOW_MINUTES} | ${stalls}/${tests}`,
		)
	}
}

const printInventory = async () => {
	console.log(
		"run | event | shard | conclusion | image | xcode | runtime | setup steps | gate to first test | stalls | stall offsets after boot",
	)
	const sources = [
		{ event: "push", filter: ["--branch", "main", "--event", "push"] },
		{ event: "pull_request", filter: ["--event", "pull_request"] },
	]
	const timelines: JobTimeline[] = []
	for (const { event, filter } of sources) {
		for (const runId of await listRunIds(filter)) {
			const jobs = await listShardJobs(runId)
			for (const { row, timeline } of await Promise.all(
				jobs.map((job) => describeJob(job, event)),
			)) {
				console.log(row)
				if (timeline) timelines.push(timeline)
			}
		}
	}
	printWindows(timelines)
}

const printStalls = async (logPath: string) => {
	const log = await Bun.file(logPath).text()
	console.log(JSON.stringify(findStalls(log), null, "\t"))
}

const isoOf = (at: number | undefined) =>
	at === undefined ? "no snapshot" : new Date(at).toISOString()

const printTopProcesses = async (logPath: string, samplerPath: string) => {
	const [log, sampler] = await Promise.all([
		Bun.file(logPath).text(),
		Bun.file(samplerPath).text(),
	])
	for (const stall of topProcessesAtStalls(log, sampler)) {
		const processes = stall.processes
			.map(({ command, pid, cpu }) => `${command} (${pid}) ${cpu}%`)
			.join(", ")
		console.log(
			`${isoOf(stall.stallStartedAt)} ${stall.test} | snapshot ${isoOf(stall.snapshotAt)} | ${processes}`,
		)
	}
}

if (import.meta.main) {
	const [logPath, samplerPath] = process.argv.slice(2)
	if (logPath && samplerPath) await printTopProcesses(logPath, samplerPath)
	else if (logPath) await printStalls(logPath)
	else await printInventory()
}
