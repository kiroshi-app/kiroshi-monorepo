import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { pathsChangedSinceMain } from "./ci"

export const STORIES = "stories"

export const TESTS = "tests"

export type Verdict = { failures: string[]; warnings: string[] }

export type SuiteOutcome = { suite: string; red: boolean; items: string[] }

type ItemComparison = { area: string; committed: string[]; live: string[] }

type StoryComparison = { committed: string[]; live: string[] }

export const compareItems = ({
	area,
	committed,
	live,
}: ItemComparison): Verdict => {
	const committedItems = new Set(committed)
	const liveItems = new Set(live)
	return {
		failures: live
			.filter((item) => !committedItems.has(item))
			.map((item) => `${area}: reported but not in the baseline: ${item}`),
		warnings: committed
			.filter((item) => !liveItems.has(item))
			.map((item) => `${area}: baselined but no longer reported: ${item}`),
	}
}

export const compareStories = ({
	committed,
	live,
}: StoryComparison): Verdict => {
	const committedIds = new Set(committed)
	const liveIds = new Set(live)
	return {
		failures: [
			...live
				.filter((id) => !committedIds.has(id))
				.map((id) => `${STORIES}: reported but not in the baseline: ${id}`),
			...committed
				.filter((id) => !liveIds.has(id))
				.map(
					(id) => `${STORIES}: in the baseline but no longer reported: ${id}`,
				),
		],
		warnings: [],
	}
}

type Ownership = { area: string; committed: string[]; suites: string[] }

export const splitByOwner = ({ area, committed, suites }: Ownership) => {
	if (area !== TESTS) return { owned: committed, others: [] }
	const isOwned = (entry: string) =>
		suites.some((suite) => entry.startsWith(`${suite} :: `))
	return {
		owned: committed.filter(isOwned),
		others: committed.filter((entry) => !isOwned(entry)),
	}
}

export const assertRedSuitesAreAttributed = (outcomes: SuiteOutcome[]) => {
	const unattributed = outcomes
		.filter((outcome) => outcome.red && outcome.items.length === 0)
		.map((outcome) => outcome.suite)
	if (unattributed.length === 0) return
	throw new Error(
		`red with no attributable failure: ${unattributed.join(", ")}`,
	)
}

export const mergeVerdicts = (verdicts: Verdict[]): Verdict => ({
	failures: verdicts.flatMap((verdict) => verdict.failures),
	warnings: verdicts.flatMap((verdict) => verdict.warnings),
})

export const withOrdinals = (keys: string[]): string[] => {
	const seen = new Map<string, number>()
	return [...keys].sort().map((key) => {
		const rank = (seen.get(key) ?? 0) + 1
		seen.set(key, rank)
		return rank === 1 ? key : `${key} #${rank}`
	})
}

const REPO = fileURLToPath(new URL("..", import.meta.url))

const BASELINES = join(REPO, "baselines")

const SIDECAR = join(REPO, "apps/app/sidecar")

const UI = join(REPO, "packages/ui")

const KNIP = "knip@6.37.0"

const UPDATE = "bun run baseline:update"

type VitestAssertion = {
	fullName: string
	status: string
}

type VitestFile = {
	name: string
	status: string
	message?: string
	assertionResults: VitestAssertion[]
}

type VitestReport = { success: boolean; testResults: VitestFile[] }

type VitestSuite = {
	name: string
	filter: string
	script: string
	project?: string
}

type UnitSuite = VitestSuite & { root: string }

const APP_SUITE: VitestSuite = {
	name: "app",
	filter: "app",
	script: "test:unit",
}

const UI_SUITE: VitestSuite = {
	name: "ui",
	filter: "@workspace/ui",
	script: "test",
	project: "unit",
}

const STORYBOOK_SUITE: VitestSuite = {
	name: "storybook",
	filter: "@workspace/ui",
	script: "test",
	project: "storybook",
}

const SIDECAR_SUITE = "sidecar"

const VITEST_SUITES: VitestSuite[] = [
	APP_SUITE,
	UI_SUITE,
	{ name: "website", filter: "website", script: "test" },
]

const UNIT_SUITES: UnitSuite[] = [
	{ ...APP_SUITE, project: "unit", root: "apps/app" },
	{ ...UI_SUITE, root: "packages/ui" },
]

const TEST_FILE = /\.test\.tsx?$/

type ChangedPaths = { paths: string[]; root: string }

export const changedTestFiles = ({ paths, root }: ChangedPaths) =>
	paths.filter(
		(path) => path.startsWith(`${root}/src/`) && TEST_FILE.test(path),
	)

type Run = { command: string[]; cwd: string }

type CapturedRun = Run & { label: string }

const unreadable = (label: string) =>
	new Error(`${label} ended without a readable report`)

