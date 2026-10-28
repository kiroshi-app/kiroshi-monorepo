// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type ChatError,
	chatErrorOf,
	chatReducer,
	initialChatState,
	questionRunFailureOf,
	toTransportError,
} from "./chat-state"
import { useSessionFailureNotice } from "./use-session-failure-notice"

import type { AgentEvent, TransportError } from "@/lib/agent/contract"
import type { FailureCorrelation } from "@/lib/failure-report"
import { createHttpHost } from "@/lib/host/http"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	endNotice: vi.fn(),
	raiseFailureNotice: vi.fn(() => "notice-1"),
	raiseTransientNotice: vi.fn(() => "notice-2"),
}))

const failureNotice = vi.mocked(raiseFailureNotice)
const transientNotice = vi.mocked(raiseTransientNotice)

const refusedResume = (id: string): ChatError => ({
	id,
	error: { kind: "resumeFailed", forgotSessionId: true },
})

const crashed: ChatError = {
	id: "error-crashed",
	error: { kind: "crashed", code: null, detail: null },
}

const leftOutApplication: ChatError = {
	id: "error-left-out",
	error: {
		kind: "serverEnvRejected",
		detail: 'the server "atlas" was left out: it waits for your authorization',
	},
}

const THREAD_CONTEXT = {
	space: "4f1c2e9a-7b3d-4c8e-9a1f-2b6d8e0c4a7f",
	botId: "0b6d8e0c-4a7f-4f1c-9a1f-2e9a7b3d4c8e",
	botName: "Atlas",
	conversation: "9a1f2b6d-8e0c-4a7f-8c8e-4f1c2e9a7b3d",
	session: "7b3d4c8e-9a1f-4b6d-8e0c-4a7f4f1c2e9a",
}

const failedStop: ChatError = { ...crashed, isStopFailure: true }

const mountOn = (
	error: ChatError,
	onDismiss = vi.fn(),
	context: FailureCorrelation = THREAD_CONTEXT,
) => renderHook(() => useSessionFailureNotice({ error, onDismiss, context }))

const raisedNotice = () =>
	vi.waitFor(() => {
		expect(failureNotice).toHaveBeenCalledTimes(1)
		return failureNotice.mock.calls[0][0]
	})

beforeEach(() => {
	failureNotice.mockClear()
	transientNotice.mockClear()
})

afterEach(() => {
	cleanup()
})

it("fades the notice of a refused resume away on its own", () => {
	mountOn(refusedResume("error-refused"))

	expect(failureNotice).not.toHaveBeenCalled()
	expect(transientNotice).toHaveBeenCalledWith({
		type: "warning",
		title: i18n.t("chat:screen.notice.resumeFailed"),
		description:
			"Atlas started a new session. Keep going, your messages are still here.",
	})
})

it("dismisses the refused resume it faded away", () => {
	const onDismiss = vi.fn()

	mountOn(refusedResume("error-dismissed"), onDismiss)

	expect(onDismiss).toHaveBeenCalledWith("error-dismissed")
})

it("raises one notice for a refused resume however often the thread renders", () => {
	const error = refusedResume("error-once")
	const { rerender } = mountOn(error)

	rerender()
	rerender()
	mountOn(error)

	expect(transientNotice).toHaveBeenCalledTimes(1)
})

it("fades a second refused resume of its own", () => {
	mountOn(refusedResume("error-first"))
	mountOn(refusedResume("error-second"))

	expect(transientNotice).toHaveBeenCalledTimes(2)
})

it("keeps the sticky notice of every other failure", async () => {
	mountOn(crashed)

	await vi.waitFor(() =>
		expect(failureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("chat:screen.notice.crashedNamed", { name: "Atlas" }),
			}),
		),
	)
	expect(transientNotice).not.toHaveBeenCalled()
})

it("titles the notice of a failed Stop with the companion it names", async () => {
	mountOn(failedStop)

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.stopFailedNamed", { name: "Atlas" }),
	})
})

it("titles the notice of a failed Stop without a name when the companion's name is blank", async () => {
	mountOn(failedStop, vi.fn(), { ...THREAD_CONTEXT, botName: "  " })

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.stopFailed"),
	})
})

it("titles the notice of a failed Stop without a name when the companion is unknown", async () => {
	const { botName: _, ...nameless } = THREAD_CONTEXT
	mountOn(failedStop, vi.fn(), nameless)

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.stopFailed"),
	})
})

it("keeps the description and action of the failure a Stop ran into", async () => {
	mountOn(crashed)
	const plain = await raisedNotice()
	cleanup()
	failureNotice.mockClear()

	mountOn(failedStop)
	const stop = await raisedNotice()

	expect(stop.description).toBe(plain.description)
	expect(stop.action).toEqual(plain.action)
})

it("names the agent that crashed, in the title and the description", async () => {
	mountOn({ ...crashed, botId: THREAD_CONTEXT.botId })

	expect(await raisedNotice()).toMatchObject({
		title: "Atlas stopped",
		description: "Atlas exited (code unknown). Restart the session.",
	})
})

it("keeps the crash copy unnamed when the agent's name is blank", async () => {
	mountOn(crashed, vi.fn(), { ...THREAD_CONTEXT, botName: "  " })

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.crashed"),
		description: i18n.t("chat:screen.transport.crashedUnknownCode"),
	})
})

