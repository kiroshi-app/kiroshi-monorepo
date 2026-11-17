import { describe, expect, it } from "vitest"

type Raise = {
	file: string
	call: string
	facts: string
}

type RaiserWithoutError = {
	file: string
	call: string
	why: string
}

const APP_SOURCES: Record<string, string> = import.meta.glob(
	[
		"../**/*.{ts,tsx}",
		"!../**/*.test.{ts,tsx}",
		"!../**/*.stories.tsx",
		"!./failure-report.ts",
		"!./bindings.ts",
	],
	{ query: "?raw", import: "default", eager: true },
)

const SHARED_RAISER = "raiseReportedFailure"
const REPORTER_SIGNATURE = String.raw`\([^()]*\bReporterFacts\b[^()]*\)\s*=>`
const REPORTER_ALIAS = new RegExp(
	String.raw`\btype\s+(\w+)\s*=\s*${REPORTER_SIGNATURE}`,
	"g",
)
const BOUND_REPORTER = /\b(\w+)\s*[:=]\s*failureReporterIn\(/g
const NAMES_A_REASON = /\breason\b/
const EMPTY_REASON = /\breason\s*:\s*(?:undefined|null)\b/
const OPENING = "([{"
const CLOSING = ")]}"

const RAISERS_WITHOUT_ERROR: RaiserWithoutError[] = [
	{
		file: "components/library-screen.tsx",
		call: "missingNotice()",
		why: "the opened document is absent from the library listing, nothing threw",
	},
	{
		file: "lib/account/use-account.ts",
		call: "ACCOUNT_RAISED_IN",
		why: "the host published an account state, failed or signed out, with no error",
	},
	{
		file: "lib/applications/session-reopening.ts",
		call: "bots:applications.reopen.refused.title",
		why: "the reopen answers no session handle, its refusal is raised by the session failure notice",
	},
	{
		file: "lib/conversations/companion-spoke-driver.ts",
		call: "bots:roster.unavailable",
		why: "the roster reads as failed after a reload, its query raised the error it met",
	},
	{
		file: "lib/library/library-comment-turn-failures.ts",
		call: "failureTitleOf",
		why: "the host lists a failed comment turn by a word, noReply or turnFailed, with no error",
	},
	{
		file: "lib/library/use-library-document-writers.ts",
		call: "common:library.failure.document.write",
		why: "the host announces a writer finished with the failed outcome, with no error",
	},
	{
		file: "lib/missions/use-mission-failure-notices.ts",
		call: "missions.failure.send.title",
		why: "the conversation hands back a refused message, with no error",
	},
	{
		file: "lib/onboarding/onboarding-flow-controller.ts",
		call: "chat:onboarding.arrival.firstCompanionMissing",
		why: "no first agent is stored to summon, nothing threw",
	},
	{
		file: "lib/workspace/use-sidebar-missions.ts",
		call: "bots:roster.mission.unavailable.title",
		why: "the mission has no row in the roster, nothing threw",
	},
]

const appPathOf = (key: string) =>
	key.startsWith("./") ? `lib/${key.slice(2)}` : key.slice(3)

const sourceFiles = (): [string, string][] =>
	Object.entries(APP_SOURCES).map(([key, source]) => [appPathOf(key), source])

const reporterAliases = (): string[] =>
	sourceFiles().flatMap(([, source]) =>
		[...source.matchAll(REPORTER_ALIAS)].map(([, alias = ""]) => alias),
	)

const typedReporter = (aliases: string[]) =>
	new RegExp(
		String.raw`\b(\w+)\??\s*:\s*(?:${[REPORTER_SIGNATURE, ...aliases.map((alias) => String.raw`${alias}\b`)].join("|")})`,
		"g",
	)

const reportersIn = (source: string, aliases: string[]): Set<string> =>
	new Set([
		SHARED_RAISER,
		...[...source.matchAll(BOUND_REPORTER)].map(([, name = ""]) => name),
		...[...source.matchAll(typedReporter(aliases))].map(
			([, name = ""]) => name,
		),
	])

const enclosedFrom = (source: string, opening: number): string => {
	let depth = 0
	for (let i = opening; i < source.length; i++) {
		const character = source.charAt(i)
		if (OPENING.includes(character)) depth++
		if (CLOSING.includes(character)) depth--
		if (depth === 0) return source.slice(opening + 1, i)
	}
	return source.slice(opening + 1)
}

const topLevelArguments = (text: string): string[] => {
	const parts: string[] = []
	let depth = 0
	let start = 0
	for (let i = 0; i < text.length; i++) {
		const character = text.charAt(i)
		if (OPENING.includes(character)) depth++
		if (CLOSING.includes(character)) depth--
		if (character === "," && depth === 0) {
			parts.push(text.slice(start, i))
			start = i + 1
		}
	}
	return [...parts, text.slice(start)].map((part) => part.trim())
}

const flattened = (text: string) => text.replace(/\s+/g, " ").trim()

const callsOf = (file: string, source: string, name: string): Raise[] =>
	[...source.matchAll(new RegExp(String.raw`(?<![\w.])${name}\(`, "g"))].map(
		({ index }) => {
			const text = enclosedFrom(source, index + name.length)
			return {
				file,
				call: flattened(`${name}(${text})`),
				facts: flattened(topLevelArguments(text)[1] ?? ""),
			}
		},
	)

const raises = (): Raise[] => {
	const aliases = reporterAliases()
	return sourceFiles().flatMap(([file, source]) =>
		[...reportersIn(source, aliases)].flatMap((name) =>
			callsOf(file, source, name),
		),
	)
}

const isWithoutReason = ({ facts }: Raise) => !NAMES_A_REASON.test(facts)

const isMatchedBy =
	({ file, call }: RaiserWithoutError) =>
	(raise: Raise) =>
		raise.file === file && raise.call.includes(call)

const isListedWithoutError = (raise: Raise) =>
	RAISERS_WITHOUT_ERROR.some((entry) => isMatchedBy(entry)(raise))

const raisesWithoutReason = () => raises().filter(isWithoutReason)

const describeDroppedReason = ({ file, call }: Raise) =>
	`${file} raises ${call} with no reason: hand it the error it caught, or list it in RAISERS_WITHOUT_ERROR with why it holds none`

const describeStaleEntry = ({ file, call }: RaiserWithoutError) =>
	`${file} no longer raises ${call} without a reason: drop it from RAISERS_WITHOUT_ERROR`

const describeEmptyReason = ({ file, call }: Raise) =>
	`${file} raises ${call} with an empty reason: hand it the error it caught, or drop the reason and list it in RAISERS_WITHOUT_ERROR`

const describeWideEntry = ({ file, call }: RaiserWithoutError) =>
	`the RAISERS_WITHOUT_ERROR entry ${file} ${call} matches more than one raise: name one call`

describe("the failure raisers of the app", () => {
	it("finds the raisers across the app", () => {
		expect(raises().map(({ file }) => file)).toEqual(
			expect.arrayContaining([
				"lib/query/query-client.ts",
				"components/library-screen.tsx",
				"lib/conversations/conversation-controller.ts",
				"lib/missions/mission-run-failure.ts",
				"lib/user/diagnostics-actions.ts",
			]),
		)
	})

	it("hands the error it caught to every raiser that holds one", () => {
		const dropped = raisesWithoutReason()
			.filter((raise) => !isListedWithoutError(raise))
			.map(describeDroppedReason)

		expect(dropped, dropped.join("\n")).toEqual([])
	})

	it("lists only raisers that still raise without an error", () => {
		const reasonless = raisesWithoutReason()
		const stale = RAISERS_WITHOUT_ERROR.filter(
			(entry) => !reasonless.some(isMatchedBy(entry)),
		).map(describeStaleEntry)

		expect(stale, stale.join("\n")).toEqual([])
	})

	it("hands no raiser an empty reason", () => {
		const empty = raises()
			.filter(({ facts }) => EMPTY_REASON.test(facts))
			.map(describeEmptyReason)

		expect(empty, empty.join("\n")).toEqual([])
	})

	it("lists each raiser without an error by one call alone", () => {
		const every = raises()
		const wide = RAISERS_WITHOUT_ERROR.filter(
			(entry) => every.filter(isMatchedBy(entry)).length > 1,
		).map(describeWideEntry)

		expect(wide, wide.join("\n")).toEqual([])
	})

	it("raises a failure notice through the shared failure report alone", () => {
		const bypassing = sourceFiles()
			.filter(([, source]) => /\braiseFailureNotice\b/.test(source))
			.map(([file]) => file)

		expect(bypassing).toEqual([])
	})
})
