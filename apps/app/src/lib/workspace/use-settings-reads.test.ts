// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	type SpaceSettingsReads,
	useSpaceSettingsReads,
} from "./use-settings-reads"

import { createConnectionsController } from "../applications/connections-controller"
import { createFakeConnectionPort } from "../applications/fake-connection-port"
import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

const JOINED = "garage"

afterEach(async () => {
	cleanup()
	await leaveFakeHost(JOINED)
})

const opener = () => vi.fn(() => Promise.resolve())

const reloadable = () => ({ open: opener(), reload: opener() })

const panelsOf = () => ({
	applications: reloadable(),
	servers: reloadable(),
	connections: reloadable(),
})

type Panels = ReturnType<typeof panelsOf>

const readCounts = (panels: Panels) =>
	Object.values(panels).map(
		(panel) => panel.open.mock.calls.length + panel.reload.mock.calls.length,
	)

const mounted = (panels: Panels, isOpen: boolean) =>
	renderHook(
		({ isOpen: opened }: Pick<SpaceSettingsReads, "isOpen">) =>
			useSpaceSettingsReads({ ...panels, spaceId: "personal", isOpen: opened }),
		{ initialProps: { isOpen } },
	)

describe("useSpaceSettingsReads", () => {
	it("reads every Space panel when the settings dialog opens", () => {
		const panels = panelsOf()

		mounted(panels, true)

		expect(readCounts(panels)).toEqual([1, 1, 1])
		expect(panels.servers.open).toHaveBeenCalledWith({
			kind: "space",
			id: "personal",
		})
	})

	it("reads none of them while the settings dialog is closed", () => {
		const panels = panelsOf()

		mounted(panels, false)

		expect(readCounts(panels)).toEqual([0, 0, 0])
	})

	it("reads them again when the relay of the joined Space reopens", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		mounted(panels, true)

		reopenFakeRelay(JOINED)

		expect(readCounts(panels)).toEqual([2, 2, 2])
	})

	it("reads nothing more when the relay of another Space reopens", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		mounted(panels, true)

		reopenFakeRelay("attic")

		expect(readCounts(panels)).toEqual([1, 1, 1])
	})

	it("reads nothing more once the settings dialog has closed", async () => {
		const panels = panelsOf()
		await joinFakeHost(JOINED)
		const rendered = mounted(panels, true)
		rendered.rerender({ isOpen: false })

		reopenFakeRelay(JOINED)

		expect(readCounts(panels)).toEqual([1, 1, 1])
	})
})

describe("useSpaceSettingsReads on live controllers", () => {
	const SPACE = { kind: "space", id: "personal" } as const
	const ATLAS = { name: "atlas", status: "needsAuthorization" } as const

	const shownWithLiveControllers = async () => {
		const port = createFakeConnectionPort()
		port.rows.space = [ATLAS]
		const connections = createConnectionsController(port)
		const panels = { ...panelsOf(), connections }
		await joinFakeHost(JOINED)
		renderHook(() =>
			useSpaceSettingsReads({ ...panels, spaceId: SPACE.id, isOpen: true }),
		)
		await waitFor(() => expect(connections.getState().rows).toEqual([ATLAS]))
		return { connections }
	}

	it("keeps a connect in flight when the relay of the joined Space reopens", async () => {
		const { connections } = await shownWithLiveControllers()
		void connections.connect("atlas", "https://mcp.atlas.test/mcp")

		reopenFakeRelay(JOINED)

		expect(connections.getState()).toMatchObject({
			rows: [ATLAS],
			connecting: "atlas",
		})
		void connections.cancel()
	})
})
