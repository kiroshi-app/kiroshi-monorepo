// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { createElement, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpaceSettingsDialog } from "@workspace/ui/components/space-settings-dialog"
import "@workspace/ui/lib/i18n"

import { APPLICATIONS_TAB, toConnectionSettings } from "./connection-settings"
import {
	createFakeConnectionPort,
	type FakeConnectionPort,
} from "./fake-connection-port"
import { useConnections } from "./use-connections"

import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const SPACE: EnvOwner = { kind: "space", id: "s-1" }

const ATLAS_URL = "https://mcp.atlas.test/mcp"

const LINEAR_LOGO = "https://linear.test/logo.png"

const SERVERS: BotMcpServer[] = [
	{ name: "atlas", config: { type: "http", url: ATLAS_URL } },
	{ name: "ledger", config: { command: "ledger-mcp" } },
	{
		name: "linear",
		config: { type: "http", url: "https://mcp.linear.app/mcp" },
		title: "Linear",
		logoUrl: LINEAR_LOGO,
	},
]

type SpaceConnectionsProps = {
	port: FakeConnectionPort
	onSettled?: () => void
}

const SpaceConnections = ({ port, onSettled }: SpaceConnectionsProps) => {
	const connections = useConnections(port, SPACE)
	const [openedName, setOpenedName] = useState<string | null>(null)

	return createElement(SpaceSettingsDialog, {
		...toConnectionSettings({
			servers: SERVERS,
			connections,
			openedName,
			onSettled,
		}),
		environment: [],
		history: { days: [], oldestDate: "", onUndo: vi.fn() },
		onClose: vi.fn(),
		onDelete: vi.fn(),
		onEnvironmentDelete: vi.fn(),
		onEnvironmentSet: vi.fn(),
		onMcpServerChange: vi.fn(),
		onMcpServerCreate: vi.fn(),
		onMcpServerDelete: vi.fn(),
		onMcpServerOpen: setOpenedName,
		onSkillChange: vi.fn(),
		onSkillCreate: vi.fn(),
		onSkillDelete: vi.fn(),
		onSkillPreloadedChange: vi.fn(),
		onValueChange: vi.fn(),
		open: true,
		skills: [],
		tab: APPLICATIONS_TAB,
		value: { name: "Release desk", colour: 257 },
	})
}

