import type { EventCallback } from "@tauri-apps/api/event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { activateLanguage, type Language } from "@workspace/ui/lib/i18n"

import { FIRST_RECONNECT_DELAY, type HostSocket } from "./http"
import {
	createJoinedHosts,
	JOINED_SPACE_CHANGED_EVENT,
	type JoinedHosts,
	type JoinedHostsOptions,
	LOCAL_COMMANDS,
} from "./joined-hosts"

import {
	JOINED_SPACE_RECONNECTED_EVENT,
	type JoinedSpaceError,
	type JoinedSpaceReconnected,
} from "../bindings"
import type { ReporterFacts } from "../failure-report"
import reachSource from "../../../src-tauri/src/hosting/reach.rs?raw"

const HOST = "http://192.168.1.20:45367"

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
	}
}

const joinedConnection = (id: string) => ({
	status: "ok" as const,
	data: { id, hostUrl: HOST, token: "joined", remoteSpaceId: null, name: id },
})

type Seed = {
	join?: JoinedHostsOptions["join"]
	answer?: () => Response
}

const answerJoined = () =>
	new Response('"joined"', {
		headers: { "content-type": "application/json" },
	})

const joinedHostsOf = ({ join, answer = answerJoined }: Seed = {}) => {
	const localUnlisten = vi.fn()
	const local = {
		invoke: vi.fn(async (_command: string) => "local" as never),
		listen: vi.fn(
			async (_event: string, _handler: EventCallback<never>) => localUnlisten,
		),
		fileSrc: vi.fn((path: string) => `asset://${path}`),
	}
	const fetch = vi.fn(async () => answer())
	const sockets: ReturnType<typeof socketStub>[] = []
	const socketUrls: string[] = []
	const reportFailure = vi.fn()
	const reportJoinRefusal =
		vi.fn<(notice: NoticeMessage, facts: ReporterFacts) => void>()
	const joinSpy = vi.fn(join ?? (async (id: string) => joinedConnection(id)))
	const hosts = createJoinedHosts({
		local,
		join: joinSpy,
		fetch,
		openSocket: (url) => {
			const stub = socketStub()
			sockets.push(stub)
			socketUrls.push(url)
			return stub.socket
		},
		reportFailure,
		reportJoinRefusal,
	})
	return {
		hosts,
		local,
		localUnlisten,
		fetch,
		sockets,
		socketUrls,
		reportFailure,
		reportJoinRefusal,
		join: joinSpy,
	}
}

const emitLocally = (
	local: ReturnType<typeof joinedHostsOf>["local"],
	payload: unknown,
) => {
	const [event, handler] = local.listen.mock.calls[0] ?? []
	handler?.({ event: event ?? "", id: 0, payload } as never)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const HOST_ONLY_REFUSAL = "this command belongs to the host"

const hostOnlyRefusalOf = (command: string) => ({
	message: HOST_ONLY_REFUSAL,
	command,
	status: 403,
	side: "member",
})

const STORAGE_FAILURE = {
	kind: "sqlite",
	detail: "database is locked",
} as const

const REFUSALS: JoinedSpaceError[] = [
	{ kind: "unavailable", failure: STORAGE_FAILURE },
	{ kind: "storage", failure: STORAGE_FAILURE },
	{ kind: "unknownJoinedSpace", id: "garage" },
	{ kind: "undeliverable", detail: "the local server answers no call" },
	{ kind: "hostOffline", id: "garage" },
	{ kind: "proxyUnavailable", detail: "address already in use" },
]

const REFUSAL_KINDS = REFUSALS.map(({ kind }) => kind)

const CARDED_REFUSALS = REFUSALS.filter(({ kind }) => kind !== "hostOffline")

const HOST_OFFLINE_REFUSAL: JoinedSpaceError = {
	kind: "hostOffline",
	id: "garage",
}

const LANGUAGES: Language[] = ["en", "fr"]

const HOST_OFFLINE_NOTICES: Record<Language, NoticeMessage> = {
	en: {
		title: "Couldn’t reach the host of this space",
		description: "Its computer is offline. Try again once it’s back online.",
	},
	fr: {
		title: "Impossible de joindre l’hôte de cet espace",
		description:
			"Son ordinateur est hors ligne. Réessayez une fois qu’il est de nouveau en ligne.",
	},
}

const refusedNoticeOf = async (refusal: JoinedSpaceError) => {
	const { hosts, reportJoinRefusal } = joinedHostsOf({
		join: async () => ({ status: "error", error: refusal }),
	})
	await hosts.connect("garage")
	expect(reportJoinRefusal).toHaveBeenCalledOnce()
	return reportJoinRefusal.mock.calls[0]?.[0] as NoticeMessage
}

const textOf = ({ title, description }: NoticeMessage) =>
	`${title} ${description ?? ""}`

describe("a refused join", () => {
	afterEach(() => activateLanguage("en"))

	describe.each(LANGUAGES)("in %s", (language) => {
		it.each(CARDED_REFUSALS)(
			"says why the $kind refusal happened in a sentence",
			async (refusal) => {
				activateLanguage(language)

				const notice = await refusedNoticeOf(refusal)

				expect(notice.title).toMatch(/\p{L}{2,}/u)
				expect(notice.description).toMatch(/\p{L}{2,}/u)
				for (const kind of REFUSAL_KINDS) {
					expect(textOf(notice)).not.toContain(kind)
				}
				if ("detail" in refusal) {
					expect(textOf(notice)).not.toContain(refusal.detail)
				}
			},
		)

		it("raises no card on a hostOffline refusal and marks the host refused", async () => {
			activateLanguage(language)
			const { hosts, reportJoinRefusal, reportFailure } = joinedHostsOf({
				join: async () => ({ status: "error", error: HOST_OFFLINE_REFUSAL }),
			})

			await hosts.connect("garage")

			expect(reportJoinRefusal).not.toHaveBeenCalled()
			expect(reportFailure).not.toHaveBeenCalled()
			expect(hosts.getState().connections.garage).toEqual({
				status: "refused",
				failure: HOST_OFFLINE_NOTICES[language].title,
			})
		})

		it("gives every refusal kind its own sentence", async () => {
			activateLanguage(language)

			const notices = await Promise.all(CARDED_REFUSALS.map(refusedNoticeOf))

			expect(new Set(notices.map(textOf)).size).toBe(CARDED_REFUSALS.length)
		})
	})
})

const THROWN_MESSAGE = "ipc channel closed unexpectedly"

const UNEXPECTED_NOTICES: Record<Language, NoticeMessage> = {
	en: {
		title: "Something went wrong with this space",
		description: "Kiroshi couldn’t finish the request. Try again in a moment.",
	},
	fr: {
		title: "Un problème est survenu avec cet espace",
		description:
			"Kiroshi n’a pas pu terminer la demande. Réessayez dans un instant.",
	},
}

const thrownJoinOf = async (thrown: unknown) => {
	const { hosts, reportFailure, reportJoinRefusal } = joinedHostsOf({
		join: async () => {
			throw thrown
		},
	})
	await hosts.connect("garage")
	expect(reportJoinRefusal).toHaveBeenCalledOnce()
	expect(reportFailure).not.toHaveBeenCalled()
	return {
		notice: reportJoinRefusal.mock.calls[0]?.[0] as NoticeMessage,
		connection: hosts.getState().connections.garage,
	}
}

describe("a join that throws", () => {
	afterEach(() => activateLanguage("en"))

	describe.each(LANGUAGES)("in %s", (language) => {
		it("raises the notice of the refusal kind it throws", async () => {
			activateLanguage(language)
			const refusal: JoinedSpaceError = {
				kind: "unknownJoinedSpace",
				id: "garage",
			}

			const { notice, connection } = await thrownJoinOf(refusal)

			expect(notice).toEqual(await refusedNoticeOf(refusal))
			expect(connection).toEqual({ status: "refused", failure: notice.title })
		})

		it("raises no card when it throws a hostOffline refusal", async () => {
			activateLanguage(language)
			const { hosts, reportJoinRefusal } = joinedHostsOf({
				join: async () => {
					throw HOST_OFFLINE_REFUSAL
				},
			})

			await hosts.connect("garage")

			expect(reportJoinRefusal).not.toHaveBeenCalled()
			expect(hosts.getState().connections.garage).toEqual({
				status: "refused",
				failure: HOST_OFFLINE_NOTICES[language].title,
			})
		})

		it.each([new Error(THROWN_MESSAGE), THROWN_MESSAGE])(
			"raises the generic sentence, never the thrown %s",
			async (thrown) => {
				activateLanguage(language)

				const { notice, connection } = await thrownJoinOf(thrown)

				expect(notice).toEqual(UNEXPECTED_NOTICES[language])
				for (const word of THROWN_MESSAGE.split(" ")) {
					expect(textOf(notice)).not.toContain(word)
				}
				expect(connection).toEqual({
					status: "refused",
					failure: THROWN_MESSAGE,
				})
			},
		)
	})
})

const localCommands = (local: ReturnType<typeof joinedHostsOf>["local"]) =>
	local.invoke.mock.calls.map(([command]) => command)

describe("the local command list", () => {
	it("keeps the local app commands on the local host", () => {
		expect([...LOCAL_COMMANDS]).toEqual(
			expect.arrayContaining([
				"space_list",
				"space_reorder",
				"joined_spaces_list",
				"joined_space_connect",
				"joined_space_remove",
				"joined_space_describe",
				"user_preferences",
				"user_set_preferences",
				"window_declare_maximize_button",
			]),
		)
	})

	it("keeps the device commands of the account on the local host", () => {
		expect([...LOCAL_COMMANDS]).toEqual(
			expect.arrayContaining([
				"device_approval",
				"device_approval_retry",
				"device_approval_code_request",
				"device_approval_code_submit",
				"device_approve",
				"device_refuse",
				"devices_list",
				"device_remove",
			]),
		)
	})

	it("sends no local command and no plugin call to the joined host", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		for (const command of [...LOCAL_COMMANDS, "plugin:window|minimize"]) {
			await hosts.invoke(command)
		}

		expect(fetch).not.toHaveBeenCalled()
		expect(local.invoke).toHaveBeenCalledTimes(LOCAL_COMMANDS.size + 1)
	})
})

