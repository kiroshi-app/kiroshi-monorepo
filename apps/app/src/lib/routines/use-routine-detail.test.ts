// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import type { RoutineRun } from "./routine-contract"
import { routineQueryKeys } from "./routine-query-keys"
import { DEFAULT_RUN_PAGE, routinesTransport } from "./routines-transport"
import { useRoutineDetail } from "./use-routine-detail"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./routines-transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("./routines-transport")>()),
	routinesTransport: { runs: vi.fn(), runNow: vi.fn() },
}))

const readRuns = vi.mocked(routinesTransport.runs)
const runNow = vi.mocked(routinesTransport.runNow)

const ROW: RoutineRowModel = {
	id: "r-1",
	title: "Nightly report",
	triggerSourceTitle: "Schedule",
	isEnabled: true,
	hasStoppedItself: false,
}

const RUN: RoutineRun = {
	id: "run-1",
	routineId: ROW.id,
	startedAt: 1_000,
	endedAt: 2_000,
	outcome: "ok",
	reason: null,
	costUsd: null,
	modelUsage: null,
}

const SKIPPED_RUN: RoutineRun = {
	...RUN,
	id: "run-2",
	outcome: "skipped",
	reason: "previous run still in progress",
}

const pageOf = (length: number): RoutineRun[] =>
	Array.from({ length }, (_, rank) => ({ ...RUN, id: `run-${rank}` }))

const onWriteFailure = vi.fn()

const mountDetail = (query = createQueryTestWrapper()) =>
	renderHook(() => useRoutineDetail({ routines: [ROW], onWriteFailure }), {
		wrapper: query.wrapper,
	}).result

const opened = async (carried: RoutineRun[]) => {
	readRuns.mockResolvedValueOnce(carried)
	const result = mountDetail()

	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() => expect(result.current.open?.isReadingRuns).toBe(false))
	return result
}

beforeEach(() => {
	vi.clearAllMocks()
})

afterEach(cleanup)

it("reads the runs of the routine a row opened", async () => {
	const result = await opened([RUN, SKIPPED_RUN])

	expect(readRuns).toHaveBeenCalledWith(ROW.id)
	expect(result.current.open).toMatchObject({
		id: ROW.id,
		title: ROW.title,
		triggerSourceTitle: ROW.triggerSourceTitle,
	})
	expect(result.current.open?.runs).toHaveLength(2)
})

it("names the outcome the store spells ok as reported", async () => {
	const result = await opened([RUN])

	expect(result.current.open?.runs[0]?.outcome).toBe("reported")
})

it("shows a stored reason as the store wrote it", async () => {
	const result = await opened([SKIPPED_RUN])

	expect(result.current.open?.runs[0]?.reason).toBe(
		"previous run still in progress",
	)
})

it("leaves a run the store has not closed without an outcome", async () => {
	const result = await opened([{ ...RUN, endedAt: null, outcome: null }])

	expect(result.current.open?.runs[0]?.outcome).toBeNull()
})

it("dates the runs against the clock read when they landed", async () => {
	const clock = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
	const result = await opened([RUN])
	const dated = result.current.open?.now

	clock.mockReturnValue(1_700_000_600_000)
	runNow.mockResolvedValueOnce({ kind: "refused", by: "disabled" })
	await act(async () => {
		result.current.onRunNow()
	})

	expect(dated).toBe(1_700_000_000_000)
	expect(result.current.open?.now).toBe(dated)
	clock.mockRestore()
})

it("says the runs shown are the last ones read when the read fills the page", async () => {
	const result = await opened(pageOf(DEFAULT_RUN_PAGE))

	expect(result.current.open?.hasReadFullPage).toBe(true)
})

it("counts a read short of the page as everything the routine ran", async () => {
	const result = await opened(pageOf(DEFAULT_RUN_PAGE - 1))

	expect(result.current.open?.hasReadFullPage).toBe(false)
})

it("reports the runs that could not be read", async () => {
	readRuns.mockRejectedValueOnce(new Error("the runs are unreadable"))
	const result = mountDetail()

	await act(async () => {
		result.current.onOpen(ROW.id)
	})

	await waitFor(() =>
		expect(result.current.open?.hasFailedToReadRuns).toBe(true),
	)
	expect(result.current.open?.isReadingRuns).toBe(false)
})

it("reads the runs again when a failed read is retried", async () => {
	readRuns.mockRejectedValueOnce(new Error("the runs are unreadable"))
	const result = mountDetail()

	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() =>
		expect(result.current.open?.hasFailedToReadRuns).toBe(true),
	)
	readRuns.mockResolvedValueOnce([RUN])
	await act(async () => {
		result.current.onRetryRuns()
	})

	await waitFor(() => expect(result.current.open?.runs).toHaveLength(1))
	expect(result.current.open?.hasFailedToReadRuns).toBe(false)
})

