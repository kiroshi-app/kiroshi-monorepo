import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	createHttpHost,
	type HostRefusal,
	type HostSocket,
	raiseRefusalNotice,
} from "./http"

import { toTransportError } from "../chat/chat-state"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

const failureNotice = vi.mocked(raiseFailureNotice)

const HOST = "http://127.0.0.1:45367"

type Answer = {
	status?: number
	body?: BodyInit
	type?: string
}

const answerWith = ({ status = 200, body = "null", type }: Answer) =>
	new Response(body, {
		status,
		headers: type ? { "content-type": type } : {},
	})

const socketStub = () => {
	const socket: HostSocket = {
		onopen: null,
		onmessage: null,
		onclose: null,
		close: () => undefined,
	}
	return {
		socket,
		open: () => socket.onopen?.call(socket as WebSocket, new Event("open")),
		drop: () =>
			socket.onclose?.call(
				socket as WebSocket,
				new Event("close") as CloseEvent,
			),
		send: (frame: unknown) =>
			socket.onmessage?.call(
				socket as WebSocket,
				new MessageEvent("message", { data: JSON.stringify(frame) }),
			),
		sendRaw: (data: string) =>
			socket.onmessage?.call(
				socket as WebSocket,
				new MessageEvent("message", { data }),
			),
	}
}

type HostSeed = {
	answer?: Answer
	unreachable?: boolean
}

const hostOf = ({ answer = {}, unreachable = false }: HostSeed = {}) => {
	const fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
		if (init?.signal?.aborted) {
			throw init.signal.reason
		}
		if (unreachable) {
			throw new TypeError("Failed to fetch")
		}
		return answerWith(answer)
	})
	const sockets: ReturnType<typeof socketStub>[] = []
	const socketUrls: string[] = []
	const onDown = vi.fn()
	const onUp = vi.fn()
	const onReopened = vi.fn()
	const onRefused = vi.fn()
	const host = createHttpHost({
		host: HOST,
		token: "abc",
		fetch,
		openSocket: (url) => {
			const stub = socketStub()
			sockets.push(stub)
			socketUrls.push(url)
			return stub.socket
		},
		onDown,
		onUp,
		onReopened,
		onRefused,
	})
	return {
		host,
		fetch,
		sockets,
		socketUrls,
		onDown,
		onUp,
		onReopened,
		onRefused,
	}
}