const SIGN_IN_COMMANDS = [
	"agent_sign_in",
	"agent_sign_in_code",
	"agent_sign_in_cancel",
	"connection_set",
]

describe("the onboarding account step on a joined space", () => {
	it("reads the guest own agent account, not the joined host one", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		await hosts.invoke("agent_account")

		expect(localCommands(local)).toContain("agent_account")
		expect(fetch).not.toHaveBeenCalled()
	})

	it("signs the guest own agent in on the local host", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		for (const command of SIGN_IN_COMMANDS) {
			await hosts.invoke(command)
		}

		expect(localCommands(local)).toEqual(SIGN_IN_COMMANDS)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("hears the sign-in start from the local host", async () => {
		const { hosts, local } = joinedHostsOf()
		await hosts.activate("garage")
		const started = vi.fn()

		await hosts.listen("agent://sign-in-started", started)
		emitLocally(local, { id: "s1" })

		expect(started).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ payload: { id: "s1" } }),
			null,
		)
	})
})

describe("connecting a joined space", () => {
	it("opens one connection per joined space and reuses it", async () => {
		const { hosts, join, socketUrls } = joinedHostsOf()

		await hosts.connect("garage")
		await hosts.connect("garage")

		expect(join).toHaveBeenCalledOnce()
		expect(join).toHaveBeenCalledWith("garage")
		expect(socketUrls).toEqual([
			"ws://192.168.1.20:45367/api/events?token=joined",
		])
	})

	it("reads connecting, then up once the socket opens, then down when it closes", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const connecting = hosts.connect("garage")
		expect(hosts.getState().connections.garage).toEqual({
			status: "connecting",
		})

		await connecting
		sockets[0]?.open()
		expect(hosts.getState().connections.garage).toEqual({ status: "up" })

		vi.useFakeTimers()
		sockets[0]?.drop()
		vi.useRealTimers()
		expect(hosts.getState().connections.garage).toEqual({ status: "down" })
	})

	it("notifies a subscriber when a connection state changes", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const changed = vi.fn()
		hosts.subscribe(changed)

		await hosts.connect("garage")
		sockets[0]?.open()

		expect(changed).toHaveBeenCalledTimes(2)
	})

	it("records and surfaces the error the local host answers", async () => {
		const refusal: JoinedSpaceError = {
			kind: "unknownJoinedSpace",
			id: "garage",
		}
		const { hosts, reportFailure, reportJoinRefusal } = joinedHostsOf({
			join: async () => ({ status: "error", error: refusal }),
		})

		await hosts.connect("garage")

		expect(hosts.getState().connections.garage).toEqual({
			status: "refused",
			failure: "This space is no longer in your list",
		})
		expect(reportJoinRefusal).toHaveBeenCalledExactlyOnceWith(
			{
				title: "This space is no longer in your list",
				description: "You may have left it. Ask its host for a new invitation.",
			},
			{ command: "joined_space_connect", space: "garage" },
		)
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("reports a wait for the host with its instance and the join command", async () => {
		const refusal: JoinedSpaceError = {
			kind: "waitingForHost",
			id: "garage",
			instanceId: "instance-1",
			reason: "hostSilent",
			detail: "no verified rekey came within 15s",
		}
		const { hosts, reportJoinRefusal } = joinedHostsOf({
			join: async () => ({ status: "error", error: refusal }),
		})

		await hosts.connect("garage")

		expect(reportJoinRefusal.mock.calls[0]?.[1]).toEqual({
			command: "joined_space_connect",
			space: "instance-1",
		})
	})

	it("reports a join refused again and again only once", async () => {
		const refusal: JoinedSpaceError = {
			kind: "waitingForHost",
			id: "garage",
			instanceId: "instance-1",
			reason: "socketClosed",
			detail: "the member socket closed",
		}
		const { hosts, join, reportJoinRefusal } = joinedHostsOf({
			join: async () => ({ status: "error", error: refusal }),
		})

		await hosts.connect("garage")
		await hosts.connect("garage")
		await hosts.connect("garage")

		expect(join).toHaveBeenCalledTimes(3)
		expect(reportJoinRefusal).toHaveBeenCalledOnce()
	})

	it("reports a join rejected again and again only once", async () => {
		const { hosts, reportJoinRefusal } = joinedHostsOf({
			join: async () => {
				throw new Error("ipc closed")
			},
		})

		await hosts.connect("garage")
		await hosts.connect("garage")

		expect(reportJoinRefusal).toHaveBeenCalledOnce()
	})

	it("reports a refusal again once the connection was up in between", async () => {
		const refused = {
			status: "error" as const,
			error: { kind: "notInRoster" } satisfies JoinedSpaceError,
		}
		const join = vi
			.fn<JoinedHostsOptions["join"]>()
			.mockResolvedValueOnce(refused)
			.mockResolvedValueOnce(joinedConnection("garage"))
			.mockResolvedValueOnce(refused)
		const { hosts, sockets, reportJoinRefusal } = joinedHostsOf({ join })

		await hosts.connect("garage")
		await hosts.connect("garage")
		sockets[0]?.open()
		hosts.forget("garage")
		await hosts.connect("garage")

		expect(reportJoinRefusal).toHaveBeenCalledTimes(2)
	})

	it("records a rejected connect, then retries on the next one", async () => {
		const join = vi
			.fn<JoinedHostsOptions["join"]>()
			.mockRejectedValueOnce(new Error("ipc closed"))
			.mockImplementation(async (id) => joinedConnection(id))
		const { hosts } = joinedHostsOf({ join })

		await hosts.connect("garage")
		expect(hosts.getState().connections.garage).toEqual({
			status: "refused",
			failure: "ipc closed",
		})

		await hosts.connect("garage")
		expect(hosts.getState().connections.garage).toEqual({
			status: "connecting",
		})
	})
})