it("keeps the crash code and detail beside the agent's name", async () => {
	mountOn({
		id: "error-exited",
		error: { kind: "crashed", code: 137, detail: "out of memory" },
	})

	expect((await raisedNotice()).description).toBe(
		"Atlas exited (code 137): out of memory. Restart the session.",
	)
})

const UNREACHED: TransportError = {
	kind: "spawnFailed",
	detail: "no agent binary",
}

const soloRunFailedAsking = (): ChatError | undefined =>
	(
		[
			{ type: "turnChanged", state: "submitting" },
			{ type: "questionRequested", request: { id: "ask-1", questions: [] } },
			{ type: "failed", error: crashed.error },
		] satisfies AgentEvent[]
	)
		.reduce(
			(state, event) =>
				chatReducer(state, { type: "driverEvent", scope: null, event }, 0),
			initialChatState,
		)
		.errors.at(-1)

const groupRunFailedAsking: ChatError = {
	...questionRunFailureOf(UNREACHED, 0),
	botId: THREAD_CONTEXT.botId,
}

const questionRunNotice = {
	title: i18n.t("chat:screen.notice.questionRunFailed.title", {
		name: "Atlas",
	}),
	description: i18n.t("chat:screen.notice.questionRunFailed.description"),
}

it("names the companion whose solo run failed before its question was answered", async () => {
	const error = soloRunFailedAsking()
	if (!error) {
		return expect.unreachable("the failed run left no error")
	}
	const onRestart = vi.fn()

	renderHook(() =>
		useSessionFailureNotice({
			error,
			onDismiss: vi.fn(),
			onRestart,
			context: THREAD_CONTEXT,
		}),
	)

	const notice = await raisedNotice()
	expect(notice).toMatchObject(questionRunNotice)
	expect(notice.title).not.toBe(i18n.t("chat:screen.notice.crashed"))
	expect(notice.action).toEqual({
		label: i18n.t("chat:screen.restart"),
		onPress: onRestart,
	})
})

it("names the companion whose group run failed before its question was answered", async () => {
	mountOn(groupRunFailedAsking)

	const notice = await raisedNotice()
	expect(notice).toMatchObject(questionRunNotice)
	expect(notice.title).not.toBe(i18n.t("chat:screen.notice.unavailable"))
})

it("names the unreachable agent of a failed run that held no question", async () => {
	mountOn(chatErrorOf(UNREACHED, 0))

	expect(await raisedNotice()).toMatchObject({
		title: "Couldn’t reach Atlas",
		description: "Couldn’t start Atlas (no agent binary). Restart the session.",
	})
})

it("keeps the unreachable copy unnamed when the agent's name is empty", async () => {
	mountOn(chatErrorOf(UNREACHED, 0), vi.fn(), {
		...THREAD_CONTEXT,
		botName: "",
	})

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.unavailable"),
		description: i18n.t("chat:screen.transport.spawnFailed", {
			detail: "no agent binary",
		}),
	})
})

it("keeps a transport description without a named twin unnamed", async () => {
	mountOn(chatErrorOf({ kind: "writeFailed", detail: "pipe closed" }, 0))

	expect((await raisedNotice()).description).toBe(
		i18n.t("chat:screen.transport.writeFailed", { detail: "pipe closed" }),
	)
})

it("keeps the title of a failed question run when the companion is unknown", async () => {
	const { botName: _, ...nameless } = THREAD_CONTEXT

	mountOn(groupRunFailedAsking, vi.fn(), nameless)

	expect(await raisedNotice()).toMatchObject({
		title: i18n.t("chat:screen.notice.unavailable"),
	})
})

it("reports the space, the bot, the conversation and the session of the thread", async () => {
	mountOn(crashed)

	await vi.waitFor(() =>
		expect(failureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				report: expect.objectContaining({
					context: expect.objectContaining(THREAD_CONTEXT),
				}),
			}),
		),
	)
})

it("raises no notice for an application left out of the session", () => {
	const onDismiss = vi.fn()

	mountOn(leftOutApplication, onDismiss)

	expect(failureNotice).not.toHaveBeenCalled()
	expect(transientNotice).not.toHaveBeenCalled()
	expect(onDismiss).not.toHaveBeenCalled()
})

const offlineRejection = async (): Promise<unknown> => {
	const host = createHttpHost({
		host: "http://127.0.0.1:45367",
		token: "abc",
		fetch: async () =>
			new Response("the host of this space is offline", { status: 503 }),
		openSocket: () => ({
			onopen: null,
			onmessage: null,
			onclose: null,
			close: () => undefined,
		}),
		onDown: vi.fn(),
		onUp: vi.fn(),
		onReopened: vi.fn(),
		onRefused: vi.fn(),
	})
	return host.invoke("conversation_send").then(
		() => expect.unreachable("an offline host answered"),
		(reason: unknown) => reason,
	)
}

it("raises no session notice when the host of the space is offline", async () => {
	const offline = chatErrorOf(toTransportError(await offlineRejection()), 0)

	mountOn(offline)

	expect(offline.error.kind).toBe("hostOffline")
	expect(failureNotice).not.toHaveBeenCalled()
	expect(transientNotice).not.toHaveBeenCalled()
})
