import type { InvokeArgs } from "@tauri-apps/api/core"
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type {
	FailureReport,
	NoticeMessage,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { hostOfflineOf } from "./host-offline"
import { HostRefused } from "./host-refused"

import { describeFailure, raiseReportedFailure } from "../failure-report"
import { countInvoke } from "../perf/invoke-tally-devtools"

export type HostSocket = Pick<
	WebSocket,
	"onclose" | "onmessage" | "onopen" | "close"
>

export type HostRefusal = {
	message: string
	command?: string
	status?: number
	side?: FailureReport["side"]
}

type HostConnection = {
	host: string
	token: string
}

export type HttpHostOptions = HostConnection & {
	fetch: typeof fetch
	openSocket: (url: string) => HostSocket
	onDown: () => void
	onUp: () => void
	onReopened: () => void
	onRefused: (refusal: HostRefusal) => void
}

export type HttpHost = {
	invoke: <T>(
		command: string,
		args?: InvokeArgs,
		signal?: AbortSignal,
	) => Promise<T>
	listen: <T>(event: string, handler: EventCallback<T>) => Promise<UnlistenFn>
	fileSrc: (path: string) => string
	openEvents: () => void
	close: () => void
}

type Refusal = {
	reason: unknown
	isCommandError: boolean
}

type Presence = "unknown" | "up" | "down"

type Frame = {
	event: string
	payload: unknown
}

export const FIRST_RECONNECT_DELAY = 500

const LONGEST_RECONNECT_DELAY = 30_000

const BYTES = "application/octet-stream"

const JSON_TYPE = "application/json"

const HOST_OFFLINE_STATUS = 503

const AVATARS_DIR = "avatars"

const ATTACHMENTS_DIR = "attachments"

const reconnectDelay = (attempt: number): number =>
	Math.min(FIRST_RECONNECT_DELAY * 2 ** attempt, LONGEST_RECONNECT_DELAY)

const encodeArgument = (_key: string, value: unknown): unknown =>
	value instanceof Uint8Array ? Array.from(value) : value

const parsedJson = (text: string): unknown =>
	text === "" ? undefined : JSON.parse(text)

const carries = (response: Response, type: string): boolean =>
	response.headers.get("content-type")?.startsWith(type) ?? false

const answerOf = (response: Response): Promise<unknown> =>
	carries(response, BYTES)
		? response.arrayBuffer()
		: response.text().then(parsedJson)

const refusalOf = async (response: Response): Promise<Refusal> => {
	const text = await response.text()
	return carries(response, JSON_TYPE)
		? { reason: parsedJson(text), isCommandError: true }
		: { reason: text, isCommandError: false }
}

export const isTimeout = (reason: unknown): boolean =>
	reason instanceof DOMException && reason.name === "TimeoutError"

const DEDICATED_REFUSAL_NOTICES: Record<number, () => NoticeMessage> = {
	401: () => ({
		title: i18n.t("chat:screen.notice.unauthorized.title"),
		description: i18n.t("chat:screen.notice.unauthorized.description"),
	}),
}

const HOST_ONLY_STATUS = 403

const HOST_ONLY_REFUSAL = "this command belongs to the host"

const isHostOnlyRefusal = (message: string, status?: number) =>
	status === HOST_ONLY_STATUS && message.includes(HOST_ONLY_REFUSAL)

export const hostOnlyRefusalOf = (command: string): HostRefusal => ({
	message: HOST_ONLY_REFUSAL,
	command,
	status: HOST_ONLY_STATUS,
	side: "member",
})

const hostOnlyNotice = (): NoticeMessage => ({
	title: i18n.t("chat:screen.notice.failed"),
	description: i18n.t("chat:screen.notice.hostOnly"),
})

const refusalNoticeOf = ({ message, status }: HostRefusal): NoticeMessage => {
	if (isHostOnlyRefusal(message, status)) {
		return hostOnlyNotice()
	}
	const dedicatedNotice = status ? DEDICATED_REFUSAL_NOTICES[status] : undefined
	return (
		dedicatedNotice?.() ?? {
			title: i18n.t("chat:screen.notice.failed"),
			description: message,
		}
	)
}

export const raiseRefusalNotice = (refusal: HostRefusal) =>
	raiseReportedFailure(refusalNoticeOf(refusal), {
		raisedIn: "host-refusal",
		command: refusal.command,
		httpStatus: refusal.status,
		side: refusal.side,
	})

const isFrame = (value: unknown): value is Frame =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Frame).event === "string"

const frameOf = (data: unknown): Frame | null => {
	try {
		const frame: unknown = JSON.parse(String(data))
		if (isFrame(frame)) {
			return frame
		}
		console.error("the host sent an event frame with no event name", frame)
	} catch (failure) {
		console.error("the host sent an event frame that is not json", failure)
	}
	return null
}