describe("the active host", () => {
	it("starts on the local host and passes every call through untouched", async () => {
		const { hosts, local } = joinedHostsOf()
		const options = { headers: { trace: "1" } }

		await expect(
			hosts.invoke("mission_board", { limit: 3 }, options),
		).resolves.toBe("local")

		expect(hosts.getState().active).toBeNull()
		expect(local.invoke).toHaveBeenCalledWith(
			"mission_board",
			{ limit: 3 },
			options,
		)
	})

	it("sends a call to the joined host with its token while it is active", async () => {
		const { hosts, local, fetch } = joinedHostsOf()

		await hosts.activate("garage")

		await expect(hosts.invoke("mission_space_feed")).resolves.toBe("joined")
		expect(hosts.getState().active).toBe("garage")
		expect(local.invoke).not.toHaveBeenCalled()
		expect(fetch).toHaveBeenCalledWith(
			new URL(`${HOST}/api/invoke/mission_space_feed`),
			expect.objectContaining({
				headers: expect.objectContaining({ authorization: "Bearer joined" }),
			}),
		)
	})

	it("goes back to the local host", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		await hosts.activate(null)
		await hosts.invoke("mission_board")

		expect(hosts.getState().active).toBeNull()
		expect(fetch).not.toHaveBeenCalled()
		expect(local.invoke).toHaveBeenCalledOnce()
	})

	it("keeps the calls pinned to this computer there when a joined space opens between them", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		const onThisComputer = hosts.invokeOn(null)

		await onThisComputer("conversation_start_turn", {
			turn: { id: "t-1", conversationId: "c-1", startedAt: 1 },
		})
		await hosts.activate("garage")
		await onThisComputer("conversation_complete_turn", {
			id: "t-1",
			completedAt: 2,
		})

		expect(local.invoke.mock.calls.map(([command]) => command)).toEqual([
			"conversation_start_turn",
			"conversation_complete_turn",
		])
		expect(fetch).not.toHaveBeenCalledWith(
			new URL(`${HOST}/api/invoke/conversation_complete_turn`),
			expect.anything(),
		)
	})

	it("stays on the local host when the joined space cannot connect", async () => {
		const { hosts } = joinedHostsOf({
			join: async () => ({
				status: "error",
				error: { kind: "undeliverable", detail: "no route" },
			}),
		})

		await hosts.activate("garage")

		expect(hosts.getState().active).toBeNull()
	})

	it("keeps the last requested host when connects settle out of order", async () => {
		const { hosts } = joinedHostsOf()

		const garage = hosts.activate("garage")
		await hosts.activate(null)
		await garage

		expect(hosts.getState().active).toBeNull()
	})

	it("holds a call made while the joined host opens, then sends it to that host only", async () => {
		let open: () => void = () => undefined
		const { hosts, local } = joinedHostsOf({
			join: (id) =>
				new Promise((resolve) => {
					open = () => resolve(joinedConnection(id))
				}),
		})

		const activating = hosts.activate("garage")
		const answer = hosts.invoke("mission_list", { conversationId: "c1" })
		open()
		await activating

		await expect(answer).resolves.toBe("joined")
		expect(localCommands(local)).not.toContain("mission_list")
	})

	it("rejects a read held by an opening host once it times out, and shows the host down", async () => {
		const { hosts } = joinedHostsOf({
			join: () => new Promise(() => undefined),
		})
		void hosts.activate("garage")
		const reading = new AbortController()

		const answer = hosts.invoke(
			"conversation_page",
			{ spaceId: "personal", cursor: null, limit: 30 },
			{ signal: reading.signal },
		)
		reading.abort(new DOMException("too late", "TimeoutError"))

		await expect(answer).rejects.toEqual({
			kind: "hostOffline",
			detail: "too late",
		})
		expect(hosts.getState().connections.garage).toEqual({ status: "down" })
	})

	it("rejects a read held by an opening host with the reason it was aborted, and keeps opening", async () => {
		let open: () => void = () => undefined
		const { hosts, join } = joinedHostsOf({
			join: (id) =>
				new Promise((resolve) => {
					open = () => resolve(joinedConnection(id))
				}),
		})
		const activating = hosts.activate("garage")
		const reading = new AbortController()
		const cancelled = new DOMException("cancelled", "AbortError")

		const answer = hosts.invoke(
			"conversation_page",
			{ spaceId: "personal", cursor: null, limit: 30 },
			{ signal: reading.signal },
		)
		reading.abort(cancelled)

		await expect(answer).rejects.toBe(cancelled)
		expect(hosts.getState().connections.garage).toEqual({
			status: "connecting",
		})
		open()
		await activating
		await expect(
			hosts.invoke("mission_list", { conversationId: "c1" }),
		).resolves.toBe("joined")
		expect(join).toHaveBeenCalledOnce()
	})

	it("names the joined Space id from the moment the joined host is selected", async () => {
		const { hosts } = joinedHostsOf({
			join: () => new Promise(() => undefined),
		})

		void hosts.activate("garage", "personal")

		expect(hosts.activeSpaceId()).toBe("personal")
	})

	it("rejects a call made while the joined host opens as host offline when it cannot connect", async () => {
		const { hosts, local } = joinedHostsOf({
			join: async () => ({
				status: "error",
				error: { kind: "undeliverable", detail: "no route" },
			}),
		})

		const activating = hosts.activate("garage")
		const answer = hosts.invoke("mission_list", { conversationId: "c1" })
		await activating

		await expect(answer).rejects.toEqual({
			kind: "hostOffline",
			detail: "joined host garage: Couldn’t open this space",
		})
		expect(localCommands(local)).not.toContain("mission_list")
	})

	it("raises no card for a call made while the joined host opens on a cold start before its host is reachable", async () => {
		const { hosts, reportFailure, reportJoinRefusal } = joinedHostsOf({
			join: async () => ({ status: "error", error: HOST_OFFLINE_REFUSAL }),
		})

		const activating = hosts.activate("garage")
		const answer = hosts.invoke("mission_list", { conversationId: "c1" })
		await activating

		await expect(answer).rejects.toMatchObject({ kind: "hostOffline" })
		expect(reportJoinRefusal).not.toHaveBeenCalled()
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("reaches up with no card once the link opens after a cold start refused it", async () => {
		const join = vi
			.fn<JoinedHostsOptions["join"]>()
			.mockResolvedValueOnce({ status: "error", error: HOST_OFFLINE_REFUSAL })
			.mockImplementation(async (id) => joinedConnection(id))
		const { hosts, sockets, reportFailure, reportJoinRefusal } = joinedHostsOf({
			join,
		})

		await hosts.connect("garage")
		await hosts.connect("garage")
		sockets[0]?.open()

		expect(hosts.getState().connections.garage).toEqual({ status: "up" })
		expect(reportJoinRefusal).not.toHaveBeenCalled()
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("sends a call to the local host once it is selected again while the joined host opens", async () => {
		const { hosts, local, fetch } = joinedHostsOf()

		const activating = hosts.activate("garage")
		await hosts.activate(null)
		await hosts.invoke("mission_list", { conversationId: "c1" })
		await activating

		expect(local.invoke).toHaveBeenCalledOnce()
		expect(fetch).not.toHaveBeenCalled()
	})

	it("builds file sources on the joined host while it is active", async () => {
		const { hosts } = joinedHostsOf()
		const avatar = "/data/avatars/b1.png"
		expect(hosts.fileSrc(avatar)).toBe(`asset://${avatar}`)

		await hosts.activate("garage")

		expect(hosts.fileSrc(avatar)).toBe(
			`${HOST}/api/files/avatars/b1.png?token=joined`,
		)
	})
})

describe("listening across hosts", () => {
	it("attaches a subscription made before the host was known once its connection opens", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const missions = vi.fn()
		await hosts.listen("mission://changed", missions)

		await hosts.connect("garage")
		sockets[0]?.send({ event: "mission://changed", payload: { id: "m1" } })

		expect(missions).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ payload: { id: "m1" } }),
			"garage",
		)
	})

	it("hears the local host and every joined host whichever space is active", async () => {
		const { hosts, local, sockets } = joinedHostsOf()
		const missions = vi.fn()
		await hosts.connect("shed")
		await hosts.activate("garage")
		await hosts.listen("mission://changed", missions)

		sockets[0]?.send({ event: "mission://changed", payload: { id: "m1" } })
		sockets[1]?.send({ event: "mission://changed", payload: { id: "m2" } })
		emitLocally(local, { id: "m3" })

		expect(
			missions.mock.calls.map(([{ payload }, hostId]) => [payload.id, hostId]),
		).toEqual([
			["m1", "shed"],
			["m2", "garage"],
			["m3", null],
		])
	})

	it("neither unlistens nor relistens when the active space changes", async () => {
		const { hosts, local, localUnlisten, sockets } = joinedHostsOf()
		const missions = vi.fn()
		await hosts.connect("garage")
		await hosts.listen("mission://changed", missions)

		await hosts.activate("garage")
		await hosts.activate(null)
		await settle()
		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(local.listen).toHaveBeenCalledOnce()
		expect(localUnlisten).not.toHaveBeenCalled()
		expect(missions).toHaveBeenCalledOnce()
	})

	it("stops every subscription on a forgotten host", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const missions = vi.fn()
		await hosts.connect("garage")
		await hosts.listen("mission://changed", missions)

		hosts.forget("garage")
		await settle()
		sockets[0]?.send({ event: "mission://changed", payload: {} })

		expect(missions).not.toHaveBeenCalled()
	})

	it("stops the event on every host once released, including a host joined afterwards", async () => {
		const { hosts, localUnlisten, sockets } = joinedHostsOf()
		const missions = vi.fn()
		await hosts.connect("garage")
		const unlisten = await hosts.listen("mission://changed", missions)

		unlisten()
		sockets[0]?.send({ event: "mission://changed", payload: {} })
		await hosts.connect("shed")
		sockets[1]?.send({ event: "mission://changed", payload: {} })

		expect(localUnlisten).toHaveBeenCalledOnce()
		expect(missions).not.toHaveBeenCalled()
	})

	it("hears a local event from the local host only", async () => {
		const { hosts, local, sockets } = joinedHostsOf()
		const hostingChanged = vi.fn()
		await hosts.activate("garage")

		await hosts.listen("hosting://changed", hostingChanged)
		sockets[0]?.send({ event: "hosting://changed", payload: {} })

		expect(local.listen).toHaveBeenCalledOnce()
		expect(hostingChanged).not.toHaveBeenCalled()
	})
})