const settle = () =>
	act(async () => {
		for (let round = 0; round < 5; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

const mounted = async (port: FakeConnectionPort, onSettled?: () => void) => {
	render(createElement(SpaceConnections, { port, onSettled }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await settle()
	return screen.getByRole("tabpanel", { name: "Applications" })
}

const press = async (name: string, container: HTMLElement = document.body) => {
	fireEvent.click(within(container).getByRole("button", { name }))
	await settle()
}

const rowOf = (name: string) => {
	const row = screen.getByText(name).closest("li")
	if (!row) {
		throw new Error(`no row for ${name}`)
	}
	return row
}

const lastCall = (port: FakeConnectionPort) => port.calls.at(-1)

const REFUSAL_SENTENCES = [
	["transport", /couldn’t reach the agent/i],
	["alreadyRunning", /sign-in is already running/i],
] as const

const connectionPort = (status: "needsAuthorization" | "connected") => {
	const port = createFakeConnectionPort()
	port.rows.space = [
		{ name: "atlas", status },
		{ name: "ledger", status: "unknown" },
	]
	return port
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("space connections", () => {
	it("opens on its Applications tab and reads the status of the space", async () => {
		const port = connectionPort("needsAuthorization")

		await mounted(port)

		expect(port.calls).toEqual([{ command: "status", owner: SPACE }])
		expect(within(rowOf("atlas")).getByText("Needs authorization")).toBeTruthy()
	})

	it("shows a declared server under the title and the logo it kept", async () => {
		await mounted(connectionPort("needsAuthorization"))

		const linear = rowOf("Linear")

		expect(linear.querySelector("img")?.getAttribute("src")).toBe(LINEAR_LOGO)
	})

	it("leaves a connection it cannot read with no state and no action", async () => {
		await mounted(connectionPort("needsAuthorization"))

		const ledger = rowOf("ledger")

		expect(within(ledger).queryByText("Needs authorization")).toBeNull()
		expect(within(ledger).queryByText("Connected")).toBeNull()
		expect(within(ledger).getAllByRole("button")).toHaveLength(1)
	})

	it("connects from a row, shows it connecting, then reads the grant that landed", async () => {
		const port = connectionPort("needsAuthorization")
		await mounted(port)

		await press("Connect atlas")

		expect(lastCall(port)).toEqual({
			command: "connect",
			owner: SPACE,
			name: "atlas",
			url: ATLAS_URL,
		})
		expect(within(rowOf("atlas")).getByText("Connecting…")).toBeTruthy()

		port.rows.space = [{ name: "atlas", status: "connected" }]
		port.grant()
		await settle()

		expect(lastCall(port)).toEqual({ command: "status", owner: SPACE })
		expect(within(rowOf("atlas")).getByText("Connected")).toBeTruthy()
	})

	it("cancels a running flow from the editor and reads the status again", async () => {
		const port = connectionPort("needsAuthorization")
		await mounted(port)
		await press("Connect atlas")

		await press("Open atlas")

		expect(screen.getByText(/A tab is open at mcp\.atlas\.test/)).toBeTruthy()

		await press("Cancel")

		expect(port.calls.map((call) => call.command)).toEqual([
			"status",
			"connect",
			"cancel",
			"status",
			"status",
		])
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
		expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy()
	})

	it("disconnects once the person confirms, then reads the status again", async () => {
		const port = connectionPort("connected")
		await mounted(port)
		await press("Open atlas")

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(port.calls.slice(-2)).toEqual([
			{ command: "disconnect", owner: SPACE, name: "atlas", url: ATLAS_URL },
			{ command: "status", owner: SPACE },
		])
	})

	it("says a connect landed once the grant is read", async () => {
		const port = connectionPort("needsAuthorization")
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")
		expect(onSettled).not.toHaveBeenCalled()

		port.rows.space = [{ name: "atlas", status: "connected" }]
		port.grant()
		await settle()

		expect(onSettled).toHaveBeenCalledWith("atlas")
	})

	it("says nothing landed when the connect was refused", async () => {
		const port = connectionPort("needsAuthorization")
		port.refusals.connect = { kind: "denied", detail: "access_denied" }
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")

		expect(onSettled).not.toHaveBeenCalled()
	})

	it("says nothing landed when the connect ended unauthorized", async () => {
		const port = connectionPort("needsAuthorization")
		const onSettled = vi.fn()
		await mounted(port, onSettled)

		await press("Connect atlas")
		port.grant()
		await settle()

		expect(within(rowOf("atlas")).getByText("Needs authorization")).toBeTruthy()
		expect(onSettled).not.toHaveBeenCalled()
	})

	it("says a disconnect landed once it is confirmed", async () => {
		const port = connectionPort("connected")
		const onSettled = vi.fn()
		await mounted(port, onSettled)
		await press("Open atlas")
		port.rows.space = [{ name: "atlas", status: "needsAuthorization" }]

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(onSettled).toHaveBeenCalledWith("atlas")
	})

	it("says nothing landed when the server is still connected", async () => {
		const port = connectionPort("connected")
		const onSettled = vi.fn()
		await mounted(port, onSettled)
		await press("Open atlas")

		await press("Disconnect")
		await press("Disconnect", screen.getByRole("alertdialog"))

		expect(onSettled).not.toHaveBeenCalled()
	})

	it("shows a refused connect as a connection that could not connect", async () => {
		const port = connectionPort("needsAuthorization")
		port.refusals.connect = { kind: "denied", detail: "access_denied" }
		await mounted(port)

		await press("Connect atlas")

		const atlas = rowOf("atlas")
		expect(within(atlas).getByText("Couldn’t connect")).toBeTruthy()
		expect(
			within(atlas).getByRole("button", { name: "Retry atlas" }),
		).toBeTruthy()
	})

	it.each(REFUSAL_SENTENCES)(
		"says on the row why a connect refused for %s failed",
		async (kind, sentence) => {
			const port = connectionPort("needsAuthorization")
			port.refusals.connect = { kind }
			await mounted(port)

			await press("Connect atlas")

			expect(within(rowOf("atlas")).getByText(sentence)).toBeTruthy()
		},
	)

	it.each(REFUSAL_SENTENCES)(
		"says in the editor why a connect refused for %s failed",
		async (kind, sentence) => {
			const port = connectionPort("needsAuthorization")
			port.refusals.connect = { kind }
			await mounted(port)
			await press("Open atlas")

			await press("Connect")

			expect(screen.getByText(sentence)).toBeTruthy()
		},
	)

	it("says why a connect the agent refused with no known kind failed", async () => {
		const port = connectionPort("needsAuthorization")
		port.refusals.connect = { kind: "denied", detail: "access_denied" }
		await mounted(port)

		await press("Connect atlas")

		expect(within(rowOf("atlas")).getByText(/access_denied/)).toBeTruthy()
	})

	it("carries no reason on a connection its status row reads as failed", async () => {
		const port = createFakeConnectionPort()
		port.rows.space = [{ name: "atlas", status: "failed", reason: "boom" }]
		await mounted(port)

		const atlas = rowOf("atlas")
		expect(within(atlas).getByText("Couldn’t connect")).toBeTruthy()
		expect(within(atlas).queryByText(/boom/)).toBeNull()
		expect(within(atlas).queryByText(/sign-in/i)).toBeNull()
	})
})