const runInherited = ({ command, cwd }: Run) =>
	Bun.spawnSync({ cmd: command, cwd, stdout: "inherit", stderr: "inherit" })
		.exitCode

const runCaptured = ({ command, cwd, label }: CapturedRun) => {
	const finished = Bun.spawnSync({
		cmd: command,
		cwd,
		stdout: "pipe",
		stderr: "inherit",
	})
	const written = finished.stdout.toString()
	if (written.trim().length === 0) throw unreadable(label)
	return written
}

type ReportFile = { path: string; label: string }

const readReport = ({ path, label }: ReportFile) => {
	if (!existsSync(path)) throw unreadable(label)
	return readFileSync(path, "utf8")
}

const repoPath = (path: string, from: string) =>
	relative(REPO, resolve(from, path))

type SuiteRun = { suite: VitestSuite; into: string; files?: string[] }

const vitestReport = ({ suite, into, files = [] }: SuiteRun) => {
	const path = join(into, `${suite.name}.json`)
	const label = `the ${suite.name} vitest suite`
	const exitCode = runInherited({
		command: [
			"bun",
			"run",
			`--filter=${suite.filter}`,
			suite.script,
			"--",
			...(suite.project ? [`--project=${suite.project}`] : []),
			...files.map((file) => join(REPO, file)),
			...(files.length > 0 ? ["--passWithNoTests"] : []),
			"--reporter=default",
			"--reporter=json",
			`--outputFile.json=${path}`,
		],
		cwd: REPO,
	})
	const report = JSON.parse(readReport({ path, label })) as VitestReport
	if (!Array.isArray(report.testResults)) throw unreadable(label)
	if (report.testResults.length === 0 && files.length === 0) {
		throw unreadable(label)
	}
	return { report, red: exitCode !== 0 || report.success === false }
}

type SuiteReport = { suite: string; report: VitestReport }

const collapse = (text: string) =>
	text.trim().replace(/\s+/g, " ").slice(0, 120)

type FileInSuite = { suite: string; file: VitestFile }

const failuresIn = ({ suite, file }: FileInSuite) => {
	const named = `${suite} :: ${repoPath(file.name, REPO)}`
	const failed = file.assertionResults.filter(
		(assertion) => assertion.status === "failed",
	)
	if (failed.length > 0) {
		return failed.map((assertion) => `${named} :: ${assertion.fullName}`)
	}
	if (file.status !== "failed") return []
	return [`${named} :: ${collapse(file.message ?? "failed without a message")}`]
}

export const vitestFailures = ({ suite, report }: SuiteReport) =>
	report.testResults.flatMap((file) => failuresIn({ suite, file }))

const TESTED_STORY_TAG = "test"

type StorybookIndexEntry = { id: string; type: string; tags?: string[] }

export type StorybookIndex = { entries: Record<string, StorybookIndexEntry> }

export const testedStoryIds = (index: StorybookIndex) =>
	Object.values(index.entries)
		.filter(
			(entry) =>
				entry.type === "story" && (entry.tags ?? []).includes(TESTED_STORY_TAG),
		)
		.map((entry) => entry.id)

const indexedStoryIds = (into: string) => {
	const path = join(into, "storybook-index.json")
	const label = "the storybook index"
	const exitCode = runInherited({
		command: [
			join(UI, "node_modules/.bin/storybook"),
			"index",
			`--output-file=${path}`,
			"--quiet",
			"--disable-telemetry",
		],
		cwd: UI,
	})
	if (exitCode !== 0) throw new Error(`${label} exited with ${exitCode}`)
	const index = JSON.parse(readReport({ path, label })) as StorybookIndex
	if (typeof index.entries !== "object" || index.entries === null) {
		throw unreadable(label)
	}
	return testedStoryIds(index)
}

const XML_ENTITIES: Record<string, string> = {
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
	"&amp;": "&",
}

const unescapeXml = (text: string) =>
	text.replace(
		/&(lt|gt|quot|apos|amp);/g,
		(entity) => XML_ENTITIES[entity] ?? entity,
	)

type TagAttribute = { tag: string; name: string }

const attributeOf = ({ tag, name }: TagAttribute) =>
	unescapeXml(new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? "")

const sidecarOutcome = (into: string): SuiteOutcome => {
	const path = join(into, "sidecar.xml")
	const label = "the sidecar test suite"
	const exitCode = runInherited({
		command: [
			"bun",
			"run",
			"--filter=sidecar",
			"test",
			"--",
			"--reporter=junit",
			`--reporter-outfile=${path}`,
		],
		cwd: REPO,
	})
	const written = readReport({ path, label })
	if (!/<testsuites\b[^>]*\btests="\d+"/.test(written)) throw unreadable(label)
	const items = [
		...written.matchAll(/<testcase\b([^>]*)>\s*<(?:failure|error)\b/g),
	].map((match) => {
		const tag = match[1] ?? ""
		const file = repoPath(attributeOf({ tag, name: "file" }), SIDECAR)
		return `${SIDECAR_SUITE} :: ${file} :: ${attributeOf({ tag, name: "name" })}`
	})
	return { suite: SIDECAR_SUITE, red: exitCode !== 0, items }
}