describe("listening to the active host only", () => {
	it("hears nothing while the local host is active", async () => {
		const { hosts, local } = joinedHostsOf()

		await hosts.listenToActiveHost("companion://created", vi.fn())

		expect(local.listen).not.toHaveBeenCalled()
	})

	it("hears a local event emitted by the joined host once it is active", async () => {
		const { hosts, local, sockets } = joinedHostsOf()
		const fromHost = vi.fn()
		await hosts.listenToActiveHost("companion://created", fromHost)

		await hosts.activate("garage")
		await settle()
		sockets[0]?.send({ event: "companion://created", payload: { id: "b9" } })

		expect(local.listen).not.toHaveBeenCalled()
		expect(fromHost).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ payload: { id: "b9" } }),
			"garage",
		)
	})

	it("stops hearing the joined host once the local host is active again", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const fromHost = vi.fn()
		await hosts.activate("garage")
		await hosts.listenToActiveHost("companion://created", fromHost)

		await hosts.activate(null)
		await settle()
		sockets[0]?.send({ event: "companion://created", payload: { id: "b9" } })

		expect(fromHost).not.toHaveBeenCalled()
	})

	it("ignores a joined host that is not active", async () => {
		const { hosts, sockets } = joinedHostsOf()
		const fromHost = vi.fn()
		await hosts.connect("shed")
		await hosts.activate("garage")
		await hosts.listenToActiveHost("companion://created", fromHost)

		sockets[0]?.send({ event: "companion://created", payload: { id: "b9" } })

		expect(fromHost).not.toHaveBeenCalled()
	})

	it("keeps the local subscription to the same event on the local host", async () => {
		const { hosts, local, sockets } = joinedHostsOf()
		const fromLocal = vi.fn()
		await hosts.listen("companion://created", fromLocal)

		await hosts.activate("garage")
		await settle()
		sockets[0]?.send({ event: "companion://created", payload: { id: "b9" } })

		expect(local.listen).toHaveBeenCalledOnce()
		expect(fromLocal).not.toHaveBeenCalled()
	})
})

describe("a joined space event", () => {
	it("stays on the local host while a joined host is active", async () => {
		const { hosts, local } = joinedHostsOf()
		await hosts.activate("garage")

		await hosts.listen(JOINED_SPACE_CHANGED_EVENT, vi.fn())

		expect(local.listen).toHaveBeenCalledWith(
			JOINED_SPACE_CHANGED_EVENT,
			expect.any(Function),
		)
	})
})

const reachFirstRetry = () => vi.advanceTimersByTimeAsync(FIRST_RECONNECT_DELAY)

const answerOffline = () =>
	new Response("the host of this space is offline", { status: 503 })

const failOnNetwork = (): Response => {
	throw new TypeError("Load failed")
}

type NoticeReporters = Pick<
	ReturnType<typeof joinedHostsOf>,
	"reportFailure" | "reportJoinRefusal"
>

const expectNoNotice = ({
	reportFailure,
	reportJoinRefusal,
}: NoticeReporters) => {
	expect(reportFailure).not.toHaveBeenCalled()
	expect(reportJoinRefusal).not.toHaveBeenCalled()
}

describe("a failing selected host", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("marks the space down at once and raises no notice when its socket drops", async () => {
		const joined = joinedHostsOf()
		await joined.hosts.activate("garage")
		joined.sockets[0]?.open()

		joined.sockets[0]?.drop()

		expect(joined.hosts.getState().connections.garage).toEqual({
			status: "down",
		})
		expectNoNotice(joined)
	})

	it("keeps the space down and raises no notice when the first retry fails", async () => {
		const joined = joinedHostsOf()
		await joined.hosts.activate("garage")
		joined.sockets[0]?.open()
		joined.sockets[0]?.drop()

		await reachFirstRetry()
		joined.sockets[1]?.drop()

		expect(joined.hosts.getState().connections.garage).toEqual({
			status: "down",
		})
		expectNoNotice(joined)
	})

	it("marks the space down at once and raises no notice for a 503 on an open socket", async () => {
		const joined = joinedHostsOf({ answer: answerOffline })
		await joined.hosts.activate("garage")
		joined.sockets[0]?.open()

		await Promise.allSettled([joined.hosts.invoke("bot_list")])

		expect(joined.hosts.getState().connections.garage).toEqual({
			status: "down",
		})
		expectNoNotice(joined)
	})

	it("raises no notice when the user switches to a joined space that is down", async () => {
		const joined = joinedHostsOf()
		await joined.hosts.connect("garage")
		joined.sockets[0]?.drop()
		await reachFirstRetry()
		joined.sockets[1]?.drop()

		await joined.hosts.activate("garage")

		expect(joined.hosts.getState().connections.garage).toEqual({
			status: "down",
		})
		expectNoNotice(joined)
	})

	it("marks the space up again when the socket reopens", async () => {
		const { hosts, sockets } = joinedHostsOf()
		await hosts.activate("garage")
		sockets[0]?.open()
		sockets[0]?.drop()
		await reachFirstRetry()
		sockets[1]?.drop()

		await vi.advanceTimersByTimeAsync(FIRST_RECONNECT_DELAY * 2)
		sockets[2]?.open()

		expect(hosts.getState().connections.garage).toEqual({ status: "up" })
	})
})

describe("an offline joined host", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const requestsOf = (hosts: JoinedHosts, count: number) =>
		Promise.allSettled(
			Array.from({ length: count }, () => hosts.invoke("bot_list")),
		)

	it("raises no request refusal for the failing requests", async () => {
		const joined = joinedHostsOf({ answer: answerOffline })
		await joined.hosts.activate("garage")

		await requestsOf(joined.hosts, 3)
		joined.sockets[0]?.drop()

		expectNoNotice(joined)
	})

	it("rejects a request that fails on the network with a hostOffline reason and raises no refusal", async () => {
		const joined = joinedHostsOf({ answer: failOnNetwork })
		await joined.hosts.activate("garage")
		joined.sockets[0]?.open()
		joined.sockets[0]?.drop()

		await expect(joined.hosts.invoke("bot_list")).rejects.toEqual({
			kind: "hostOffline",
			detail: "Load failed",
		})

		expect(joined.hosts.getState().connections.garage).toEqual({
			status: "down",
		})
		expectNoNotice(joined)
	})

	it("keeps refusing a request that fails on the network while the host is up", async () => {
		const { hosts, sockets, reportFailure } = joinedHostsOf({
			answer: failOnNetwork,
		})
		await hosts.activate("garage")
		sockets[0]?.open()

		await requestsOf(hosts, 1)

		expect(reportFailure).toHaveBeenCalledExactlyOnceWith({
			message: "Load failed",
			command: "bot_list",
			side: "member",
		})
	})

	it("keeps refusing a request that fails for another cause", async () => {
		const { hosts, reportFailure } = joinedHostsOf({
			answer: () => new Response("the host broke", { status: 502 }),
		})
		await hosts.activate("garage")

		await requestsOf(hosts, 2)

		expect(reportFailure).toHaveBeenCalledTimes(2)
		expect(reportFailure).toHaveBeenCalledWith({
			message: "the host broke",
			command: "bot_list",
			status: 502,
			side: "member",
		})
	})

	it("marks the space up once a request succeeds while the socket stays open", async () => {
		const answers = [answerOffline, answerOffline, answerJoined]
		const { hosts, sockets } = joinedHostsOf({
			answer: () => (answers.shift() ?? answerJoined)(),
		})
		await hosts.activate("garage")
		sockets[0]?.open()

		await requestsOf(hosts, 2)
		await requestsOf(hosts, 1)

		expect(hosts.getState().connections.garage).toEqual({ status: "up" })
	})
})

