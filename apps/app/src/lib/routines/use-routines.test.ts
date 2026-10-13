// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFilterValues,
	type RoutineFormValues,
} from "@workspace/ui/components/routine-form"

import type { Routine, RoutineKey, RoutineRun } from "./routine-contract"
import { routinesTransport } from "./routines-transport"
import type { TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { type ConversationRoutines, useRoutines } from "./use-routines"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./routines-transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("./routines-transport")>()),
	routinesTransport: {
		list: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		create: vi.fn(),
		key: vi.fn(),
		runs: vi.fn(),
		runNow: vi.fn(),
		onChanged: vi.fn(),
	},
}))
vi.mock("./trigger-sources-transport", () => ({
	triggerSourcesTransport: { sources: vi.fn() },
}))

const reachable = vi.hoisted(() => ({ host: "local" as string | null }))

vi.mock("@/lib/host/use-reachable-host", () => ({
	useReachableHost: () => reachable.host,
}))

const list = vi.mocked(routinesTransport.list)
const update = vi.mocked(routinesTransport.update)
const remove = vi.mocked(routinesTransport.delete)
const create = vi.mocked(routinesTransport.create)
const readKey = vi.mocked(routinesTransport.key)
const readRuns = vi.mocked(routinesTransport.runs)
const onChanged = vi.mocked(routinesTransport.onChanged)
const sources = vi.mocked(triggerSourcesTransport.sources)

const ROUTINE: Routine = {
	id: "r-1",
	conversationId: "c-1",
	botId: "b-1",
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 0,
}

const WEBHOOK_ROUTINE: Routine = {
	...ROUTINE,
	id: "r-2",
	triggerSourceId: "local-webhook",
	triggerConfig: {},
}

const SCHEDULE_SOURCE = {
	id: "schedule",
	title: "Schedule",
	payload: [],
	dedupeKey: "occurrenceId",
}

const DECLARED = [
	SCHEDULE_SOURCE,
	{
		id: "local-webhook",
		title: "Local webhook",
		payload: [],
		dedupeKey: "deliveryId",
		header: "X-Kiroshi-Key",
	},
]

const A_REPORTED_RUN: RoutineRun = {
	id: "run-1",
	routineId: ROUTINE.id,
	startedAt: 1_700_000_000_000,
	endedAt: 1_700_000_060_000,
	outcome: "ok",
	reason: null,
	costUsd: null,
	modelUsage: null,
}

const A_WEBHOOK_KEY = {
	key: "the-key",
	header: "X-Kiroshi-Key",
	url: "http://127.0.0.1:4870/routines",
}

const A_SCHEDULE_FORM = {
	title: ROUTINE.title,
	instruction: ROUTINE.instruction,
	triggerSourceId: "schedule",
	expression: "0 * * * *",
}

const entered = (values: Partial<RoutineFormValues>): RoutineFormValues => ({
	...EMPTY_ROUTINE_VALUES,
	...values,
})

const mountLeadRoutines = async (listed: Routine[]) => {
	list.mockResolvedValueOnce(listed)
	sources.mockResolvedValue(DECLARED)

	const { result } = renderHook(
		() => useRoutines(ROUTINE.conversationId, ROUTINE.botId),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => expect(result.current.form.canCreate).toBe(true))
	return result
}

const mountHeldRoutines = async () => {
	list.mockResolvedValueOnce([ROUTINE])
	sources.mockResolvedValue([])

	const { result } = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	return result
}

const announce = async (conversationId: string) => {
	const listener = onChanged.mock.calls.at(-1)?.[0]
	if (!listener) {
		throw new Error("no routine change listener was registered")
	}

	await act(async () => {
		listener({ conversationId })
	})
}

beforeEach(() => {
	vi.clearAllMocks()
	reachable.host = "local"
	onChanged.mockResolvedValue(() => undefined)
	readRuns.mockResolvedValue([])
})

afterEach(cleanup)

it("clears a write failure once a later write resolves", async () => {
	const result = await mountHeldRoutines()

	update.mockRejectedValueOnce(new Error("write refused"))
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBe("write"))

	update.mockResolvedValueOnce({ ...ROUTINE, isEnabled: false })
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBeNull())
})

