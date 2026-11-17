import { describe, expect, it } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
	countByWindowAfterBoot,
	findStalls,
	jobTimeline,
	readJobEnvironment,
	stallOffsetsAfterBoot,
	topProcessesAtStalls,
} from "./ios-stalls"

const SAMPLER = fileURLToPath(new URL("./ios-sampler.sh", import.meta.url))

const at = (clock: string, text: string) => `2026-11-17T${clock}Z ${text}`

const started = (clock: string, test: string) =>
	at(clock, `Test Case '-[KiroshiUITests.ThreadTests ${test}]' started.`)

const ended = (
	clock: string,
	test: string,
	outcome: "passed" | "failed",
	seconds: string,
) =>
	at(
		clock,
		`Test Case '-[KiroshiUITests.ThreadTests ${test}]' ${outcome} (${seconds} seconds).`,
	)

const quickTest = (start: string, end: string, test: string) => [
	started(start, test),
	at(start, "    t =     0.00s Start Test at 2026-11-17 12:15:16.344"),
	at(start, '    t =     2.10s Waiting 10.0s for "Send" Button to exist'),
	at(start, '    t =     2.40s         Checking existence of `"Send" Button`'),
	at(start, '    t =     2.60s Tap "Send" Button'),
	at(start, "    t =     3.00s Tear Down"),
	ended(end, test, "passed", "4.120"),
]

const STALLED_TEST = [
	started("12:23:02.000", "testATurnShowsNoRowForTheAgentsTools"),
	at("12:23:02.100", "    t =     0.00s Start Test at 2026-11-17 12:23:01.707"),
	at(
		"12:23:35.500",
		"    t =    33.22s Waiting 10.0s for Button (First Match) to not exist",
	),
	at(
		"12:23:36.300",
		"    t =    34.29s         Checking existence of `Button (First Match)`",
	),
	at(
		"12:23:48.200",
		"    t =    43.84s     Checking existence of `Button (First Match)`",
	),
	at(
		"12:24:19.100",
		"    t =    74.99s     Checking existence of `Button (First Match)` (retry 1)",
	),
	at("12:25:16.600", '    t =   134.91s Tap "Send" Button'),
	at("12:25:24.300", "    t =   142.62s Tear Down"),
	ended(
		"12:25:26.600",
		"testATurnShowsNoRowForTheAgentsTools",
		"passed",
		"144.824",
	),
]

const TIMED_OUT_TEST = [
	started(
		"12:20:00.000",
		"testCopyMessageFromALaterBubbleCopiesTheWholeMessage",
	),
	at("12:20:00.100", "    t =     0.00s Start Test at 2026-11-17 12:20:00.000"),
	at(
		"12:20:46.500",
		'    t =    46.55s     Find the "Message Release crew" TextField',
	),
	at(
		"12:20:47.400",
		'    t =    47.40s         Find the "Message Release crew" TextField (retry 1)',
	),
	at(
		"12:20:48.300",
		'<unknown>:0: error: -[KiroshiUITests.ThreadTests testCopyMessageFromALaterBubbleCopiesTheWholeMessage] : Failed to tap "Message Release crew" TextField: Timed out while evaluating UI query.',
	),
	at("12:20:48.400", "    t =    48.30s Tear Down"),
	ended(
		"12:20:50.000",
		"testCopyMessageFromALaterBubbleCopiesTheWholeMessage",
		"failed",
		"50.012",
	),
]

const ASSERTION_FAILURE = [
	started("12:30:00.000", "testTwoMessagesSentInARowStayTwo"),
	at("12:30:00.100", "    t =     0.00s Start Test at 2026-11-17 12:30:00.000"),
	at(
		"12:30:02.000",
		"    t =     1.90s Get number of matches for: Elements matching predicate 'label BEGINSWITH \"Hi\"'",
	),
	at(
		"12:30:02.500",
		"    t =     2.40s Checking existence of `Cell (First Match)`",
	),
	at(
		"12:30:02.600",
		'/Users/runner/work/kiroshi-monorepo/apps/ios/KiroshiUITests/ThreadTests.swift:88: error: -[KiroshiUITests.ThreadTests testTwoMessagesSentInARowStayTwo] : XCTAssertEqual failed: ("1") is not equal to ("2")',
	),
	at("12:30:02.700", "    t =     2.60s Tear Down"),
	ended("12:30:03.000", "testTwoMessagesSentInARowStayTwo", "failed", "3.010"),
]

const jobLog = (...tests: string[][]) =>
	[
		"\uFEFF2026-11-17T12:08:26.2510880Z Current runner version: '2.338.2'",
		at(
			"12:14:57.300",
			"KiroshiUITests-Runner[8166:30311] [Default] Running tests...",
		),
		...tests.flat(),
		at("12:40:00.000", "** TEST EXECUTE SUCCEEDED **"),
	].join("\n")