const handOver = (handler: EventCallback<unknown>, frame: Frame) => {
	try {
		handler({ event: frame.event, id: 0, payload: frame.payload })
	} catch (failure) {
		console.error(`a listener of ${frame.event} failed`, failure)
	}
}

const segmentsOf = (path: string): string[] => path.split(/[\\/]/)

const fileRouteOf = (path: string): string[] | null => {
	const segments = segmentsOf(path)
	const [dir, file] = segments.slice(-2)
	if (dir === AVATARS_DIR && file) {
		return [AVATARS_DIR, file]
	}
	const [store, conversationId] = segments.slice(-3)
	if (store === ATTACHMENTS_DIR && conversationId && file) {
		return [ATTACHMENTS_DIR, conversationId, file]
	}
	return null
}

const eventsUrlOf = ({ host, token }: HostConnection): string => {
	const url = new URL("/api/events", host)
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
	url.searchParams.set("token", token)
	return url.href
}

export const createHttpHost = ({
	host,
	token,
	fetch,
	openSocket,
	onDown,
	onUp,
	onReopened,
	onRefused,
}: HttpHostOptions): HttpHost => {
	const listeners = new Map<string, Set<EventCallback<unknown>>>()
	let socket: HostSocket | null = null
	let failedAttempts = 0
	let presence: Presence = "unknown"
	let isClosed = false
	let hasDropped = false

	const refuse = (command: string, reason: unknown, status?: number): never => {
		const message = describeFailure(reason)
		onRefused({ message, command, status, side: "member" })
		throw new HostRefused(message, reason)
	}

	const rejectFailedPost = (
		command: string,
		reason: unknown,
		signal?: AbortSignal,
	): never => {
		if (!signal?.aborted) {
			return rejectNetworkFailure(command, reason)
		}
		if (isTimeout(signal.reason)) {
			return goOffline(signal.reason)
		}
		throw signal.reason
	}

	const post = (command: string, args: InvokeArgs, signal?: AbortSignal) =>
		fetch(new URL(`/api/invoke/${encodeURIComponent(command)}`, host), {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": JSON_TYPE,
			},
			body: JSON.stringify(args, encodeArgument),
			signal,
		}).catch((reason: unknown) => rejectFailedPost(command, reason, signal))

	const invoke = async <T>(
		command: string,
		args: InvokeArgs = {},
		signal?: AbortSignal,
	) => {
		countInvoke(command)
		const response = await post(command, args, signal)
		if (!response.ok) {
			const { reason, isCommandError } = await refusalOf(response)
			if (isCommandError) {
				throw reason
			}
			if (response.status === HOST_OFFLINE_STATUS) {
				return goOffline(reason)
			}
			return refuse(command, reason, response.status)
		}
		markAnswered()
		return (await answerOf(response)) as T
	}

	const deliver = (data: unknown) => {
		const frame = frameOf(data)
		if (!frame) {
			return
		}
		for (const handler of [...(listeners.get(frame.event) ?? [])]) {
			handOver(handler, frame)
		}
	}

	const markUp = () => {
		failedAttempts = 0
		if (presence !== "up") {
			presence = "up"
			onUp()
		}
	}

	const markAnswered = () => {
		if (presence === "down") {
			markUp()
		}
	}

	const markDown = () => {
		if (presence !== "down") {
			presence = "down"
			onDown()
		}
	}

	const goOffline = (reason: unknown): never => {
		markDown()
		throw hostOfflineOf(describeFailure(reason))
	}

	const rejectNetworkFailure = (command: string, reason: unknown): never =>
		presence === "down" ? goOffline(reason) : refuse(command, reason)

	const connect = () => {
		const opened = openSocket(eventsUrlOf({ host, token }))
		opened.onopen = () => {
			if (hasDropped) {
				onReopened()
			}
			markUp()
		}
		opened.onmessage = (message) => deliver(message.data)
		opened.onclose = () => {
			if (isClosed) {
				return
			}
			hasDropped = true
			markDown()
			setTimeout(connect, reconnectDelay(failedAttempts))
			failedAttempts += 1
		}
		socket = opened
	}

	const openEvents = () => {
		if (!socket) {
			connect()
		}
	}

	const listen = <T>(event: string, handler: EventCallback<T>) => {
		openEvents()
		const heard = listeners.get(event) ?? new Set()
		const listener = handler as EventCallback<unknown>
		heard.add(listener)
		listeners.set(event, heard)
		const unlisten = () => {
			heard.delete(listener)
			if (heard.size === 0 && listeners.get(event) === heard) {
				listeners.delete(event)
			}
		}
		return Promise.resolve(unlisten)
	}

	const fileSrc = (path: string): string => {
		const route = fileRouteOf(path)
		if (!route) {
			return path
		}
		const url = new URL(
			`/api/files/${route.map(encodeURIComponent).join("/")}`,
			host,
		)
		url.searchParams.set("token", token)
		return url.href
	}

	const close = () => {
		isClosed = true
		socket?.close()
	}

	return { invoke, listen, fileSrc, openEvents, close }
}