it("clears a write failure once a deletion resolves", async () => {
	const result = await mountHeldRoutines()

	update.mockRejectedValueOnce(new Error("write refused"))
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBe("write"))

	remove.mockResolvedValueOnce(undefined)
	await act(async () => {
		await result.current.remove(ROUTINE.id)
	})
	expect(result.current.failure).toBeNull()
})

it("keeps a read failure whatever a write resolves to", async () => {
	const result = await mountHeldRoutines()

	list.mockRejectedValueOnce(new Error("read refused"))
	await act(async () => {
		result.current.reload()
	})
	await waitFor(() => expect(result.current.failure).toBe("routines"))

	update.mockResolvedValueOnce({ ...ROUTINE, isEnabled: false })
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.routines[0].isEnabled).toBe(false))
	expect(result.current.failure).toBe("routines")
})

it("carries the address, the key and the header name of a created webhook routine", async () => {
	const result = await mountLeadRoutines([])
	create.mockResolvedValueOnce(WEBHOOK_ROUTINE)
	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)

	act(() => {
		result.current.form.onNew()
	})
	await act(async () => {
		result.current.form.onSave(
			entered({
				title: WEBHOOK_ROUTINE.title,
				instruction: WEBHOOK_ROUTINE.instruction,
				triggerSourceId: "local-webhook",
			}),
		)
	})

	await waitFor(() =>
		expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY),
	)
	expect(create).toHaveBeenCalledWith({
		conversationId: ROUTINE.conversationId,
		botId: ROUTINE.botId,
		title: WEBHOOK_ROUTINE.title,
		instruction: WEBHOOK_ROUTINE.instruction,
		triggerSourceId: "local-webhook",
		filter: { matchMode: "all", rows: [] },
		triggerConfig: {},
	})
	expect(result.current.routines).toHaveLength(1)
})

it("fills the form of a schedule routine opened for edit", async () => {
	const result = await mountLeadRoutines([
		{ ...ROUTINE, triggerConfig: { expression: "0 * * * *" } },
	])

	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})

	expect(result.current.form.open).toMatchObject({
		id: ROUTINE.id,
		values: {
			title: ROUTINE.title,
			instruction: ROUTINE.instruction,
			triggerSourceId: "schedule",
			expression: "0 * * * *",
		},
	})
})

it("marks the key as unreadable when its read rejects", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	readKey.mockRejectedValueOnce(new Error("the key is unreadable"))

	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})

	await waitFor(() =>
		expect(result.current.form.open?.hasFailedToReadKey).toBe(true),
	)
	expect(result.current.form.open?.webhook).toBeUndefined()
})

it("marks the title of a form refused for a blank title", async () => {
	const result = await mountLeadRoutines([])
	const blankTitled = entered({ ...A_SCHEDULE_FORM, title: "" })
	create.mockRejectedValueOnce({ kind: "blankField", field: "title" })

	act(() => {
		result.current.form.onNew()
	})
	await act(async () => {
		result.current.form.onSave(blankTitled)
	})

	await waitFor(() =>
		expect(result.current.form.open?.refusal).toBe("blankTitle"),
	)
	expect(result.current.form.open?.values).toEqual(blankTitled)
	expect(result.current.failure).toBeNull()
})

it("lists the routines of a conversation whose sources are unreadable", async () => {
	list.mockResolvedValueOnce([ROUTINE])
	sources.mockRejectedValue(new Error("the sources are unreadable"))

	const { result } = renderHook(
		() => useRoutines(ROUTINE.conversationId, ROUTINE.botId),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

	await waitFor(() => expect(result.current.failure).toBe("routines"))
	expect(result.current.routines).toHaveLength(1)
	expect(result.current.form.canCreate).toBe(false)
})

it("keeps the key a later read carried when an earlier read rejects", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	let refuse = (_reason: unknown) => {}
	readKey.mockReturnValueOnce(
		new Promise((_resolve, reject) => {
			refuse = reject
		}),
	)
	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)

	act(() => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	await waitFor(() => expect(result.current.form.open?.webhook).toBeDefined())

	await act(async () => {
		refuse(new Error("the key is unreadable"))
	})

	expect(result.current.form.open?.hasFailedToReadKey).toBeUndefined()
	expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY)
})