describe("findStalls", () => {
	it("returns a test whose single query step takes more than 10 s, with its duration and its offset from the first test", () => {
		const log = jobLog(
			quickTest("12:15:16.000", "12:15:20.120", "testTheThreadPassesTheAudit"),
			STALLED_TEST,
		)

		expect(findStalls(log)).toEqual([
			{
				test: "KiroshiUITests.ThreadTests/testATurnShowsNoRowForTheAgentsTools",
				seconds: 144.824,
				offsetSeconds: 466,
				hasTimedOutQuery: false,
				startedAt: Date.parse("2026-11-17T12:24:19.100Z"),
				slowestQuerySeconds: 59.9,
			},
		])
	})

	it("returns a test whose log carries a timed-out UI query even when no single step takes 10 s", () => {
		const log = jobLog(TIMED_OUT_TEST)

		expect(findStalls(log)).toEqual([
			{
				test: "KiroshiUITests.ThreadTests/testCopyMessageFromALaterBubbleCopiesTheWholeMessage",
				seconds: 50.012,
				offsetSeconds: 0,
				hasTimedOutQuery: true,
				startedAt: Date.parse("2026-11-17T12:20:47.400Z"),
				slowestQuerySeconds: 0.9,
			},
		])
	})

	it("skips a test that fails on an assertion with no slow query step", () => {
		const log = jobLog(
			quickTest("12:15:16.000", "12:15:20.120", "testTheThreadPassesTheAudit"),
			ASSERTION_FAILURE,
		)

		expect(findStalls(log)).toEqual([])
	})

	it("returns nothing for a job whose every query answers at once", () => {
		const log = jobLog(
			quickTest("12:15:16.000", "12:15:20.120", "testTheThreadPassesTheAudit"),
			quickTest(
				"12:15:20.200",
				"12:15:24.400",
				"testTheShownTimesPassTheAudit",
			),
		)

		expect(findStalls(log)).toEqual([])
	})

	it("measures a test cut off before it ended up to the last line of the log", () => {
		const log = jobLog(STALLED_TEST.slice(0, -1))

		expect(findStalls(log)[0]?.seconds).toBe(1018)
	})
})

describe("readJobEnvironment", () => {
	it("reads the runner image, Xcode, simulator runtime and the wait from the Gate to the first test", () => {
		const log = [
			at("12:08:26.254", "##[group]Runner Image"),
			at("12:08:26.254", "Image: xcode-27-arm64"),
			at("12:08:26.254", "Version: 20261104.0337.1"),
			at("12:08:26.254", "##[endgroup]"),
			at("12:11:13.000", "##[group]Run bun scripts/ci.ts ios"),
			at(
				"12:14:09.804",
				"    /Applications/Xcode_27.app/Contents/Developer/usr/bin/xcodebuild -xctestrun apps/ios/build/Build/Products/Kiroshi.xctestrun",
			),
			at(
				"12:15:20.820",
				"objc[8166]: Class UIAccessibilityLoaderWebShared is implemented in both /private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.9You35/Library",
			),
			...quickTest(
				"12:15:16.000",
				"12:15:20.120",
				"testTheThreadPassesTheAudit",
			),
		].join("\n")

		expect(readJobEnvironment(log)).toEqual({
			imageVersion: "20261104.0337.1",
			xcodeVersion: "27",
			simulatorRuntime: "24.1.434.0",
			gateToFirstTestSeconds: 243,
		})
	})
})

const BOOT_STEP = "Boot the simulator while the build products download"

const stepsBootingAt = (bootStartedAt: string) => [
	{
		name: "Set up job",
		number: 1,
		started_at: "2026-11-17T12:08:26Z",
		completed_at: "2026-11-17T12:08:28Z",
	},
	{
		name: BOOT_STEP,
		number: 5,
		started_at: bootStartedAt,
		completed_at: bootStartedAt,
	},
	{
		name: "Gate",
		number: 8,
		started_at: "2026-11-17T12:11:13Z",
		completed_at: "2026-11-17T12:40:00Z",
	},
]

const UNIT_TEST = [
	at(
		"12:16:00.000",
		"Test Case '-[KiroshiTests.RelayTests testDecodesAFrame]' started.",
	),
	at(
		"12:16:00.100",
		"Test Case '-[KiroshiTests.RelayTests testDecodesAFrame]' passed (0.100 seconds).",
	),
]

describe("stallOffsetsAfterBoot", () => {
	it("measures each stall from the start of the boot step in the jobs API", () => {
		const log = jobLog(TIMED_OUT_TEST, STALLED_TEST)

		expect(
			stallOffsetsAfterBoot(stepsBootingAt("2026-11-17T12:08:37Z"), log),
		).toEqual([730, 942])
	})

	it("has no offset to give for a job without a boot step", () => {
		const steps = stepsBootingAt("2026-11-17T12:08:37Z").filter(
			({ name }) => name !== BOOT_STEP,
		)

		expect(stallOffsetsAfterBoot(steps, jobLog(STALLED_TEST))).toBeUndefined()
	})
})

