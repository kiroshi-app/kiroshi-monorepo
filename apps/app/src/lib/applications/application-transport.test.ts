import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	Application,
	ApplicationInstall,
	ApplicationsError,
} from "./application-port"
import {
	applicationTransport,
	DIRECTORY_REFRESHED_EVENT,
	INSTALLED_EVENT,
} from "./application-transport"
import { createFakeApplicationPort } from "./fake-application-port"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const hostListen = vi.mocked(listen)

const SUPERSET: Application = {
	name: "superset",
	title: "Superset",
	description: "Run workspaces, terminals, agents and tasks.",
	config: { type: "http", url: "https://api.superset.sh/mcp" },
	tools: ["tasks_list"],
	logo: "<svg/>",
	install: {
		kind: "key",
		fields: [
			{ name: "Authorization", secret: "SUPERSET_API_KEY", concealed: true },
		],
	},
}

const NOTION: Application = {
	name: "com.notion/mcp",
	title: "Notion",
	description: "Notion workspace.",
	config: { type: "http", url: "https://mcp.notion.com/mcp" },
	install: { kind: "oauth" },
}

const RECORDED: ApplicationInstall = {
	id: "i1",
	conversationId: "c1",
	application: "superset",
	title: "Superset",
	logo: "<svg/>",
	scope: "space",
	destinationId: "personal",
	install: { kind: "key", secrets: ["SUPERSET_API_KEY"] },
	lastMessageSeq: 12,
	createdAt: 1700000000000,
}

const REFUSED: ApplicationsError = { kind: "registryRefused", status: 503 }

beforeEach(() => {
	hostInvoke.mockReset()
	hostListen.mockReset()
})

describe("applicationTransport", () => {
	it("reads the curated catalogue", async () => {
		hostInvoke.mockResolvedValue([SUPERSET])

		const curated = await applicationTransport.catalogue()

		expect(hostInvoke).toHaveBeenCalledWith("application_catalogue")
		expect(curated).toEqual([SUPERSET])
	})

	it("hands the host the query to search the registry", async () => {
		hostInvoke.mockResolvedValue({ applications: [NOTION] })

		const found = await applicationTransport.search("notion")

		expect(hostInvoke).toHaveBeenCalledWith("application_search", {
			query: "notion",
		})
		expect(found).toEqual({ applications: [NOTION] })
	})

	it("hands back what the host refused", async () => {
		hostInvoke.mockRejectedValue(REFUSED)

		await expect(applicationTransport.search("notion")).rejects.toEqual(REFUSED)
	})

	it("asks the host whether a config runs on this machine", async () => {
		hostInvoke.mockResolvedValue(null)
		const config = { command: "uvx", args: ["godot-gut-mcp"] }

		const refusal = await applicationTransport.runnable(config)

		expect(hostInvoke).toHaveBeenCalledWith("application_runnable", { config })
		expect(refusal).toBeNull()
	})

	it("hands back the refusal of a config no runner of this machine runs", async () => {
		const refused = { field: "uvx", reason: "the command uvx is on no path" }
		hostInvoke.mockResolvedValue(refused)

		await expect(
			applicationTransport.runnable({ command: "uvx" }),
		).resolves.toEqual(refused)
	})

	it("reads the installs recorded in one conversation", async () => {
		hostInvoke.mockResolvedValue([RECORDED])

		const recorded = await applicationTransport.installs("c1")

		expect(hostInvoke).toHaveBeenCalledWith("application_installs", {
			conversationId: "c1",
		})
		expect(recorded).toEqual([RECORDED])
	})

	it("hands on the payload of an install the host announced", async () => {
		const unsubscribe = vi.fn()
		hostListen.mockResolvedValue(unsubscribe)
		const onInstalled = vi.fn()

		const stop = await applicationTransport.onInstalled(onInstalled)
		const [event, handler] = hostListen.mock.calls[0] ?? []
		handler?.({
			event: INSTALLED_EVENT,
			id: 1,
			payload: { application: "linear", scope: "user" },
		})

		expect(event).toBe("application://installed")
		expect(onInstalled).toHaveBeenCalledWith({
			application: "linear",
			scope: "user",
		})
		stop()
		expect(unsubscribe).toHaveBeenCalledOnce()
	})

	it("hands on every directory refresh the host announced", async () => {
		const unsubscribe = vi.fn()
		hostListen.mockResolvedValue(unsubscribe)
		const onRefreshed = vi.fn()

		const stop = await applicationTransport.onDirectoryRefreshed(onRefreshed)
		const [event, handler] = hostListen.mock.calls[0] ?? []
		handler?.({ event: DIRECTORY_REFRESHED_EVENT, id: 1, payload: null })

		expect(event).toBe("application://directory-refreshed")
		expect(onRefreshed).toHaveBeenCalledOnce()
		stop()
		expect(unsubscribe).toHaveBeenCalledOnce()
	})
})

describe("createFakeApplicationPort", () => {
	it("answers what it holds and records every call", async () => {
		const fake = createFakeApplicationPort()
		fake.curated = [SUPERSET]
		fake.found = [NOTION]
		fake.recorded = [RECORDED]

		expect(await fake.catalogue()).toEqual([SUPERSET])
		expect(await fake.search("notion")).toEqual({ applications: [NOTION] })
		expect(await fake.installs("c1")).toEqual([RECORDED])
		expect(await fake.installs("c2")).toEqual([])
		expect(fake.calls).toEqual([
			{ command: "catalogue" },
			{ command: "search", query: "notion" },
			{ command: "installs", conversationId: "c1" },
			{ command: "installs", conversationId: "c2" },
		])
	})

	it("throws the refusal it was given", async () => {
		const fake = createFakeApplicationPort()
		fake.refusals.search = REFUSED

		await expect(fake.search("notion")).rejects.toEqual(REFUSED)
	})
})
