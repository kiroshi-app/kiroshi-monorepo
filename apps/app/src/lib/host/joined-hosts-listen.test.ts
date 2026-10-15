import type { Event, UnlistenFn } from "@tauri-apps/api/event"
import { expect, it, vi } from "vitest"

import type { HttpHost } from "./http"
import type { LocalHost } from "./joined-hosts-invoke"
import { createJoinedHostsListen } from "./joined-hosts-listen"

const MISSION_CHANGED = "mission://changed"

const localHost = {
	listen: async () => () => undefined,
} as unknown as LocalHost

const hostStillAttaching = () => {
	let attach: (unlisten: UnlistenFn) => void = () => undefined
	let deliver: (event: Event<unknown>) => void = () => undefined
	const host = {
		listen: (_event: string, handler: (event: Event<unknown>) => void) => {
			deliver = handler
			return new Promise<UnlistenFn>((resolve) => {
				attach = resolve
			})
		},
	} as unknown as HttpHost
	return {
		host,
		attach: (unlisten: UnlistenFn) => attach(unlisten),
		emit: () => deliver({ event: MISSION_CHANGED, id: 0, payload: {} }),
	}
}

it("stops the event on a host still attaching once released", async () => {
	const garage = hostStillAttaching()
	const { listen } = createJoinedHostsListen({
		local: localHost,
		hosts: new Map([["garage", garage.host]]),
		activeHostId: () => null,
		reportListenFailure: () => () => undefined,
	})
	const missions = vi.fn()
	const hostUnlisten = vi.fn()

	const unlisten = await listen(MISSION_CHANGED, missions)
	unlisten()
	garage.emit()
	garage.attach(hostUnlisten)
	await vi.waitFor(() => expect(hostUnlisten).toHaveBeenCalledOnce())

	expect(missions).not.toHaveBeenCalled()
})