describe("countByWindowAfterBoot", () => {
	it("counts the UI tests and the stalls of every job per 5 minute window after its boot", () => {
		const first = jobTimeline(
			stepsBootingAt("2026-11-17T12:08:37Z"),
			jobLog(
				quickTest(
					"12:15:16.000",
					"12:15:20.120",
					"testTheThreadPassesTheAudit",
				),
				TIMED_OUT_TEST,
				STALLED_TEST,
			),
		)
		const second = jobTimeline(
			stepsBootingAt("2026-11-17T12:13:00Z"),
			jobLog(
				quickTest(
					"12:15:16.000",
					"12:15:20.120",
					"testTheThreadPassesTheAudit",
				),
				UNIT_TEST,
				ASSERTION_FAILURE,
			),
		)

		expect(first && second).toBeDefined()
		expect(
			countByWindowAfterBoot([first, second].flatMap((job) => job ?? [])),
		).toEqual([
			{ fromMinute: 0, tests: 1, stalls: 0 },
			{ fromMinute: 5, tests: 1, stalls: 0 },
			{ fromMinute: 10, tests: 2, stalls: 1 },
			{ fromMinute: 15, tests: 1, stalls: 1 },
		])
	})
})

const SAMPLER_FILE = [
	"=== sample 2026-11-17T12:24:00Z",
	"--- runner top",
	"Processes: 612 total, 4 running, 608 sleeping, 3012 threads",
	"Load Avg: 9.12, 7.40, 5.02",
	"",
	"PID    COMMAND          %CPU  TIME     MEM",
	"4410   mediaanalysisd   182.4 03:10.22 412M+",
	"5120   Kiroshi          41.0  00:52.10 129M-",
	"6139   xcodebuild       12.5  01:02.00 300M",
	"7001   Google Chrome He 77.0  00:10.00 200M",
	"--- simulator processes",
	"PID\tStatus\tLabel",
	"4410\t0\tcom.apple.mediaanalysisd",
	"=== sample 2026-11-17T12:24:45Z",
	"--- runner top",
	"PID    COMMAND          %CPU  TIME     MEM",
	"1      launchd          99.0  00:01.00 10M",
].join("\n")

describe("topProcessesAtStalls", () => {
	it("names the 3 busiest runner processes of the snapshot nearest to each stall start", () => {
		expect(topProcessesAtStalls(jobLog(STALLED_TEST), SAMPLER_FILE)).toEqual([
			{
				test: "KiroshiUITests.ThreadTests/testATurnShowsNoRowForTheAgentsTools",
				stallStartedAt: Date.parse("2026-11-17T12:24:19.100Z"),
				snapshotAt: Date.parse("2026-11-17T12:24:00Z"),
				processes: [
					{ pid: 4410, command: "mediaanalysisd", cpu: 182.4 },
					{ pid: 7001, command: "Google Chrome He", cpu: 77 },
					{ pid: 5120, command: "Kiroshi", cpu: 41 },
				],
			},
		])
	})
})

const TOP_STUB = `#!/bin/bash
printf 'Processes: 2 total\\nPID COMMAND %%CPU TIME MEM\\n4410 mediaanalysisd 0.0 03:10.22 412M\\nProcesses: 2 total\\nPID COMMAND %%CPU TIME MEM\\n4410 mediaanalysisd 182.4 03:10.22 412M\\n'
`

const XCRUN_STUB = `#!/bin/bash
printf 'PID\\tStatus\\tLabel\\n-\\t0\\tcom.apple.idle\\n4410\\t0\\tcom.apple.mediaanalysisd\\n'
`

const writeStub = (directory: string, name: string, script: string) => {
	const path = join(directory, name)
	writeFileSync(path, script)
	chmodSync(path, 0o755)
}

const readWhen = async (path: string, isReady: (text: string) => boolean) => {
	const deadline = Date.now() + 5000
	while (Date.now() < deadline) {
		const text = await Bun.file(path).text()
		if (isReady(text)) return text
		await Bun.sleep(50)
	}
	return Bun.file(path).text()
}

describe("scripts/ios-sampler.sh", () => {
	it("writes a snapshot the detector reads, from the second top sample, with the running simulator processes only", async () => {
		const directory = mkdtempSync(join(tmpdir(), "ios-sampler-"))
		const output = join(directory, "ios-sampler.txt")
		writeStub(directory, "top", TOP_STUB)
		writeStub(directory, "xcrun", XCRUN_STUB)
		writeFileSync(output, "")
		const sampler = Bun.spawn({
			cmd: [SAMPLER, "SIMULATOR-UDID"],
			env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
			stdout: Bun.file(output),
			stderr: Bun.file(output),
		})
		try {
			const sample = await readWhen(output, (text) =>
				text.includes("com.apple.mediaanalysisd"),
			)

			expect(sample).toStartWith("=== sample ")
			expect(sample).not.toContain("com.apple.idle")
			expect(
				topProcessesAtStalls(jobLog(STALLED_TEST), sample)[0]?.processes,
			).toEqual([{ pid: 4410, command: "mediaanalysisd", cpu: 182.4 }])
		} finally {
			sampler.kill()
			await sampler.exited
			rmSync(directory, { recursive: true, force: true })
		}
	})
})