describe("a reopened member relay", () => {
	const relayOf =
		(local: ReturnType<typeof joinedHostsOf>["local"]) => (id: string) => {
			for (const [event, handler] of local.listen.mock.calls) {
				if (event === JOINED_SPACE_RECONNECTED_EVENT) {
					const heard = handler as EventCallback<JoinedSpaceReconnected>
					heard({ event, id: 0, payload: { id } })
				}
			}
		}

	const followingGarage = async (seed: Seed = {}) => {
		const joined = joinedHostsOf(seed)
		await joined.hosts.activate("garage")
		joined.sockets[0]?.open()
		const reread = vi.fn()
		const stopFollowing = joined.hosts.onReconnected(reread)
		return { ...joined, reread, stopFollowing, reopen: relayOf(joined.local) }
	}

	const missionFrame = (id: string) => ({
		event: "mission://changed",
		payload: { id },
	})

	const heardMissionIds = (missions: ReturnType<typeof vi.fn>) =>
		missions.mock.calls.map(([{ payload }]) => payload.id)

	const offlineOnce = () => {
		const answers = [answerOffline]
		return () => (answers.shift() ?? answerJoined)()
	}

	it("delivers the frames the relay replays in order and re-reads nothing", async () => {
		const { hosts, sockets, reread } = await followingGarage({
			answer: offlineOnce(),
		})
		const missions = vi.fn()
		await hosts.listen("mission://changed", missions)
		sockets[0]?.send(missionFrame("m1"))
		await expect(hosts.invoke("bot_list")).rejects.toMatchObject({
			kind: "hostOffline",
		})

		sockets[0]?.send(missionFrame("m2"))
		sockets[0]?.send(missionFrame("m3"))
		await hosts.invoke("bot_list")

		expect(heardMissionIds(missions)).toEqual(["m1", "m2", "m3"])
		expect(hosts.getState().connections.garage).toEqual({ status: "up" })
		expect(reread).not.toHaveBeenCalled()
	})

	it("keeps delivering the frames of a joined Space that is not shown", async () => {
		const { hosts, sockets, reread } = await followingGarage()
		await hosts.connect("shed")
		sockets[1]?.open()
		const missions = vi.fn()
		await hosts.listen("mission://changed", missions)

		sockets[1]?.send(missionFrame("m1"))
		sockets[1]?.send(missionFrame("m2"))

		expect(heardMissionIds(missions)).toEqual(["m1", "m2"])
		expect(reread).not.toHaveBeenCalled()
	})

	it("re-reads once when the relay answers that the gap is past what the host kept", async () => {
		const { reread, reopen } = await followingGarage()

		reopen("garage")

		expect(reread).toHaveBeenCalledOnce()
	})

	it("re-reads once, back up, when the relay resyncs while the space is down", async () => {
		const { hosts, reread, reopen } = await followingGarage({
			answer: offlineOnce(),
		})
		await expect(hosts.invoke("bot_list")).rejects.toMatchObject({
			kind: "hostOffline",
		})

		reopen("garage")
		expect(reread).not.toHaveBeenCalled()
		await hosts.invoke("bot_list")

		expect(reread).toHaveBeenCalledOnce()
	})

	it("re-reads nothing when the relay of another Space reopens", async () => {
		const { reread, reopen } = await followingGarage()

		reopen("attic")

		expect(reread).not.toHaveBeenCalled()
	})

	it("re-reads nothing while a local Space is shown", async () => {
		const { hosts, reread, reopen } = await followingGarage()
		await hosts.activate(null)

		reopen("garage")

		expect(reread).not.toHaveBeenCalled()
	})

	it("re-reads once when the front event socket reopens", async () => {
		const { sockets, reread } = await followingGarage()
		sockets[0]?.drop()

		sockets[0]?.open()

		expect(reread).toHaveBeenCalledOnce()
	})

	it("re-reads once when the relay resyncs before the front event socket reopens", async () => {
		const { sockets, reread, reopen } = await followingGarage()
		sockets[0]?.drop()

		reopen("garage")
		sockets[0]?.open()

		expect(reread).toHaveBeenCalledOnce()
	})

	it("re-reads again when the relay resyncs after the front event socket reopened", async () => {
		const { sockets, reread, reopen } = await followingGarage()
		sockets[0]?.drop()
		sockets[0]?.open()

		reopen("garage")

		expect(reread).toHaveBeenCalledTimes(2)
	})

	it("re-reads again on the next resync of the relay", async () => {
		const { reread, reopen } = await followingGarage()
		reopen("garage")

		reopen("garage")

		expect(reread).toHaveBeenCalledTimes(2)
	})

	it("listens to the relay once however many views follow it", async () => {
		const { hosts, local } = await followingGarage()

		hosts.onReconnected(vi.fn())

		const relayListens = local.listen.mock.calls.filter(
			([event]) => event === JOINED_SPACE_RECONNECTED_EVENT,
		)
		expect(relayListens).toHaveLength(1)
	})

	it("listens to no relay before a joined Space is opened", () => {
		const { hosts, local } = joinedHostsOf()

		hosts.onReconnected(vi.fn())

		expect(local.listen).not.toHaveBeenCalled()
	})

	it("stops re-reading a view once it stops following", async () => {
		const { reread, stopFollowing, reopen } = await followingGarage()

		stopFollowing()
		reopen("garage")

		expect(reread).not.toHaveBeenCalled()
	})
})

describe("forgetting a joined host", () => {
	it("closes its socket, drops its state and stops reconnecting", async () => {
		vi.useFakeTimers()
		const { hosts, sockets } = joinedHostsOf()
		await hosts.connect("garage")
		const closing = vi.spyOn(sockets[0]?.socket as HostSocket, "close")

		hosts.forget("garage")
		sockets[0]?.drop()
		await vi.runAllTimersAsync()

		expect(closing).toHaveBeenCalledOnce()
		expect(hosts.getState().connections).toEqual({})
		expect(sockets).toHaveLength(1)
		vi.useRealTimers()
	})

	it("goes back to the local host when the forgotten host was active", async () => {
		const { hosts, local } = joinedHostsOf()
		await hosts.activate("garage")

		hosts.forget("garage")
		await hosts.invoke("bots")

		expect(hosts.getState().active).toBeNull()
		expect(local.invoke).toHaveBeenCalledWith("bots")
	})
})

