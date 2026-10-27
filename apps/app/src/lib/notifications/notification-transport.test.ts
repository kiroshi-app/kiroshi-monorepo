import { invoke } from "@tauri-apps/api/core"
import { type EventCallback, listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NotificationTarget } from "./notification-port"
import { notificationTransport } from "./notification-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

const BOT: NotificationTarget = { kind: "bot", id: "bot-one" }

const CONVERSATION: NotificationTarget = {
	kind: "conversation",
	id: "room-one",
}

const sendOne = () =>
	notificationTransport.send({ target: BOT, title: "a", body: "b" })

const clickWith = (target: NotificationTarget) =>
	({ event: "notification://activated", id: 1, payload: target }) as never

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
	hostListen.mockReset()
	hostListen.mockResolvedValue(() => undefined)
})

describe("notificationTransport", () => {
	it("hands the host the target the notification stands for", async () => {
		await notificationTransport.send({
			target: BOT,
			title: "Nyx",
			body: "answered",
		})

		expect(hostInvoke).toHaveBeenCalledWith("notification_show", {
			target: BOT,
			title: "Nyx",
			body: "answered",
		})
	})

	it("hands the host a conversation under its own kind", async () => {
		await notificationTransport.send({
			target: CONVERSATION,
			title: "Release",
			body: "answered",
		})

		expect(hostInvoke).toHaveBeenCalledWith("notification_show", {
			target: CONVERSATION,
			title: "Release",
			body: "answered",
		})
	})

	it("hands the refusal of the host back to its caller", async () => {
		const refusal = new Error("no notification centre")
		hostInvoke.mockRejectedValue(refusal)

		await expect(sendOne()).rejects.toBe(refusal)
	})

	it("resolves when the host takes the notification", async () => {
		await expect(sendOne()).resolves.toBeUndefined()
	})

	it("tells the listener which target was clicked", async () => {
		await notificationTransport.onActivate(vi.fn())
		const clicked = vi.fn()
		await notificationTransport.onActivate(clicked)

		const received = hostListen.mock.calls.at(
			-1,
		)?.[1] as EventCallback<NotificationTarget>
		received(clickWith(CONVERSATION))

		expect(clicked).toHaveBeenCalledWith(CONVERSATION)
	})

	it("answers with the unsubscribe the host handed back", async () => {
		const unlisten = vi.fn()
		hostListen.mockResolvedValue(unlisten)

		const stop = await notificationTransport.onActivate(vi.fn())
		stop()

		expect(unlisten).toHaveBeenCalled()
	})
})