describe("invoke over http", () => {
	it("posts the arguments as json with the bearer token", async () => {
		const { host, fetch } = hostOf({
			answer: { body: '{"id":"b1"}', type: "application/json" },
		})

		await expect(
			host.invoke("conversation_set_bot_memory", {
				id: "b1",
				bytes: new Uint8Array([1, 2]),
			}),
		).resolves.toEqual({ id: "b1" })
		expect(fetch).toHaveBeenCalledWith(
			new URL(`${HOST}/api/invoke/conversation_set_bot_memory`),
			{
				method: "POST",
				headers: {
					authorization: "Bearer abc",
					"content-type": "application/json",
				},
				body: '{"id":"b1","bytes":[1,2]}',
			},
		)
	})

	it("answers bytes as an array buffer", async () => {
		const { host } = hostOf({
			answer: {
				body: new Uint8Array([7]),
				type: "application/octet-stream",
			},
		})

		const answer = await host.invoke<ArrayBuffer>("bundle_export")

		expect([...new Uint8Array(answer)]).toEqual([7])
	})

	it("hands the status of a host failure to the refusal", async () => {
		const { host, onRefused } = hostOf({
			answer: { status: 500, body: "the host broke" },
		})

		await expect(host.invoke("agent_models")).rejects.toThrow("the host broke")
		expect(onRefused).toHaveBeenCalledExactlyOnceWith({
			message: "the host broke",
			command: "agent_models",
			status: 500,
			side: "member",
		})
	})

	it("rejects with the command error the host relayed", async () => {
		const { host, onRefused } = hostOf({
			answer: {
				status: 500,
				body: '{"kind":"notFound"}',
				type: "application/json",
			},
		})

		await expect(host.invoke("conversation_delete_bot")).rejects.toEqual({
			kind: "notFound",
		})
		expect(onRefused).not.toHaveBeenCalled()
	})

	it("hands a relayed command error to the chat with its own kind", async () => {
		const { host } = hostOf({
			answer: {
				status: 500,
				body: '{"kind":"spawnFailed","detail":"no agent binary"}',
				type: "application/json",
			},
		})

		const reason = await host
			.invoke("agent_start_or_resume_session")
			.catch((reason: unknown) => reason)

		expect(toTransportError(reason)).toEqual({
			kind: "spawnFailed",
			detail: "no agent binary",
		})
	})

	it("reads a plain text refusal as its text alone", async () => {
		const { host } = hostOf({
			answer: {
				status: 403,
				body: "this command reaches outside the shared space",
			},
		})

		const reason = await host
			.invoke("mission_space_feed")
			.catch((reason: unknown) => reason)

		expect(String(reason)).toBe("this command reaches outside the shared space")
		expect(toTransportError(reason)).toEqual({
			kind: "unknownFailure",
			detail: "this command reaches outside the shared space",
		})
	})

	it("rejects a call carrying a bad token", async () => {
		const { host, onRefused } = hostOf({
			answer: { status: 401, body: "the call carried no valid bearer token" },
		})

		await expect(host.invoke("agent_models")).rejects.toThrow(
			"the call carried no valid bearer token",
		)
		expect(onRefused).toHaveBeenCalledExactlyOnceWith({
			message: "the call carried no valid bearer token",
			command: "agent_models",
			status: 401,
			side: "member",
		})
	})

	it("rejects and raises one notice when the host cannot be reached", async () => {
		const { host, onRefused } = hostOf({ unreachable: true })

		await expect(host.invoke("agent_models")).rejects.toThrow("Failed to fetch")
		expect(onRefused).toHaveBeenCalledExactlyOnceWith({
			message: "Failed to fetch",
			command: "agent_models",
			status: undefined,
			side: "member",
		})
	})
})

const abortedBy = (reason: DOMException) => {
	const controller = new AbortController()
	controller.abort(reason)
	return controller.signal
}

describe("a request the caller stops waiting on", () => {
	it("hands the signal to the request and rejects with its reason, refusing nothing", async () => {
		const { host, fetch, onRefused, onDown } = hostOf()
		const signal = abortedBy(new DOMException("cancelled", "AbortError"))

		await expect(
			host.invoke("conversation_page", {}, signal),
		).rejects.toMatchObject({ name: "AbortError" })
		expect(fetch).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({ signal }),
		)
		expect(onRefused).not.toHaveBeenCalled()
		expect(onDown).not.toHaveBeenCalled()
	})

	it("reports the host down when it does not answer in time", async () => {
		const { host, onRefused, onDown } = hostOf()
		const signal = abortedBy(new DOMException("too late", "TimeoutError"))

		await expect(host.invoke("conversation_page", {}, signal)).rejects.toEqual({
			kind: "hostOffline",
			detail: "too late",
		})
		expect(onDown).toHaveBeenCalledOnce()
		expect(onRefused).not.toHaveBeenCalled()
	})
})