it("hands the panel a trigger source the lead does not declare", async () => {
	list.mockResolvedValueOnce([WEBHOOK_ROUTINE])
	sources.mockResolvedValue([SCHEDULE_SOURCE])

	const { result } = renderHook(
		() => useRoutines(ROUTINE.conversationId, ROUTINE.botId),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	expect(result.current.form.sources).toEqual([
		{ id: "schedule", title: "Schedule", kind: "schedule", payload: [] },
	])

	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)
	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})

	expect(result.current.form.sources).toContainEqual({
		id: "local-webhook",
		title: "local-webhook",
		kind: "localWebhook",
		payload: [],
	})
})

it("keeps a key that settled between a save and its refusal", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	let settleKey = (_read: RoutineKey) => {}
	readKey.mockReturnValueOnce(
		new Promise<RoutineKey>((resolve) => {
			settleKey = resolve
		}),
	)
	let refuseSave = (_reason: unknown) => {}
	update.mockReturnValueOnce(
		new Promise<Routine>((_resolve, reject) => {
			refuseSave = reject
		}),
	)

	act(() => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	act(() => {
		result.current.form.onSave(entered({ instruction: "Read it" }))
	})
	await act(async () => {
		settleKey(A_WEBHOOK_KEY)
	})
	await act(async () => {
		refuseSave({ kind: "blankField", field: "title" })
	})

	expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY)
	expect(result.current.form.open?.refusal).toBe("blankTitle")
})

it("raises the write failure of a save on a routine that left the list", async () => {
	const result = await mountLeadRoutines([ROUTINE])

	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})
	remove.mockResolvedValueOnce(undefined)
	await act(async () => {
		await result.current.remove(ROUTINE.id)
	})
	await act(async () => {
		result.current.form.onSave(entered({ title: "Nightly report" }))
	})

	expect(result.current.failure).toBe("write")
	expect(result.current.form.open?.values.title).toBe("Nightly report")
	expect(update).not.toHaveBeenCalled()
})

it("leaves the panel on the list when a save resolves after the form was closed", async () => {
	const result = await mountLeadRoutines([])
	let settleSave = (_written: Routine) => {}
	create.mockReturnValueOnce(
		new Promise<Routine>((resolve) => {
			settleSave = resolve
		}),
	)

	act(() => {
		result.current.form.onNew()
	})
	act(() => {
		result.current.form.onSave(entered(A_SCHEDULE_FORM))
	})
	act(() => {
		result.current.form.onClose()
	})
	await act(async () => {
		settleSave(ROUTINE)
	})

	expect(result.current.form.open).toBeNull()
	expect(result.current.routines).toHaveLength(1)
})

it("leaves the routine on the form when a refusal lands from another form", async () => {
	const result = await mountLeadRoutines([ROUTINE])
	let refuseSave = (_reason: unknown) => {}
	create.mockReturnValueOnce(
		new Promise<Routine>((_resolve, reject) => {
			refuseSave = reject
		}),
	)

	act(() => {
		result.current.form.onNew()
	})
	act(() => {
		result.current.form.onSave(
			entered({ instruction: "Read it", triggerSourceId: "schedule" }),
		)
	})
	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})
	await act(async () => {
		refuseSave({ kind: "blankField", field: "title" })
	})

	expect(result.current.form.open).toMatchObject({
		id: ROUTINE.id,
		values: { title: ROUTINE.title, instruction: ROUTINE.instruction },
	})
	expect(result.current.form.open?.refusal).toBeUndefined()
	expect(result.current.failure).toBe("write")
})

it("writes one routine when two saves are fired before either settles", async () => {
	const result = await mountLeadRoutines([])
	let settleSave = (_written: Routine) => {}
	create.mockReturnValueOnce(
		new Promise<Routine>((resolve) => {
			settleSave = resolve
		}),
	)

	act(() => {
		result.current.form.onNew()
	})
	act(() => {
		result.current.form.onSave(entered(A_SCHEDULE_FORM))
		result.current.form.onSave(entered(A_SCHEDULE_FORM))
	})
	await act(async () => {
		settleSave(ROUTINE)
	})

	expect(create).toHaveBeenCalledTimes(1)
	expect(result.current.routines).toHaveLength(1)
})