type BiomeDiagnostic = {
	category: string
	location: { path?: string; start?: { line: number } }
}

type BiomeReport = {
	summary: { diagnosticsNotPrinted: number }
	diagnostics: BiomeDiagnostic[]
}

type SourceSpot = { path: string; line: number }

const sourceLine = ({ path, line }: SourceSpot) => {
	const absolute = join(REPO, path)
	if (!existsSync(absolute)) return ""
	return collapse(readFileSync(absolute, "utf8").split("\n")[line - 1] ?? "")
}

const biomeItems = () => {
	const label = "biome"
	const report = JSON.parse(
		runCaptured({
			command: [
				"bunx",
				"biome",
				"lint",
				"--reporter=json",
				"--max-diagnostics=10000",
			],
			cwd: REPO,
			label,
		}),
	) as BiomeReport
	if (!Array.isArray(report.diagnostics)) throw unreadable(label)
	if (report.summary.diagnosticsNotPrinted > 0) {
		throw new Error(
			`${label} withheld ${report.summary.diagnosticsNotPrinted} diagnostics from its report`,
		)
	}
	return report.diagnostics.map((diagnostic) => {
		const path = diagnostic.location.path ?? "<unknown>"
		const line = sourceLine({
			path,
			line: diagnostic.location.start?.line ?? 0,
		})
		return `${diagnostic.category} :: ${path} :: ${line}`
	})
}

type KnipFinding = { name: string }

type KnipIssue = { file: string } & Record<string, unknown>

const findingsOf = (issue: KnipIssue) =>
	Object.entries(issue).filter(
		(entry): entry is [string, KnipFinding[]] =>
			entry[0] !== "file" && Array.isArray(entry[1]),
	)

const knipItems = () => {
	const label = "knip"
	const report = JSON.parse(
		runCaptured({
			command: ["bunx", KNIP, "--reporter", "json", "--no-exit-code"],
			cwd: REPO,
			label,
		}),
	) as { issues: KnipIssue[] }
	if (!Array.isArray(report.issues)) throw unreadable(label)
	return report.issues.flatMap((issue) =>
		findingsOf(issue).flatMap(([type, found]) =>
			found.map(({ name }) =>
				name === issue.file
					? `${type} :: ${issue.file}`
					: `${type} :: ${issue.file} :: ${name}`,
			),
		),
	)
}

const readItems = (area: string) => {
	const path = join(BASELINES, `${area}.txt`)
	if (!existsSync(path)) return []
	return readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
}

type AreaItems = { area: string; items: string[] }

const writeItems = ({ area, items }: AreaItems) => {
	mkdirSync(BASELINES, { recursive: true })
	const sorted = [...new Set(items)].sort()
	writeFileSync(
		join(BASELINES, `${area}.txt`),
		sorted.length === 0 ? "" : `${sorted.join("\n")}\n`,
	)
}

type Live = Record<string, string[]>

type SuitesRun = { suites: VitestSuite[]; into: string }

const runSuites = ({ suites, into }: SuitesRun) =>
	suites.map((suite) => ({ suite, ...vitestReport({ suite, into }) }))

type RanSuite = ReturnType<typeof runSuites>[number]

const outcomeOf = ({ suite, report, red }: RanSuite): SuiteOutcome => ({
	suite: suite.name,
	red,
	items: vitestFailures({ suite: suite.name, report }),
})

const attributedFailures = (outcomes: SuiteOutcome[]) => {
	assertRedSuitesAreAttributed(outcomes)
	return outcomes.flatMap((outcome) => outcome.items)
}

const newReportFolder = () => mkdtempSync(join(tmpdir(), "kiroshi-baseline-"))

const collectVitest = (): Live => {
	const into = newReportFolder()
	const ran = runSuites({ suites: VITEST_SUITES, into })
	return {
		[TESTS]: attributedFailures([...ran.map(outcomeOf), sidecarOutcome(into)]),
		[STORIES]: indexedStoryIds(into),
	}
}

const collectStorybook = (): Live => {
	const ran = runSuites({ suites: [STORYBOOK_SUITE], into: newReportFolder() })
	return { [TESTS]: attributedFailures(ran.map(outcomeOf)) }
}

const existingChangedPaths = () =>
	pathsChangedSinceMain().filter((path) => existsSync(join(REPO, path)))