describe("a conversation the active host does not hold", () => {
	const answerChat = (id: string) =>
		new Response(JSON.stringify({ id }), {
			headers: { "content-type": "application/json" },
		})

	const invokedCommands = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))

	const openLocalChat = (hosts: JoinedHosts) =>
		hosts.invoke("conversation_main_chat", { botId: "b1", spaceId: "home" })

	it.each([
		["application_installs", { conversationId: "solo" }],
		["mission_list", { conversationId: "solo" }],
		["agent_cancel_turn", { scope: { conversationId: "solo", botId: "b1" } }],
		[
			"conversation_append_user_message",
			{ message: { conversationId: "solo" } },
		],
		["conversation_start_turn", { turn: { conversationId: "solo" } }],
		["routine_create", { draft: { conversationId: "solo", botId: "b1" } }],
		[
			"conversation_bots_by_presence",
			{ spaceId: "personal", excludedConversationId: "solo" },
		],
	])(
		"serves %s locally when it names a conversation only the local Mac answered with",
		async (command, args) => {
			const { hosts, local, fetch } = joinedHostsOf()
			local.invoke.mockImplementation(async () => ({ id: "solo" }) as never)
			await openLocalChat(hosts)
			await hosts.activate("garage")

			await hosts.invoke(command, args)

			expect(local.invoke).toHaveBeenLastCalledWith(command, args)
			expect(invokedCommands(fetch)).not.toContain(command)
		},
	)

	const hostUrlOf = (id: string) => `http://${id}.local:45367`

	const joinedAt = async (id: string) => ({
		status: "ok" as const,
		data: {
			id,
			hostUrl: hostUrlOf(id),
			token: "joined",
			remoteSpaceId: null,
			name: id,
		},
	})

	const atticChatKnownWhileOnGarage = async () => {
		const seeded = joinedHostsOf({
			join: joinedAt,
			answer: () => answerChat("attic-chat"),
		})
		await seeded.hosts.activate("attic")
		await seeded.hosts.invoke("conversation_main_chat", {
			botId: "b1",
			spaceId: "a",
		})
		await seeded.hosts.activate("garage")
		seeded.fetch.mockClear()
		return seeded
	}

	it("sends a conversation another joined host answered with to that host while it is open", async () => {
		const { hosts, local, fetch, reportFailure } =
			await atticChatKnownWhileOnGarage()

		await hosts.invoke("application_installs", { conversationId: "attic-chat" })

		expect(fetch).toHaveBeenCalledWith(
			new URL(`${hostUrlOf("attic")}/api/invoke/application_installs`),
			expect.anything(),
		)
		expect(fetch).toHaveBeenCalledOnce()
		expect(localCommands(local)).not.toContain("application_installs")
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it.each(["attic-pinned", "attic-row"])(
		"sends %s, answered in a conversation page of another joined host, to that host while it is open",
		async (conversationId) => {
			const { hosts, fetch } = joinedHostsOf({
				join: joinedAt,
				answer: () =>
					new Response(
						JSON.stringify({
							pinned: [{ id: "attic-pinned" }],
							conversations: [{ id: "attic-row" }],
							nextCursor: null,
						}),
						{ headers: { "content-type": "application/json" } },
					),
			})
			await hosts.activate("attic")
			await hosts.invoke("conversation_page", {
				spaceId: "a",
				cursor: null,
				limit: 30,
			})
			await hosts.activate("garage")
			fetch.mockClear()

			await hosts.invoke("application_installs", { conversationId })

			expect(fetch).toHaveBeenCalledWith(
				new URL(`${hostUrlOf("attic")}/api/invoke/application_installs`),
				expect.anything(),
			)
			expect(fetch).toHaveBeenCalledOnce()
		},
	)

	it("serves a conversation another joined host answered with on the local Mac once that host is closed", async () => {
		const { hosts, local, fetch, reportFailure } =
			await atticChatKnownWhileOnGarage()
		hosts.forget("attic")

		await hosts.invoke("application_installs", { conversationId: "attic-chat" })

		expect(local.invoke).toHaveBeenCalledWith("application_installs", {
			conversationId: "attic-chat",
		})
		expect(fetch).not.toHaveBeenCalled()
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("serves a conversation another joined host answered with on the local Mac while that host is down", async () => {
		const { hosts, local, fetch, sockets } = await atticChatKnownWhileOnGarage()
		sockets[0]?.open()
		sockets[0]?.drop()

		await hosts.invoke("application_installs", { conversationId: "attic-chat" })

		expect(hosts.getState().connections.attic).toEqual({ status: "down" })
		expect(localCommands(local)).toContain("application_installs")
		expect(fetch).not.toHaveBeenCalled()
	})

	it("relays a conversation the active host answered with, even one the local Mac named too", async () => {
		const { hosts, local, fetch } = joinedHostsOf({
			answer: () => answerChat("both"),
		})
		local.invoke.mockImplementation(async () => ({ id: "both" }) as never)
		await openLocalChat(hosts)
		await hosts.activate("garage")
		await hosts.invoke("conversation_main_chat", { botId: "b1", spaceId: "g" })
		local.invoke.mockClear()

		await hosts.invoke("application_installs", { conversationId: "both" })

		expect(invokedCommands(fetch)).toContain("application_installs")
		expect(localCommands(local)).not.toContain("application_installs")
	})

	it("relays a conversation no host has named yet, as before", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		await hosts.invoke("application_installs", { conversationId: "fresh" })

		expect(invokedCommands(fetch)).toContain("application_installs")
		expect(localCommands(local)).not.toContain("application_installs")
	})

	it("learns a conversation named inside any answer, such as a mission thread", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		local.invoke.mockImplementation(
			async () =>
				[{ mission: { id: "m1", conversationId: "thread" } }] as never,
		)
		await hosts.invoke("mission_board")
		await hosts.activate("garage")

		await hosts.invoke("conversation_message_page", {
			conversationId: "thread",
			beforeSeq: null,
			limit: 50,
		})

		expect(invokedCommands(fetch)).not.toContain("conversation_message_page")
	})
})

describe("a cold start on a joined space", () => {
	const relayedBodies = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([, init]) => String((init as RequestInit).body))

	const coldStartOnGarage = async (ids: () => Promise<string[]>) => {
		const seeded = joinedHostsOf()
		seeded.local.invoke.mockImplementation(
			async (command: string) =>
				(command === "conversation_local_ids" ? ids() : "local") as never,
		)
		await seeded.hosts.activate("garage")
		seeded.local.invoke.mockClear()
		return seeded
	}

	it("serves a conversation of this Mac locally before any local answer named it", async () => {
		const { hosts, local, fetch } = await coldStartOnGarage(async () => [
			"solo",
		])

		await hosts.invoke("application_installs", { conversationId: "solo" })

		expect(local.invoke).toHaveBeenCalledWith("conversation_local_ids")
		expect(local.invoke).toHaveBeenLastCalledWith("application_installs", {
			conversationId: "solo",
		})
		expect(relayedBodies(fetch).join()).not.toContain("solo")
	})

	it("asks this Mac for its conversation ids once", async () => {
		const { hosts, local } = await coldStartOnGarage(async () => ["solo"])

		await hosts.invoke("application_installs", { conversationId: "solo" })
		await hosts.invoke("mission_list", { conversationId: "solo" })
		await hosts.invoke("conversation_main_chat", { botId: "b1", spaceId: "g" })

		expect(
			localCommands(local).filter(
				(command) => command === "conversation_local_ids",
			),
		).toHaveLength(1)
	})

	it("relays a conversation this Mac does not hold", async () => {
		const { hosts, local, fetch } = await coldStartOnGarage(async () => [
			"solo",
		])

		await hosts.invoke("application_installs", { conversationId: "fresh" })

		expect(relayedBodies(fetch).join()).toContain("fresh")
		expect(local.invoke).not.toHaveBeenCalledWith("application_installs", {
			conversationId: "fresh",
		})
	})

	it("never asks a joined host for the local conversation ids", async () => {
		const { hosts, local, fetch } = joinedHostsOf()
		await hosts.activate("garage")

		await hosts.invoke("conversation_local_ids")

		expect(local.invoke).toHaveBeenCalledWith("conversation_local_ids")
		expect(fetch).not.toHaveBeenCalled()
	})

	it("serves an unknown conversation locally and says so when this Mac cannot list its ids, then asks again", async () => {
		const { hosts, local, fetch, reportFailure } = await coldStartOnGarage(
			async () => {
				throw new Error("the transcript store refused it")
			},
		)

		await hosts.invoke("application_installs", { conversationId: "fresh" })
		await hosts.invoke("mission_list", { conversationId: "fresh" })

		expect(reportFailure).toHaveBeenCalledWith({
			message: "the transcript store refused it",
			command: "conversation_local_ids",
		})
		expect(fetch).not.toHaveBeenCalled()
		expect(local.invoke).toHaveBeenCalledWith("application_installs", {
			conversationId: "fresh",
		})
		expect(
			localCommands(local).filter(
				(command) => command === "conversation_local_ids",
			),
		).toHaveLength(2)
	})
})