it("writes again when a save is fired after an earlier save settled", async () => {
	const result = await mountLeadRoutines([])
	create.mockRejectedValueOnce({ kind: "blankField", field: "title" })

	act(() => {
		result.current.form.onNew()
	})
	await act(async () => {
		result.current.form.onSave(entered(A_SCHEDULE_FORM))
	})
	create.mockResolvedValueOnce(ROUTINE)
	await act(async () => {
		result.current.form.onSave(entered(A_SCHEDULE_FORM))
	})

	expect(create).toHaveBeenCalledTimes(2)
	expect(result.current.routines).toHaveLength(1)
})

const INBOX_ROUTINE: Routine = {
	...ROUTINE,
	id: "r-3",
	botId: "b-2",
	triggerSourceId: "space-inbox",
	filter: {
		matchMode: "all",
		rows: [{ field: "unreadCount", operator: "gt", value: 10 }],
	},
	triggerConfig: {},
}

const INBOX_SOURCE = {
	id: "space-inbox",
	title: "When the space inbox fills",
	payload: [
		{ name: "unreadCount", type: "number" as const },
		{ name: "subject", type: "string" as const },
	],
	dedupeKey: "receivedAt",
}

const TWO_ROW_ROUTINE: Routine = {
	...INBOX_ROUTINE,
	id: "r-4",
	filter: {
		matchMode: "all",
		rows: [
			{ field: "unreadCount", operator: "gt", value: 10 },
			{ field: "subject", operator: "contains", value: "invoice" },
		],
	},
}

const READ_ROWS = [
	{ field: "unreadCount", operator: "gt" as const, value: "10" },
	{ field: "subject", operator: "contains" as const, value: "invoice" },
]

