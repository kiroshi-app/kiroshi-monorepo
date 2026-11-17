// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	useMissionReadFailure,
	useSpaceMissionsFailure,
} from "./use-mission-failure-notices"

import { raiseReportedFailure } from "@/lib/failure-report"

vi.mock("@/lib/failure-report", () => ({ raiseReportedFailure: vi.fn() }))

type ReadState = {
	hasFailedToRead: boolean
	readError: unknown
}

type FeedState = {
	hasFailed: boolean
	readError: unknown
}

const STORAGE_FAILURE = { kind: "storage" }

const READ_SUCCEEDED: ReadState = { hasFailedToRead: false, readError: null }

const FEED_SUCCEEDED: FeedState = { hasFailed: false, readError: null }

const raised = vi.mocked(raiseReportedFailure)

const reasonsRaised = () => raised.mock.calls.map(([, facts]) => facts.reason)

beforeEach(() => {
	raised.mockClear()
})

afterEach(cleanup)

describe("the mission read failure notice", () => {
	it("hands the error of the failed read to the report", () => {
		const { rerender } = renderHook(
			({ hasFailedToRead, readError }: ReadState) =>
				useMissionReadFailure(hasFailedToRead, readError),
			{ initialProps: READ_SUCCEEDED },
		)

		rerender({ hasFailedToRead: true, readError: STORAGE_FAILURE })

		expect(reasonsRaised()).toEqual([STORAGE_FAILURE])
	})
})

describe("the space missions failure notice", () => {
	it("hands the error of the failed feed read to the report", () => {
		const { rerender } = renderHook(
			({ hasFailed, readError }: FeedState) =>
				useSpaceMissionsFailure({
					hasFailed,
					isFailureRaised: false,
					readError,
					reload: () => undefined,
				}),
			{ initialProps: FEED_SUCCEEDED },
		)

		rerender({ hasFailed: true, readError: STORAGE_FAILURE })

		expect(reasonsRaised()).toEqual([STORAGE_FAILURE])
	})
})
