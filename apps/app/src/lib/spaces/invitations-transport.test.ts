import { type EventCallback, listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { invitationsTransport } from "./invitations-transport"

import { JOIN_LINK_OPENED_EVENT, type JoinLinkOpened } from "../bindings"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({ label: "window-1" }),
}))

const hostListen = vi.mocked(listen)

beforeEach(() => {
	hostListen.mockReset()
	hostListen.mockResolvedValue(() => undefined)
})

describe("invitationsTransport.onJoinLinkOpened", () => {
	it("listens on the window it runs in, not on every window", async () => {
		await invitationsTransport.onJoinLinkOpened(vi.fn())

		expect(hostListen).toHaveBeenCalledWith(
			JOIN_LINK_OPENED_EVENT,
			expect.any(Function),
			{ target: { kind: "WebviewWindow", label: "window-1" } },
		)
	})

	it("tells the listener which invitation the link names", async () => {
		const opened = vi.fn()
		await invitationsTransport.onJoinLinkOpened(opened)

		const received = hostListen.mock.calls.at(
			-1,
		)?.[1] as EventCallback<JoinLinkOpened>
		received({
			event: JOIN_LINK_OPENED_EVENT,
			id: 1,
			payload: { invitationId: "inv-1" },
		} as never)

		expect(opened).toHaveBeenCalledWith("inv-1")
	})
})