type ChangedRun = { suite: UnitSuite; paths: string[]; into: string }

const runChangedTests = ({ suite, paths, into }: ChangedRun) => {
	const files = changedTestFiles({ paths, root: suite.root })
	console.log(
		`baseline  ${suite.name} unit test files changed since origin/main: ${files.join(", ") || "none"}`,
	)
	if (files.length === 0) return []
	return [{ suite, ...vitestReport({ suite, into, files }) }]
}

const collectChanged = (): Live => {
	const into = newReportFolder()
	const paths = existingChangedPaths()
	const ran = UNIT_SUITES.flatMap((suite) =>
		runChangedTests({ suite, paths, into }),
	)
	return { [TESTS]: attributedFailures(ran.map(outcomeOf)) }
}

const collectLint = (): Live => ({
	biome: biomeItems(),
	knip: knipItems(),
})

type ScopeRun = { collect: () => Live; suites: string[] }

const suiteNames = (suites: VitestSuite[]) => suites.map((suite) => suite.name)

const SCOPES = {
	vitest: {
		collect: collectVitest,
		suites: [...suiteNames(VITEST_SUITES), SIDECAR_SUITE],
	},
	storybook: {
		collect: collectStorybook,
		suites: suiteNames([STORYBOOK_SUITE]),
	},
	lint: { collect: collectLint, suites: [] },
	changed: { collect: collectChanged, suites: suiteNames(UNIT_SUITES) },
} satisfies Record<string, ScopeRun>

type Scope = keyof typeof SCOPES

const FULL_SCOPES: Scope[] = ["vitest", "storybook", "lint"]

const isScope = (name: string): name is Scope => name in SCOPES

const requestedScopes = (argv: string[]): Scope[] => {
	const named = argv.filter((argument) => !argument.startsWith("-"))
	const unknown = named.find((name) => !isScope(name))
	if (unknown) {
		throw new Error(
			`unknown scope "${unknown}", expected one of ${Object.keys(SCOPES).join(", ")}`,
		)
	}
	const chosen = named.filter(isScope)
	return chosen.length === 0 ? FULL_SCOPES : chosen
}

const assertChangedScopeChecksAlone = (scopes: Scope[], argv: string[]) => {
	if (!scopes.includes("changed")) return
	if (!scopes.includes("vitest") && !argv.includes("--prune")) return
	throw new Error(
		"the changed scope reads a subset of the vitest scope: run it without vitest and without --prune",
	)
}

type Collected = { live: Live; suites: string[] }

type OwnedArea = AreaItems & { suites: string[] }

const compareArea = ({ area, items, suites }: OwnedArea) => {
	const { owned: committed } = splitByOwner({
		area,
		committed: readItems(area),
		suites,
	})
	return area === STORIES
		? compareStories({ committed, live: items })
		: compareItems({ area, committed, live: items })
}

const check = ({ live, suites }: Collected) => {
	const verdict = mergeVerdicts(
		Object.entries(live).map(([area, items]) =>
			compareArea({ area, items, suites }),
		),
	)
	for (const warning of verdict.warnings) console.warn(`warning  ${warning}`)
	if (verdict.failures.length === 0) {
		console.log("baseline  every reported item is recorded")
		return 0
	}
	for (const failure of verdict.failures) console.error(`failure  ${failure}`)
	console.error(`baseline  record them with ${UPDATE}, or fix them`)
	return 1
}

const update = (live: Live) => {
	for (const [area, items] of Object.entries(live)) {
		const kept = area === STORIES ? [] : readItems(area)
		writeItems({ area, items: [...kept, ...items] })
	}
	return 0
}

const prune = ({ live, suites }: Collected) => {
	for (const [area, items] of Object.entries(live)) {
		const { others } = splitByOwner({
			area,
			committed: readItems(area),
			suites,
		})
		writeItems({ area, items: [...others, ...items] })
	}
	return 0
}

const collect = (scopes: Scope[]): Collected => {
	const live: Live = {}
	for (const scope of scopes) {
		for (const [area, found] of Object.entries(SCOPES[scope].collect())) {
			live[area] = [...(live[area] ?? []), ...withOrdinals(found)]
		}
	}
	return { live, suites: scopes.flatMap((scope) => SCOPES[scope].suites) }
}

const main = (argv: string[]) => {
	const scopes = requestedScopes(argv)
	assertChangedScopeChecksAlone(scopes, argv)
	const collected = collect(scopes)
	if (argv.includes("--prune")) return prune(collected)
	if (argv.includes("--update")) return update(collected.live)
	return check(collected)
}

if (import.meta.main) {
	try {
		process.exit(main(process.argv.slice(2)))
	} catch (failure) {
		console.error(`baseline  ${(failure as Error).message}`)
		process.exit(1)
	}
}