const mountOwnedRoutine = async (
	listed: Routine[],
	owning: () => Promise<TriggerSource[]>,
) => {
	list.mockResolvedValueOnce(listed)
	sources.mockImplementation((botId: string) =>
		botId === INBOX_ROUTINE.botId ? owning() : Promise.resolve(DECLARED),
	)

	const { result } = renderHook(
		() => useRoutines(ROUTINE.conversationId, ROUTINE.botId),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	return result
}

const declaringNothing = () =>
	Promise.reject(new Error("the sources are unreadable"))

const declaringTheInbox = () => Promise.resolve([INBOX_SOURCE])

const savedRows = (
	result: { current: ConversationRoutines },
	routine: Routine,
	rows: RoutineFilterValues["rows"],
) => {
	act(() => {
		result.current.form.onOpen(routine.id)
	})

	update.mockResolvedValueOnce(routine)
	return act(async () => {
		result.current.form.onSave(
			entered({
				title: routine.title,
				instruction: routine.instruction,
				triggerSourceId: routine.triggerSourceId,
				filter: { matchMode: "all", rows },
			}),
		)
	})
}

const writtenRows = () => vi.mocked(update).mock.calls[0]?.[1].filter.rows

it("keeps an untouched row typed as it was read while another row is added", async () => {
	const result = await mountOwnedRoutine([TWO_ROW_ROUTINE], declaringNothing)

	await savedRows(result, TWO_ROW_ROUTINE, [
		...READ_ROWS,
		{ field: "sender.address", operator: "exists", value: "" },
	])

	expect(writtenRows()).toEqual([
		...TWO_ROW_ROUTINE.filter.rows,
		{ field: "sender.address", operator: "exists" },
	])
})

it("keeps an untouched row typed as it was read while another row is edited", async () => {
	const result = await mountOwnedRoutine([TWO_ROW_ROUTINE], declaringNothing)

	await savedRows(result, TWO_ROW_ROUTINE, [
		READ_ROWS[0],
		{ ...READ_ROWS[1], value: "receipt" },
	])

	expect(writtenRows()).toEqual([
		{ field: "unreadCount", operator: "gt", value: 10 },
		{ field: "subject", operator: "contains", value: "receipt" },
	])
})

it("writes every row from the declared fields once one of them is edited", async () => {
	const result = await mountOwnedRoutine([TWO_ROW_ROUTINE], declaringTheInbox)

	await savedRows(result, TWO_ROW_ROUTINE, [
		{ ...READ_ROWS[0], value: "7" },
		READ_ROWS[1],
	])

	expect(writtenRows()).toEqual([
		{ field: "unreadCount", operator: "gt", value: 7 },
		{ field: "subject", operator: "contains", value: "invoice" },
	])
})

it("keeps a value typed by the source the lead companion does not declare", async () => {
	const result = await mountOwnedRoutine([INBOX_ROUTINE], declaringTheInbox)

	act(() => {
		result.current.form.onOpen(INBOX_ROUTINE.id)
	})
	expect(result.current.form.open?.values.filter.rows).toEqual([
		{
			field: "unreadCount",
			operator: "gt",
			value: "10",
			readAs: { operator: "gt", fieldType: "number" },
		},
	])

	update.mockResolvedValueOnce(INBOX_ROUTINE)
	await act(async () => {
		result.current.form.onSave(
			entered({
				title: INBOX_ROUTINE.title,
				instruction: INBOX_ROUTINE.instruction,
				triggerSourceId: INBOX_ROUTINE.triggerSourceId,
				filter: {
					matchMode: "all",
					rows: [{ field: "unreadCount", operator: "gt", value: "10" }],
				},
			}),
		)
	})

	expect(update).toHaveBeenCalledWith(
		INBOX_ROUTINE.id,
		expect.objectContaining({ filter: INBOX_ROUTINE.filter }),
	)
})

it("leaves the filter of a routine whose source went unread as it was read", async () => {
	const result = await mountOwnedRoutine([INBOX_ROUTINE], declaringNothing)

	act(() => {
		result.current.form.onOpen(INBOX_ROUTINE.id)
	})

	expect(result.current.form.open?.refusal).toBeUndefined()
	expect(result.current.form.open?.values.filter).toEqual({
		matchMode: "all",
		rows: [
			{
				field: "unreadCount",
				operator: "gt",
				value: "10",
				readAs: { operator: "gt", fieldType: "number" },
			},
		],
	})

	update.mockResolvedValueOnce(INBOX_ROUTINE)
	await act(async () => {
		result.current.form.onSave(
			entered({
				title: "Inbox digest",
				instruction: INBOX_ROUTINE.instruction,
				triggerSourceId: INBOX_ROUTINE.triggerSourceId,
				filter: {
					matchMode: "all",
					rows: [{ field: "unreadCount", operator: "gt", value: "10" }],
				},
			}),
		)
	})

	expect(update).toHaveBeenCalledWith(
		INBOX_ROUTINE.id,
		expect.objectContaining({
			title: "Inbox digest",
			filter: INBOX_ROUTINE.filter,
		}),
	)
})

it("writes an edited value in the type the row was read with", async () => {
	const result = await mountOwnedRoutine([TWO_ROW_ROUTINE], declaringNothing)

	await savedRows(result, TWO_ROW_ROUTINE, [
		{
			...READ_ROWS[0],
			value: "7",
			readAs: { operator: "gt", fieldType: "number" },
		},
		READ_ROWS[1],
	])

	expect(writtenRows()).toEqual([
		{ field: "unreadCount", operator: "gt", value: 7 },
		{ field: "subject", operator: "contains", value: "invoice" },
	])
})

it("writes a renamed path in the type the row was read with", async () => {
	const result = await mountOwnedRoutine([TWO_ROW_ROUTINE], declaringNothing)

	await savedRows(result, TWO_ROW_ROUTINE, [
		{
			...READ_ROWS[0],
			field: "unreadCounts",
			value: "7",
			readAs: { operator: "gt", fieldType: "number" },
		},
		READ_ROWS[1],
	])

	expect(writtenRows()).toEqual([
		{ field: "unreadCounts", operator: "gt", value: 7 },
		{ field: "subject", operator: "contains", value: "invoice" },
	])
})

it("lands back on the detail when the form it opened is saved", async () => {
	const result = await mountLeadRoutines([ROUTINE])
	readRuns.mockResolvedValue([])

	await act(async () => {
		result.current.detail.onOpen(ROUTINE.id)
	})
	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})

	update.mockResolvedValueOnce({ ...ROUTINE, title: "Morning report" })
	await act(async () => {
		result.current.form.onSave(
			entered({ ...A_SCHEDULE_FORM, title: "Morning report" }),
		)
	})

	expect(result.current.form.open).toBeNull()
	expect(result.current.detail.open?.title).toBe("Morning report")
})