it("keeps the failure on screen while a retried read is in flight", async () => {
	readRuns.mockRejectedValueOnce(new Error("the runs are unreadable"))
	const result = mountDetail()

	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() =>
		expect(result.current.open?.hasFailedToReadRuns).toBe(true),
	)

	let settleRead = (_carried: RoutineRun[]) => {}
	readRuns.mockReturnValueOnce(
		new Promise<RoutineRun[]>((resolve) => {
			settleRead = resolve
		}),
	)
	act(() => {
		result.current.onRetryRuns()
	})

	expect(result.current.open?.hasFailedToReadRuns).toBe(true)

	await act(async () => {
		settleRead([RUN])
	})

	await waitFor(() =>
		expect(result.current.open?.hasFailedToReadRuns).toBe(false),
	)
	expect(result.current.open?.runs).toHaveLength(1)
})

it("ignores a retry fired while a read of the runs is in flight", async () => {
	readRuns.mockRejectedValueOnce(new Error("the runs are unreadable"))
	const result = mountDetail()

	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() =>
		expect(result.current.open?.hasFailedToReadRuns).toBe(true),
	)

	let settleRead = (_carried: RoutineRun[]) => {}
	readRuns.mockReturnValueOnce(
		new Promise<RoutineRun[]>((resolve) => {
			settleRead = resolve
		}),
	)
	act(() => {
		result.current.onRetryRuns()
	})
	act(() => {
		result.current.onRetryRuns()
	})

	await waitFor(() => expect(result.current.open?.isReadingRuns).toBe(true))
	expect(readRuns).toHaveBeenCalledTimes(2)

	await act(async () => {
		settleRead([RUN])
	})
	await waitFor(() => expect(result.current.open?.runs).toHaveLength(1))
})

it("keeps the runs a later read carried when an earlier read rejects", async () => {
	const query = createQueryTestWrapper()
	readRuns.mockResolvedValueOnce([])
	const result = mountDetail(query)
	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() => expect(result.current.open?.isReadingRuns).toBe(false))
	const rereadRuns = () =>
		act(() => {
			void query.queryClient.invalidateQueries({
				queryKey: routineQueryKeys.runs(),
			})
		})

	let rejectEarlierRead = (_reason: unknown) => {}
	readRuns.mockReturnValueOnce(
		new Promise<RoutineRun[]>((_resolve, reject) => {
			rejectEarlierRead = reject
		}),
	)
	rereadRuns()
	readRuns.mockResolvedValueOnce([RUN])
	rereadRuns()
	await waitFor(() => expect(result.current.open?.runs).toHaveLength(1))

	await act(async () => {
		rejectEarlierRead(new Error("the runs are unreadable"))
	})

	expect(result.current.open?.hasFailedToReadRuns).toBe(false)
	expect(result.current.open?.runs).toHaveLength(1)
})

it("shows beside the control the refusal a Run now was answered with", async () => {
	const result = await opened([])
	runNow.mockResolvedValueOnce({ kind: "refused", by: "alreadySeen" })

	await act(async () => {
		result.current.onRunNow()
	})

	await waitFor(() => expect(result.current.open?.refusal).toBe("alreadySeen"))
	expect(result.current.open?.isRunning).toBe(false)
	expect(readRuns).toHaveBeenCalledTimes(1)
})

it("leaves the reread of the runs to the change a started run announces", async () => {
	const result = await opened([])
	runNow.mockResolvedValueOnce({ kind: "started", runId: "run-3" })

	await act(async () => {
		result.current.onRunNow()
	})

	await waitFor(() => expect(result.current.open?.isRunning).toBe(false))
	expect(result.current.open?.refusal).toBeUndefined()
	expect(readRuns).toHaveBeenCalledTimes(1)
})

it("forgets the refusal of the routine it closed", async () => {
	const result = await opened([])
	runNow.mockResolvedValueOnce({ kind: "refused", by: "alreadySeen" })
	await act(async () => {
		result.current.onRunNow()
	})
	await waitFor(() => expect(result.current.open?.refusal).toBe("alreadySeen"))

	readRuns.mockResolvedValueOnce([])
	act(() => {
		result.current.onClose()
	})
	act(() => {
		result.current.onOpen(ROW.id)
	})

	expect(result.current.open?.refusal).toBeUndefined()
})

it("raises the write failure when a Run now request fails", async () => {
	const result = await opened([])
	runNow.mockRejectedValueOnce(new Error("the run could not be requested"))

	await act(async () => {
		result.current.onRunNow()
	})

	expect(onWriteFailure).toHaveBeenCalled()
	expect(result.current.open?.isRunning).toBe(false)
})

it("closes the detail back onto the list", async () => {
	const result = await opened([RUN])

	act(() => {
		result.current.onClose()
	})

	expect(result.current.open).toBeNull()
})

it("shows none of the runs of the routine it left while the next one reads", async () => {
	const other: RoutineRowModel = { ...ROW, id: "r-2", title: "Morning digest" }
	readRuns.mockResolvedValueOnce([RUN])
	const { result } = renderHook(
		() => useRoutineDetail({ routines: [ROW, other], onWriteFailure }),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await act(async () => {
		result.current.onOpen(ROW.id)
	})
	await waitFor(() => expect(result.current.open?.runs).toHaveLength(1))
	readRuns.mockReturnValueOnce(new Promise(() => undefined))

	act(() => {
		result.current.onOpen(other.id)
	})

	expect(result.current.open?.id).toBe(other.id)
	expect(result.current.open?.runs).toEqual([])
	expect(result.current.open?.isReadingRuns).toBe(true)
})
