import { describe, expect, it } from "bun:test"

import { findStalls, readJobEnvironment } from "./ios-stalls"

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
		"﻿2026-11-17T12:08:26.2510880Z Current runner version: '2.338.2'",
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