describe("a host that is offline", () => {
	const offline = { status: 503, body: "the host of this space is offline" }
	const HOST_OFFLINE = {
		kind: "hostOffline",
		detail: "the host of this space is offline",
	}

	it("rejects every request with the host-offline cause and no refusal", async () => {
		const { host, onRefused } = hostOf({ answer: offline })

		const refusals = [host.invoke("bot_list"), host.invoke("conversation_list")]

		for (const refusal of refusals) {
			await expect(refusal).rejects.toEqual(HOST_OFFLINE)
		}
		expect(onRefused).not.toHaveBeenCalled()
	})

	it("reports the host down once across repeated refusals and a socket close", async () => {
		const { host, sockets, onDown } = hostOf({ answer: offline })
		host.openEvents()

		await expect(host.invoke("bot_list")).rejects.toMatchObject(HOST_OFFLINE)
		sockets[0]?.drop()
		await expect(host.invoke("bot_list")).rejects.toMatchObject(HOST_OFFLINE)

		expect(onDown).toHaveBeenCalledOnce()
	})

	it("reports the host up once a request succeeds after it went down", async () => {
		const { host, fetch, onDown, onUp } = hostOf({ answer: offline })
		host.openEvents()
		await expect(host.invoke("bot_list")).rejects.toMatchObject(HOST_OFFLINE)

		fetch.mockResolvedValueOnce(answerWith({}))
		await host.invoke("bot_list")

		expect(onDown).toHaveBeenCalledOnce()
		expect(onUp).toHaveBeenCalledOnce()
	})

	it("reports no reopen when a request brings the host back up on an open socket", async () => {
		const { host, fetch, sockets, onReopened } = hostOf({ answer: offline })
		host.openEvents()
		sockets[0]?.open()
		await expect(host.invoke("bot_list")).rejects.toMatchObject(HOST_OFFLINE)

		fetch.mockResolvedValueOnce(answerWith({}))
		await host.invoke("bot_list")

		expect(onReopened).not.toHaveBeenCalled()
	})

	it("reports nothing up when a request succeeds before the host was ever down", async () => {
		const { host, onUp } = hostOf()

		await host.invoke("bot_list")

		expect(onUp).not.toHaveBeenCalled()
	})

	it("keeps refusing another cause with its text and status", async () => {
		const { host, onDown, onRefused } = hostOf({
			answer: { status: 502, body: "the host broke" },
		})

		await expect(host.invoke("bot_list")).rejects.toThrow("the host broke")
		expect(onRefused).toHaveBeenCalledExactlyOnceWith({
			message: "the host broke",
			command: "bot_list",
			status: 502,
			side: "member",
		})
		expect(onDown).not.toHaveBeenCalled()
	})
})

describe("the refusal notice", () => {
	const memberRefusal = (message: string, status?: number): HostRefusal => ({
		message,
		command: "bot_list",
		status,
		side: "member",
	})

	const refusalReport = (httpStatus: number | undefined) =>
		expect.objectContaining({
			raisedIn: "host-refusal",
			command: "bot_list",
			httpStatus,
			side: "member",
		})

	beforeEach(() => failureNotice.mockClear())

	it("asks to reopen the link when the host answers 401", () => {
		raiseRefusalNotice(memberRefusal("no valid bearer token", 401))

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "The host refused this call.",
			description: "Open the link from the desktop app again.",
			report: refusalReport(401),
		})
	})

	it("names the host as the one to ask when the host keeps the command", () => {
		raiseRefusalNotice(memberRefusal("this command belongs to the host", 403))

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t send that request",
			description:
				"Only the host of this space can do that. Ask them to do it from their Kiroshi.",
			report: refusalReport(403),
		})
	})

	it("names the shared space when the host keeps the command outside it", () => {
		raiseRefusalNotice(
			memberRefusal("this command reaches outside the shared space", 403),
		)

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t send that request",
			description: "this command reaches outside the shared space",
			report: refusalReport(403),
		})
	})

	it("shows the host text when the host answers another status", () => {
		raiseRefusalNotice(memberRefusal("the host broke", 500))

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t send that request",
			description: "the host broke",
			report: refusalReport(500),
		})
	})

	it("shows the host text when the host could not be reached", () => {
		raiseRefusalNotice(memberRefusal("Failed to fetch"))

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn’t send that request",
			description: "Failed to fetch",
			report: refusalReport(undefined),
		})
	})
})