it("leaves the routines list reachable when the runs cannot be read", async () => {
	const result = await mountLeadRoutines([ROUTINE])
	readRuns.mockRejectedValueOnce(new Error("the runs are unreadable"))

	await act(async () => {
		result.current.detail.onOpen(ROUTINE.id)
	})

	await waitFor(() =>
		expect(result.current.detail.open?.hasFailedToReadRuns).toBe(true),
	)
	expect(result.current.failure).toBeNull()

	act(() => {
		result.current.detail.onClose()
	})
	expect(result.current.detail.open).toBeNull()
	expect(result.current.routines).toHaveLength(1)
})

it("re-reads the list when a routine of the open conversation changes", async () => {
	const result = await mountHeldRoutines()

	list.mockResolvedValueOnce([ROUTINE, { ...ROUTINE, id: "r-3" }])
	await announce(ROUTINE.conversationId)

	await waitFor(() => expect(result.current.routines).toHaveLength(2))
})

it("reads nothing when the change carries another conversation", async () => {
	const result = await mountHeldRoutines()

	await announce("c-other")

	expect(list).toHaveBeenCalledTimes(1)
	expect(result.current.routines).toHaveLength(1)
})

it("re-reads the run history of the open routine when a routine changes", async () => {
	const result = await mountLeadRoutines([ROUTINE])

	await act(async () => {
		result.current.detail.onOpen(ROUTINE.id)
	})
	await waitFor(() => expect(result.current.detail.open?.runs).toEqual([]))

	readRuns.mockResolvedValue([A_REPORTED_RUN])
	list.mockResolvedValueOnce([ROUTINE])
	await announce(ROUTINE.conversationId)

	await waitFor(() => expect(result.current.detail.open?.runs).toHaveLength(1))
})

it("lists the routines once for two readers of the conversation", async () => {
	list.mockResolvedValue([ROUTINE])
	sources.mockResolvedValue([])

	const { result } = renderHook(
		() => ({
			panel: useRoutines(ROUTINE.conversationId),
			card: useRoutines(ROUTINE.conversationId),
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

	await waitFor(() => expect(result.current.card.routines).toHaveLength(1))
	expect(result.current.panel.routines).toHaveLength(1)
	expect(list).toHaveBeenCalledTimes(1)
})

it("reads no routine while no host is reachable", async () => {
	reachable.host = null

	const { result } = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await act(async () => undefined)

	expect(list).not.toHaveBeenCalled()
	expect(result.current.routines).toEqual([])
	expect(result.current.failure).toBeNull()
})

it("reads the routines again when their conversation is mounted again", async () => {
	list.mockResolvedValue([ROUTINE])
	sources.mockResolvedValue([])
	const { wrapper } = createQueryTestWrapper()
	const first = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper,
	})
	await waitFor(() => expect(first.result.current.routines).toHaveLength(1))
	first.unmount()

	list.mockResolvedValue([ROUTINE, WEBHOOK_ROUTINE])
	const second = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper,
	})

	await waitFor(() =>
		expect(second.result.current.routines.map(({ id }) => id)).toEqual([
			ROUTINE.id,
			WEBHOOK_ROUTINE.id,
		]),
	)
	expect(list).toHaveBeenCalledTimes(2)
})

it("reads the routines once while their panel stays mounted", async () => {
	list.mockResolvedValue([ROUTINE])
	sources.mockResolvedValue([])

	const { result, rerender } = renderHook(
		() => useRoutines(ROUTINE.conversationId),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	rerender()
	await act(() => new Promise((settle) => setTimeout(settle, 0)))

	expect(list).toHaveBeenCalledTimes(1)
})

it("waits on its first read of the routines while nothing is held", () => {
	list.mockReturnValue(new Promise(() => undefined))
	sources.mockResolvedValue([])

	const { result } = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	expect(result.current.isPending).toBe(true)
})

it("keeps the routines it holds while it reads them again", async () => {
	const result = await mountHeldRoutines()
	list.mockReturnValue(new Promise(() => undefined))

	act(() => result.current.reload())

	expect(list).toHaveBeenCalledTimes(2)
	expect(result.current.isPending).toBe(false)
	expect(result.current.routines).toHaveLength(1)
})

it("stops waiting on the routines once their first read fails", async () => {
	list.mockRejectedValueOnce(new Error("read refused"))
	sources.mockResolvedValue([])

	const { result } = renderHook(() => useRoutines(ROUTINE.conversationId), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(result.current.failure).toBe("routines"))

	expect(result.current.isPending).toBe(false)
})