describe("a bot or a Space only this Mac holds", () => {
	const OTHER_SPACE_REFUSAL = "this command reaches outside the shared space"

	const answerJson = (answer: unknown) =>
		new Response(JSON.stringify(answer), {
			headers: { "content-type": "application/json" },
		})

	const relayedCommands = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))

	const localAnswerTo = (command: string) => {
		if (command === "space_list") {
			return [{ id: "mine" }, { id: "personal" }]
		}
		if (command === "conversation_bots") {
			return [{ id: "own-bot" }, { id: "shared-bot" }]
		}
		if (command === "space_create") {
			return { id: "fresh" }
		}
		return "local"
	}

	const onGarageAfterLocalReads = async () => {
		const seeded = joinedHostsOf({
			join: async (id) => ({
				status: "ok" as const,
				data: {
					id,
					hostUrl: HOST,
					token: "joined",
					remoteSpaceId: "personal",
					name: id,
				},
			}),
			answer: () => answerJson([{ id: "shared-bot" }]),
		})
		seeded.local.invoke.mockImplementation(
			async (command: string) => localAnswerTo(command) as never,
		)
		await seeded.hosts.invoke("space_list")
		await seeded.hosts.invoke("conversation_bots", { spaceId: "mine" })
		await seeded.hosts.activate("garage", "personal")
		await seeded.hosts.invoke("conversation_bots", { spaceId: "personal" })
		seeded.fetch.mockClear()
		seeded.local.invoke.mockClear()
		return seeded
	}

	it.each([
		["section_list", { spaceId: "mine" }],
		["space_preferences", { spaceId: "mine" }],
		["conversation_bot_commands", { botId: "own-bot" }],
		["conversation_main_chat", { botId: "own-bot", spaceId: "personal" }],
		["routine_trigger_sources", { botId: "own-bot" }],
		["agent_check", { scope: { botId: "own-bot" } }],
		[
			"conversation_create",
			{ spaceId: "personal", botIds: ["shared-bot", "own-bot"] },
		],
	])(
		"serves %s locally when it names what only this Mac answered with",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(local.invoke).toHaveBeenLastCalledWith(command, args)
			expect(relayedCommands(fetch)).toEqual([])
		},
	)

	it.each([
		["section_list", { spaceId: "personal" }],
		["conversation_bot_commands", { botId: "shared-bot" }],
		["conversation_main_chat", { botId: "shared-bot", spaceId: "personal" }],
	])(
		"relays %s when the active host holds everything it names",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(relayedCommands(fetch)).toEqual([command])
			expect(local.invoke).not.toHaveBeenCalled()
		},
	)

	const botScoped = (botId: string) =>
		[
			["plugin_skills", { scope: { kind: "bot", id: botId } }],
			[
				"plugin_set_skill_preloaded",
				{ scope: { kind: "bot", id: botId }, skillId: "s" },
			],
			[
				"plugin_set_mcp_server",
				{ scope: { kind: "bot", id: botId }, name: "linear" },
			],
		] as const

	it.each(botScoped("own-bot"))(
		"serves %s locally when its bot scope names a companion only this Mac holds",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(local.invoke).toHaveBeenLastCalledWith(command, args)
			expect(relayedCommands(fetch)).toEqual([])
		},
	)

	it.each(botScoped("shared-bot"))(
		"relays %s when its bot scope names a companion the active host holds",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(relayedCommands(fetch)).toEqual([command])
			expect(local.invoke).not.toHaveBeenCalled()
		},
	)

	const spaceScoped = (spaceId: string) => {
		const space = { kind: "space", id: spaceId }
		return [
			["env_list", { scope: space }],
			["env_set", { scope: space, name: "TOKEN", value: "v" }],
			[
				"env_delete",
				{ scope: { kind: "server", name: "linear", owner: space } },
			],
			["plugin_skills", { scope: space }],
			["plugin_mcp_servers", { scope: space }],
			["plugin_set_mcp_server", { scope: space, name: "linear" }],
			["plugin_history", { scope: space }],
			["mcp_application_status", { owner: space }],
			["mcp_oauth_disconnect", { owner: space, name: "linear" }],
			[
				"search_messages",
				{ query: { text: "walls", spaceId, allSpaces: false } },
			],
		] as const
	}

	it.each(spaceScoped("mine"))(
		"serves %s locally when it names a Space only this Mac holds",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(local.invoke).toHaveBeenLastCalledWith(command, args)
			expect(relayedCommands(fetch)).toEqual([])
		},
	)

	it.each(spaceScoped("personal"))(
		"relays %s when it names the shared Space of the active host",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(relayedCommands(fetch)).toEqual([command])
			expect(local.invoke).not.toHaveBeenCalled()
		},
	)

	it("serves locally a space-scoped env_list of a Space created while the host is active", async () => {
		const { hosts, local, fetch } = await onGarageAfterLocalReads()
		const created = await hosts.invoke<{ id: string }>("space_create", {
			name: "New Space",
		})
		const args = { scope: { kind: "space", id: created.id } }

		await hosts.invoke("env_list", args)

		expect(local.invoke).toHaveBeenLastCalledWith("env_list", args)
		expect(relayedCommands(fetch)).toEqual([])
	})

	it("relays a space-scoped env_list of the joined Space once a Space was created", async () => {
		const { hosts, local, fetch } = await onGarageAfterLocalReads()
		await hosts.invoke("space_create", { name: "New Space" })
		local.invoke.mockClear()

		await hosts.invoke("env_list", { scope: { kind: "space", id: "personal" } })

		expect(relayedCommands(fetch)).toEqual(["env_list"])
		expect(local.invoke).not.toHaveBeenCalled()
	})

	const botOwned = (botId: string) => {
		const owner = { kind: "bot", id: botId, spaceId: "personal" }
		return [
			["mcp_application_status", { owner }],
			[
				"env_set",
				{
					scope: { kind: "server", name: "linear", owner },
					name: "TOKEN",
					value: "v",
				},
			],
		] as const
	}

	it("serves mcp_oauth_connect locally when its owner is a companion only this Mac holds", async () => {
		const { hosts, local, fetch } = await onGarageAfterLocalReads()
		const args = {
			owner: { kind: "bot", id: "own-bot", spaceId: "personal" },
			name: "linear",
		}

		await hosts.invoke("mcp_oauth_connect", args)

		expect(local.invoke).toHaveBeenLastCalledWith("mcp_oauth_connect", args)
		expect(relayedCommands(fetch)).toEqual([])
	})

	it.each(botOwned("own-bot"))(
		"serves %s locally when its owner is a companion only this Mac holds",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(local.invoke).toHaveBeenLastCalledWith(command, args)
			expect(relayedCommands(fetch)).toEqual([])
		},
	)

	it.each(botOwned("shared-bot"))(
		"relays %s when its owner is a companion the active host holds",
		async (command, args) => {
			const { hosts, local, fetch } = await onGarageAfterLocalReads()

			await hosts.invoke(command, args)

			expect(relayedCommands(fetch)).toEqual([command])
			expect(local.invoke).not.toHaveBeenCalled()
		},
	)

	it("raises one notice for a relayed call the host refuses", async () => {
		const { hosts, fetch, reportFailure } = await onGarageAfterLocalReads()
		fetch.mockImplementation(
			async () => new Response(OTHER_SPACE_REFUSAL, { status: 403 }),
		)

		await expect(
			hosts.invoke("section_list", { spaceId: "elsewhere" }),
		).rejects.toThrow(OTHER_SPACE_REFUSAL)

		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith({
			message: OTHER_SPACE_REFUSAL,
			command: "section_list",
			status: 403,
			side: "member",
		})
	})
})

