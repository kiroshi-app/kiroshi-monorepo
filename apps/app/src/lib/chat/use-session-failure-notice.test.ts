// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { type ChatError, chatErrorOf, toTransportError } from "./chat-state"
import { useSessionFailureNotice } from "./use-session-failure-notice"

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

const mountOn = (error: ChatError, onDismiss = vi.fn()) =>
	renderHook(() => useSessionFailureNotice({ error, onDismiss }))

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
		description: i18n.t("chat:screen.transport.resumeFailed"),
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

it("keeps the sticky notice of every other failure", () => {
	mountOn(crashed)

	expect(transientNotice).not.toHaveBeenCalled()
	expect(failureNotice).toHaveBeenCalledWith(
		expect.objectContaining({
			title: i18n.t("chat:screen.notice.crashed"),
		}),
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