describe("listen over the event socket", () => {
	it("opens one socket for every listener, with the token", async () => {
		const { host, sockets, socketUrls } = hostOf()

		await host.listen("mission://changed", () => undefined)
		await host.listen("routine://changed", () => undefined)

		expect(sockets).toHaveLength(1)
		expect(socketUrls).toEqual(["ws://127.0.0.1:45367/api/events?token=abc"])
	})

	it("delivers a frame to the listeners of its event only", async () => {
		const { host, sockets } = hostOf()
		const missions = vi.fn()
		const routines = vi.fn()
		await host.listen("mission://changed", missions)
		await host.listen("routine://changed", routines)

		sockets[0]?.send({ event: "mission://changed", payload: { id: "m1" } })

		expect(missions).toHaveBeenCalledWith({
			event: "mission://changed",
			id: 0,
			payload: { id: "m1" },
		})
		expect(routines).not.toHaveBeenCalled()
	})

	it("stops delivering to a listener once it unsubscribes", async () => {
		const { host, sockets } = hostOf()
		const missions = vi.fn()
		const unlisten = await host.listen("mission://changed", missions)

		unlisten()
		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(missions).not.toHaveBeenCalled()
	})

	it("drops a frame that is not json and keeps delivering", async () => {
		const { host, sockets } = hostOf()
		const missions = vi.fn()
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await host.listen("mission://changed", missions)

		expect(() => sockets[0]?.sendRaw("not json")).not.toThrow()
		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(logged).toHaveBeenCalled()
		expect(missions).toHaveBeenCalledOnce()
		logged.mockRestore()
	})

	it("delivers to every listener when one of them throws", async () => {
		const { host, sockets } = hostOf()
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const later = vi.fn()
		await host.listen("mission://changed", () => {
			throw new Error("broken listener")
		})
		await host.listen("mission://changed", later)

		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(later).toHaveBeenCalledOnce()
		logged.mockRestore()
	})

	it("keeps a later listener when an earlier one unsubscribes twice", async () => {
		const { host, sockets } = hostOf()
		const unlisten = await host.listen("mission://changed", () => undefined)
		unlisten()
		const later = vi.fn()
		await host.listen("mission://changed", later)

		unlisten()
		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(later).toHaveBeenCalledOnce()
	})
})

describe("reconnecting the event socket", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("reconnects with growing delays and raises a notice while down", async () => {
		const { host, sockets, onDown, onUp } = hostOf()
		await host.listen("mission://changed", () => undefined)

		sockets[0]?.drop()
		expect(onDown).toHaveBeenCalledOnce()
		vi.advanceTimersByTime(500)
		expect(sockets).toHaveLength(2)

		sockets[1]?.drop()
		vi.advanceTimersByTime(500)
		expect(sockets).toHaveLength(2)
		vi.advanceTimersByTime(500)
		expect(sockets).toHaveLength(3)
		expect(onDown).toHaveBeenCalledOnce()

		sockets[2]?.open()
		expect(onUp).toHaveBeenCalledOnce()
	})

	it("delivers frames on the reconnected socket", async () => {
		const { host, sockets } = hostOf()
		const missions = vi.fn()
		await host.listen("mission://changed", missions)

		sockets[0]?.drop()
		vi.advanceTimersByTime(500)
		sockets[1]?.open()
		sockets[1]?.send({ event: "mission://changed", payload: {} })

		expect(missions).toHaveBeenCalledOnce()
	})

	it("reports a reopen on each socket that opens after a drop, never on the first one", async () => {
		const { host, sockets, onReopened } = hostOf()
		await host.listen("mission://changed", () => undefined)
		sockets[0]?.open()
		expect(onReopened).not.toHaveBeenCalled()

		sockets[0]?.drop()
		vi.advanceTimersByTime(500)
		sockets[1]?.open()

		expect(onReopened).toHaveBeenCalledOnce()
	})
})

describe("file sources", () => {
	it("resolves an avatar path to the files route with the token", () => {
		const { host } = hostOf()

		expect(host.fileSrc("/Users/me/Library/app/avatars/b1.png")).toBe(
			`${HOST}/api/files/avatars/b1.png?token=abc`,
		)
	})

	it("resolves an attachment path to the files route with the token", () => {
		const { host } = hostOf()

		expect(host.fileSrc("C:\\Users\\me\\app\\attachments\\c1\\f 1.png")).toBe(
			`${HOST}/api/files/attachments/c1/f%201.png?token=abc`,
		)
	})

	it("leaves a path outside the served stores untouched", () => {
		const { host } = hostOf()

		expect(host.fileSrc("/tmp/other/b1.png")).toBe("/tmp/other/b1.png")
	})
})