describe("personal Settings while a joined Space is active", () => {
	const JOINED_BOT = { kind: "bot", id: "shared-bot", spaceId: "garage" }
	const JOINED_SPACE = { kind: "space", id: "garage" }
	const MEMBER_REFUSAL = "a member cannot change the Space settings"

	const relayedCommands = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))

	const onGarage = async () => {
		const seeded = joinedHostsOf()
		await seeded.hosts.activate("garage")
		seeded.fetch.mockClear()
		return seeded
	}

	it.each([
		["plugin_skills", { scope: { kind: "user" } }],
		["plugin_set_skill_preloaded", { scope: { kind: "user" }, skillId: "s" }],
		["plugin_set_mcp_server", { scope: { kind: "user" }, name: "linear" }],
		["plugin_history", { scope: { kind: "user" } }],
		["env_list", { scope: { kind: "user" } }],
		["env_list", { scope: { kind: "person" } }],
		["env_set", { scope: { kind: "account" }, name: "TOKEN", value: "v" }],
		[
			"env_delete",
			{ scope: { kind: "server", name: "linear", owner: { kind: "user" } } },
		],
		["mcp_application_status", { owner: { kind: "user" } }],
		["mcp_oauth_connect", { owner: { kind: "user" }, name: "linear" }],
		["mcp_oauth_disconnect", { owner: { kind: "user" }, name: "linear" }],
	])("serves %s locally for this Mac", async (command, args) => {
		const { hosts, local, fetch } = await onGarage()

		await hosts.invoke(command, args)

		expect(local.invoke).toHaveBeenLastCalledWith(command, args)
		expect(relayedCommands(fetch)).toEqual([])
	})

	it.each([
		["plugin_skills", { scope: { kind: "bot", id: "shared-bot" } }],
		["plugin_history", { scope: JOINED_SPACE }],
	])("relays %s of the joined Space", async (command, args) => {
		const { hosts, local, fetch } = await onGarage()

		await hosts.invoke(command, args)

		expect(relayedCommands(fetch)).toEqual([command])
		expect(localCommands(local)).not.toContain(command)
	})

	it.each([
		["env_list", { scope: JOINED_BOT }],
		["env_set", { scope: JOINED_SPACE, name: "TOKEN", value: "v" }],
		[
			"env_delete",
			{ scope: { kind: "server", name: "linear", owner: JOINED_SPACE } },
		],
		["mcp_application_status", { owner: JOINED_BOT }],
		["mcp_oauth_disconnect", { owner: JOINED_BOT, name: "linear" }],
	])("relays %s of the joined Space to its host", async (command, args) => {
		const { hosts, local, fetch, reportFailure } = await onGarage()

		await hosts.invoke(command, args)

		expect(relayedCommands(fetch)).toEqual([command])
		expect(localCommands(local)).not.toContain(command)
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it.each([
		["mcp_oauth_connect", { owner: JOINED_SPACE, name: "linear" }],
		["mcp_oauth_connect", { owner: JOINED_BOT, name: "linear" }],
	])(
		"starts %s nowhere and raises the hostOnly notice",
		async (command, args) => {
			const { hosts, local, fetch, reportFailure } = await onGarage()

			await expect(hosts.invoke(command, args)).rejects.toThrow(
				HOST_ONLY_REFUSAL,
			)

			expect(relayedCommands(fetch)).toEqual([])
			expect(localCommands(local)).not.toContain(command)
			expect(reportFailure).toHaveBeenCalledOnce()
			expect(reportFailure).toHaveBeenCalledWith(hostOnlyRefusalOf(command))
		},
	)

	it("cancels a connect on this Mac when this Mac received it", async () => {
		const { hosts, local, fetch } = await onGarage()

		await hosts.invoke("mcp_oauth_connect", { owner: { kind: "user" } })
		await hosts.invoke("mcp_oauth_cancel")

		expect(localCommands(local)).toContain("mcp_oauth_cancel")
		expect(relayedCommands(fetch)).toEqual([])
	})

	it("cancels a connect on this Mac only once its joined host is forgotten", async () => {
		const { hosts, local, fetch, sockets, reportFailure } = await onGarage()
		await hosts.invoke("mcp_oauth_connect", { owner: { kind: "user" } })
		const socketsBeforeForget = sockets.length

		hosts.forget("garage")
		await hosts.invoke("mcp_oauth_cancel")

		expect(
			localCommands(local).filter((command) => command === "mcp_oauth_cancel"),
		).toHaveLength(1)
		expect(relayedCommands(fetch)).toEqual([])
		expect(sockets).toHaveLength(socketsBeforeForget)
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("cancels on this Mac a connect its forgotten host refused", async () => {
		const { hosts, fetch, sockets } = await onGarage()
		await expect(
			hosts.invoke("mcp_oauth_connect", { owner: JOINED_SPACE }),
		).rejects.toThrow(HOST_ONLY_REFUSAL)
		const socketsBeforeForget = sockets.length

		hosts.forget("garage")
		await expect(hosts.invoke("mcp_oauth_cancel")).resolves.toBe("local")

		expect(relayedCommands(fetch)).toEqual([])
		expect(sockets).toHaveLength(socketsBeforeForget)
	})

	it("raises one notice when the joined host refuses a relayed call", async () => {
		const { hosts, fetch, reportFailure } = await onGarage()
		fetch.mockImplementation(
			async () => new Response(MEMBER_REFUSAL, { status: 403 }),
		)

		await expect(
			hosts.invoke("plugin_set_mcp_server", {
				scope: JOINED_SPACE,
				name: "linear",
			}),
		).rejects.toThrow(MEMBER_REFUSAL)

		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith({
			message: MEMBER_REFUSAL,
			command: "plugin_set_mcp_server",
			status: 403,
			side: "member",
		})
	})
})

describe("Space Settings of a joined Space", () => {
	const JOINED_SPACE = { kind: "space", id: "garage" }
	const JOINED_SERVER = { kind: "server", name: "linear", owner: JOINED_SPACE }

	const relayedCommands = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))

	const onGarage = async () => {
		const seeded = joinedHostsOf()
		await seeded.hosts.activate("garage")
		seeded.fetch.mockClear()
		seeded.local.invoke.mockClear()
		return seeded
	}

	it.each([
		["application_catalogue", undefined],
		["plugin_mcp_servers", { scope: JOINED_SPACE }],
		["plugin_skills", { scope: JOINED_SPACE }],
		["plugin_history", { scope: JOINED_SPACE }],
	])("relays %s to the host", async (command, args) => {
		const { hosts, local, fetch } = await onGarage()

		await hosts.invoke(command, args)

		expect(relayedCommands(fetch)).toEqual([command])
		expect(localCommands(local)).toEqual([])
	})

	it.each([
		["env_list", { scope: JOINED_SPACE }],
		["env_list", { scope: JOINED_SERVER }],
		["env_set", { scope: JOINED_SPACE, name: "TOKEN", value: "v" }],
		["env_delete", { scope: JOINED_SPACE, name: "TOKEN" }],
		["mcp_application_status", { owner: JOINED_SPACE }],
		["hosting_members", { spaceId: "garage" }],
		["hosting_invite_member", { spaceId: "garage", email: "a@example.com" }],
		["hosting_withdraw_invitation", { spaceId: "garage", invitationId: "i1" }],
		["hosting_remove_member", { spaceId: "garage", userId: "ana" }],
		["search_messages", { query: { text: "walls", spaceId: "garage" } }],
		["agent_shutdown", { scope: { conversationId: "c1", botId: "b1" } }],
		["agent_live_sessions_in_space", { spaceId: "garage" }],
	])("relays %s to the host", async (command, args) => {
		const { hosts, local, fetch, reportFailure } = await onGarage()

		await hosts.invoke(command, args)

		expect(relayedCommands(fetch)).toEqual([command])
		expect(localCommands(local)).not.toContain(command)
		expect(reportFailure).not.toHaveBeenCalled()
	})

	it.each([
		["env_list", { scope: { kind: "space", id: "personal" } }],
		["mcp_application_status", { owner: { kind: "space", id: "personal" } }],
		["mcp_oauth_connect", { owner: { kind: "space", id: "personal" } }],
		["hosting_members", { spaceId: "personal" }],
		["hosting_remove_member", { spaceId: "personal", userId: "ana" }],
		["agent_shutdown", { scope: { conversationId: "c1", botId: "b1" } }],
	])("serves %s of a local Space on this Mac", async (command, args) => {
		const { hosts, local, fetch } = joinedHostsOf()

		await hosts.invoke(command, args)

		expect(local.invoke).toHaveBeenLastCalledWith(command, args)
		expect(fetch).not.toHaveBeenCalled()
	})
})

describe("the commands reach.rs keeps on the host", () => {
	const HOST_ONLY_ENTRY = /\("([a-z_]+)",\s*Reach::HostOnly\)/g
	const JOINED_SPACE = { kind: "space", id: "garage" }
	const JOINED_BOT = { kind: "bot", id: "shared-bot", spaceId: "garage" }

	const hostOnlyCommands = [...reachSource.matchAll(HOST_ONLY_ENTRY)].map(
		([, command = ""]) => command,
	)

	const ARGUMENTS_OF_THE_JOINED_SPACE = [
		undefined,
		{ scope: JOINED_SPACE, owner: JOINED_SPACE, spaceId: "garage" },
		{ scope: JOINED_BOT, owner: JOINED_BOT, botId: "shared-bot" },
		{
			scope: { kind: "server", name: "linear", owner: JOINED_SPACE },
			name: "linear",
		},
		{ query: { text: "walls", spaceId: "garage" } },
	]

	it("reads the HostOnly entries out of reach.rs", () => {
		expect(hostOnlyCommands).toEqual(
			expect.arrayContaining([
				"mission_board",
				"agent_live_sessions",
				"connection_set",
			]),
		)
	})

	it.each(hostOnlyCommands)(
		"sends %s nowhere near the joined host and raises no notice but the hostOnly one",
		async (command) => {
			const { hosts, fetch, reportFailure } = joinedHostsOf()
			await hosts.activate("garage")
			fetch.mockClear()

			const answers = await Promise.allSettled(
				ARGUMENTS_OF_THE_JOINED_SPACE.map((args) =>
					hosts.invoke(command, args),
				),
			)

			expect(fetch).not.toHaveBeenCalled()
			for (const [refusal] of reportFailure.mock.calls) {
				expect(refusal).toEqual(hostOnlyRefusalOf(command))
			}
			const reasons = answers.flatMap((answer) =>
				answer.status === "rejected" ? [(answer.reason as Error).message] : [],
			)
			expect(reasons.join("\n")).not.toContain("stays on its host")
		},
	)
})
