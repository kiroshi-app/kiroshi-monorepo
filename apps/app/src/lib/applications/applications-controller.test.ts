import { describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { Application, ApplicationSearch } from "./application-port"
import {
	createApplicationsController,
	type InstallTarget,
} from "./applications-controller"
import {
	createFakeApplicationPort,
	type FakeApplicationPort,
} from "./fake-application-port"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvOwner } from "../conversations/store-contract"

const USER: EnvOwner = { kind: "user" }

const COMPANION: EnvOwner = { kind: "bot", id: "default", spaceId: "personal" }

const PAPER: Application = {
	name: "paper",
	title: "Paper",
	description: "Draws interfaces.",
	config: { command: "npx", args: ["-y", "@paper/mcp"] },
	tools: ["draw"],
	install: { kind: "nothing" },
}

const MARKED: Application = {
	...PAPER,
	logo: "<svg />",
	logoUrl: "https://paper.test/logo.png",
}

const SUPERSET: Application = {
	name: "superset",
	title: "Superset",
	description: "Runs workspaces.",
	config: { type: "http", url: "https://api.superset.sh/mcp" },
	tools: ["tasks_list"],
	install: {
		kind: "key",
		fields: [
			{ name: "Authorization", secret: "SUPERSET_API_KEY", concealed: true },
		],
	},
}

const TWO_KEYED: Application = {
	name: "@owner/two-headers",
	title: "Two headers",
	description: "Asks a key and a tenant.",
	config: { type: "http", url: "https://two.test/mcp" },
	tools: ["search"],
	install: {
		kind: "key",
		fields: [
			{ name: "apiKey", secret: "APIKEY", concealed: true },
			{ name: "tenant", secret: "TENANT", concealed: false },
		],
	},
}

const LINEAR: Application = {
	name: "linear",
	title: "Linear",
	description: "Files issues.",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
	tools: ["list_issues"],
	install: { kind: "oauth" },
}

const REFUSED: Application = {
	name: "@owner/queried",
	title: "Queried",
	description: "Asks a key its url would carry.",
	config: { type: "http", url: "https://queried.test/mcp" },
	tools: ["search"],
	install: {
		kind: "refused",
		field: "apiKey",
		reason: 'the required field "apiKey" names no header to carry it',
	},
}

const targetOf = (overrides: Partial<InstallTarget> = {}): InstallTarget => ({
	owner: USER,
	declared: [],
	connect: async () => undefined,
	settle: async () => undefined,
	...overrides,
})

const controllerOn = (
	port = createFakeApplicationPort(),
	store = createFakeTranscriptStore(),
) =>
	createApplicationsController(port, store, {
		reportFailure: () => undefined,
	})

const reportingOn = (port: FakeApplicationPort) => {
	const reportFailure = vi.fn()
	const controller = createApplicationsController(
		port,
		createFakeTranscriptStore(),
		{ reportFailure },
	)
	return { controller, reportFailure }
}

const UNREFRESHED_NOTICE = {
	title: i18n.t("bots:applications.catalogue.unrefreshed.title"),
	description: i18n.t("bots:applications.catalogue.unrefreshed.description"),
}

type PendingSearch = {
	answer: (found: ApplicationSearch) => void
	refuse: (reason: unknown) => void
}

const pendingSearchOn = (port: FakeApplicationPort): PendingSearch => {
	const reading: PendingSearch = { answer: () => {}, refuse: () => {} }
	port.search = () =>
		new Promise((resolve, reject) => {
			reading.answer = resolve
			reading.refuse = reject
		})
	return reading
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const searchesOf = (port: FakeApplicationPort) =>
	port.calls.filter((call) => call.command === "search")

describe("applications controller", () => {
	it("opens on the curated applications the host answers", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER, SUPERSET]
		const controller = controllerOn(port)

		await controller.open()

		expect(controller.getState().curated).toEqual([PAPER, SUPERSET])
	})

	it("reads the catalogue again for every panel that opens it", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)

		await controller.open()
		port.curated = [PAPER, SUPERSET]
		await controller.open()

		expect(port.calls).toEqual([
			{ command: "catalogue" },
			{ command: "catalogue" },
		])
		expect(controller.getState().curated).toEqual([PAPER, SUPERSET])
	})

	it("issues no second catalogue read while one is in flight", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)

		await Promise.all([controller.open(), controller.open()])

		expect(port.calls).toEqual([{ command: "catalogue" }])
	})

	it("keeps the curated rows it holds when a catalogue re-read is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const { controller, reportFailure } = reportingOn(port)
		await controller.open()

		port.refusals.catalogue = { kind: "catalogueUnreadable", detail: "gone" }
		await controller.open()

		expect(controller.getState().curated).toEqual([PAPER])
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("reports it is reading the catalogue until the read lands", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const pending: ((curated: Application[]) => void)[] = []
		port.catalogue = () =>
			new Promise((resolve) => {
				pending.push(resolve)
			})
		const controller = controllerOn(port)

		const reading = controller.open()
		expect(controller.getState().isReadingCatalogue).toBe(true)

		pending[0]?.([PAPER])
		await reading

		expect(controller.getState().isReadingCatalogue).toBe(false)
		expect(controller.getState().curated).toEqual([PAPER])
	})

	it("reports a catalogue it could not read", async () => {
		const port = createFakeApplicationPort()
		port.refusals.catalogue = { kind: "catalogueUnreadable", detail: "gone" }
		const reportFailure = vi.fn()
		const controller = createApplicationsController(
			port,
			createFakeTranscriptStore(),
			{ reportFailure },
		)

		await controller.open()

		expect(controller.getState().hasCatalogueFailed).toBe(true)
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("reads the whole directory once the catalogue page opens", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR, SUPERSET]
		const controller = controllerOn(port)

		controller.browse()
		expect(controller.getState().isReadingDirectory).toBe(true)
		await settled()

		expect(searchesOf(port)).toEqual([{ command: "search", query: "" }])
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("reads the directory again for every page that opens it", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)

		controller.browse()
		await settled()
		port.found = [LINEAR, SUPERSET]
		controller.browse()
		await settled()

		expect(searchesOf(port)).toHaveLength(2)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("issues no second directory read while one is in flight", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)

		controller.browse()
		controller.browse()
		await settled()

		expect(searchesOf(port)).toEqual([{ command: "search", query: "" }])
	})

	it("keeps the held directory listed and raises a notice when a re-read is refused", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = reportingOn(port)
		controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("narrows what it holds on a keystroke without calling the port", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR, SUPERSET]
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		for (const typed of ["l", "li", "lin", "line", "linea", "linear"]) {
			controller.search(typed)
		}
		await settled()

		expect(searchesOf(port)).toEqual([{ command: "search", query: "" }])
		expect(controller.getState().query).toBe("linear")
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("holds the picked category so every page reads one value", () => {
		const controller = controllerOn()

		expect(controller.getState().category).toBe("everything")

		controller.pickCategory("developer-tools")

		expect(controller.getState().category).toBe("developer-tools")
	})

	it("reports a directory it could not read and reads it again on a retry", async () => {
		const port = createFakeApplicationPort()
		port.refusals.search = { kind: "registryTimedOut" }
		const controller = controllerOn(port)

		controller.browse()
		await settled()
		expect(controller.getState().hasDirectoryFailed).toBe(true)
		expect(controller.getState().directory).toEqual([])

		port.refusals = {}
		port.found = [LINEAR]
		controller.retry()
		await settled()

		expect(searchesOf(port)).toEqual([
			{ command: "search", query: "" },
			{ command: "search", query: "" },
		])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("reads the directory again when the page opens after a failed read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		controller.retry()
		await settled()
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR])

		port.refusals = {}
		port.found = [LINEAR, SUPERSET]
		controller.browse()
		await settled()

		expect(searchesOf(port)).toHaveLength(3)
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("keeps the answer of the last read and drops an earlier one", async () => {
		const port = createFakeApplicationPort()
		const answers: ((found: ApplicationSearch) => void)[] = []
		port.search = () =>
			new Promise((resolve) => {
				answers.push(resolve)
			})
		const controller = controllerOn(port)

		controller.browse()
		controller.retry()
		answers[1]?.({ applications: [LINEAR] })
		answers[0]?.({ applications: [SUPERSET] })
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("says the served cache is stale", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = true
		const controller = controllerOn(port)

		controller.browse()
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(true)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("says nothing about staleness for a cache read within the day", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = false
		const controller = controllerOn(port)

		controller.browse()
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(false)
	})

	it("holds on to the results when one directory side failed", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = controllerOn(port)

		controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)
		expect(controller.getState().hasDirectoryFailed).toBe(false)
	})

	it("raises one notice for a directory read with a failed side", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const { controller, reportFailure } = reportingOn(port)

		controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("raises no notice for a directory read where both sides answered", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = reportingOn(port)

		controller.browse()
		await settled()

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("reports no partial failure when both directory sides answered", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = controllerOn(port)

		controller.browse()
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
	})

	it("keeps the partial failure of the held rows behind a refused read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		controller.retry()
		await settled()

		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)
	})

	it("keeps the partial failure of the held rows until the re-read lands", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		controller.browse()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)

		reading.answer({ applications: [LINEAR, SUPERSET] })
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("drops the partial failure of an empty directory as a re-read starts", async () => {
		const port = createFakeApplicationPort()
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = controllerOn(port)
		controller.browse()
		await settled()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)

		const reading = pendingSearchOn(port)
		controller.browse()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)

		reading.answer({ applications: [LINEAR] })
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
	})

	it("keeps the stale mark of the held rows through a refused re-read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = true
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		controller.browse()
		expect(controller.getState().isDirectoryStale).toBe(true)

		reading.refuse({ kind: "registryTimedOut" })
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(true)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("drops the stale mark of an empty directory on a refused re-read", async () => {
		const port = createFakeApplicationPort()
		port.foundIsStale = true
		const controller = controllerOn(port)
		controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		controller.browse()
		expect(controller.getState().isDirectoryStale).toBe(true)

		reading.refuse({ kind: "registryTimedOut" })
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(false)
	})

	it("declares a server for an install that asks nothing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "paper", config: PAPER.config, title: PAPER.title },
		])
	})

	it("declares a server carrying the mark of the application it picked", async () => {
		const port = createFakeApplicationPort()
		port.curated = [MARKED]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{
				name: "paper",
				config: MARKED.config,
				title: MARKED.title,
				logo: MARKED.logo,
				logoUrl: MARKED.logoUrl,
			},
		])
	})

	it("writes the typed key under the secrets of the declared server", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		const secrets = await store.environmentVariables({
			kind: "server",
			name: "superset",
			owner: USER,
		})
		expect(secrets.map((entry) => entry.name)).toEqual(["SUPERSET_API_KEY"])
	})

	it("refuses an install naming a field the page left without a value", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(controller.getState().failure).toContain("tenant")
		expect(declare).not.toHaveBeenCalled()
		expect(write).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("names every field no value arrived under the name of", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "   " })

		expect(controller.getState().failure).toContain("apiKey")
		expect(controller.getState().failure).toContain("tenant")
	})

	it("writes every value under the variable of the field it was typed into", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { tenant: "acme", apiKey: "sk-typed" })

		const scope = { kind: "server", name: "@owner/two-headers", owner: USER }
		expect(write.mock.calls).toEqual([
			[scope, "APIKEY", "sk-typed"],
			[scope, "TENANT", "acme"],
		])
		expect(controller.getState().failure).toBeNull()
	})

	it("runs the connect of the scope for an install that signs in", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("linear")
		const connect = vi.fn(async () => undefined)

		await controller.install(targetOf({ connect }))

		expect(connect).toHaveBeenCalledWith("linear", "https://mcp.linear.app/mcp")
	})

	it("shows the reason of a refused declaration and keeps the page open", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setPluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(controller.getState().failure).toContain("the bundle is read only")
		expect(controller.getState().picked).toEqual(PAPER)
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("shows the reason of a refused install and declares no server", async () => {
		const port = createFakeApplicationPort()
		port.curated = [REFUSED]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("@owner/queried")

		await controller.install(targetOf())

		expect(controller.getState().failure).toContain("apiKey")
		expect(declare).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("shows the reason a config no runner runs was refused and writes nothing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		port.runnerRefusal = {
			field: "uvx",
			reason: "the command uvx is on no directory of your PATH",
		}
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "sk-typed", tenant: "acme" })

		expect(controller.getState().failure).toContain(
			"the command uvx is on no directory of your PATH",
		)
		expect(declare).not.toHaveBeenCalled()
		expect(write).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("reads the config of what it installs against the runners of this machine", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf())

		expect(port.calls).toContainEqual({
			command: "runnable",
			config: PAPER.config,
		})
		expect(controller.getState().failure).toBeNull()
	})

	it("refuses a second add of the application it is installing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		const running = controller.install(targetOf())
		await controller.install(targetOf())
		await running

		expect(declare).toHaveBeenCalledTimes(1)
	})

	it("installs under a scope of its own what another scope already declares", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")
		await controller.install(targetOf())

		await controller.install(
			targetOf({ owner: COMPANION, declared: ["ledger"] }),
		)

		expect(
			await store.pluginMcpServers({ kind: "bot", id: "default" }),
		).toEqual([{ name: "paper", config: PAPER.config, title: PAPER.title }])
	})

	it("refuses an add of an application the owner already declares", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("paper")

		await controller.install(targetOf({ declared: ["paper"] }))

		expect(declare).not.toHaveBeenCalled()
	})

	it("undeclares what the install declared when the key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the keyring is locked")
	})

	it("leaves a declaration it found in place when the key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer({ kind: "user" }, "superset", {
			type: "http",
		})
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "superset", config: SUPERSET.config, title: SUPERSET.title },
		])
		expect(controller.getState().failure).toContain("the keyring is locked")
	})

	it("reports the key refusal even when the undeclaring is refused too", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		vi.spyOn(store, "deletePluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const reportFailure = vi.fn()
		const controller = createApplicationsController(port, store, {
			reportFailure,
		})
		await controller.open()
		controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(controller.getState().failure).toContain("the keyring is locked")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("undeclares what the install declared when the connect is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the sign-in timed out")
	})

	it("deletes the secrets the connect wrote before it was refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const scope = { kind: "server", name: "linear", owner: USER } as const
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					await store.setEnvironmentVariable(scope, "LINEAR_TOKEN", "tok")
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.environmentVariables(scope)).toEqual([])
	})

	it("deletes the keys already written when a later key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const write = store.setEnvironmentVariable
		vi.spyOn(store, "setEnvironmentVariable").mockImplementation(
			(scope, name, value) =>
				name === "TENANT"
					? Promise.reject({ kind: "env", detail: "the keyring is locked" })
					: write(scope, name, value),
		)
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "sk-typed", tenant: "acme" })

		expect(
			await store.environmentVariables({
				kind: "server",
				name: "@owner/two-headers",
				owner: USER,
			}),
		).toEqual([])
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("leaves the declaration and the secrets the owner had before the install", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const scope = { kind: "server", name: "linear", owner: USER } as const
		await store.setPluginMcpServer({ kind: "user" }, "linear", LINEAR.config)
		await store.setEnvironmentVariable(scope, "LINEAR_TOKEN", "kept")
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "linear", config: LINEAR.config, title: LINEAR.title },
		])
		expect(
			(await store.environmentVariables(scope)).map((entry) => entry.name),
		).toEqual(["LINEAR_TOKEN"])
	})

	it("reports the connect refusal even when the undeclaring is refused too", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "deletePluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const reportFailure = vi.fn()
		const controller = createApplicationsController(port, store, {
			reportFailure,
		})
		await controller.open()
		controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(controller.getState().failure).toContain("the sign-in timed out")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("undeclares the application even when clearing its secrets is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "deleteEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const reportFailure = vi.fn()
		const controller = createApplicationsController(port, store, {
			reportFailure,
		})
		await controller.open()
		controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async (name) => {
					await store.setEnvironmentVariable(
						{ kind: "server", name, owner: USER },
						"LINEAR_TOKEN",
						"tok",
					)
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the sign-in timed out")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("declares the application again when a later install connects", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const controller = controllerOn(port, store)
		await controller.open()
		controller.pick("linear")
		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "linear", config: LINEAR.config, title: LINEAR.title },
		])
		expect(controller.getState().failure).toBeNull()
	})

	it("settles the scope once the install lands", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)
		await controller.open()
		controller.pick("paper")
		const settle = vi.fn(async () => undefined)

		await controller.install(targetOf({ settle }))

		expect(settle).toHaveBeenCalledTimes(1)
	})

	it("leaves the install page without forgetting the search", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		port.found = [LINEAR]
		const controller = controllerOn(port)
		await controller.open()
		controller.browse()
		await settled()
		controller.search("linear")
		controller.pick("paper")

		controller.leave()

		expect(controller.getState().picked).toBeNull()
		expect(controller.getState().query).toBe("linear")
		expect(controller.getState().directory).toEqual([LINEAR])
	})
})

describe("application marks", () => {
	const namedCallsOf = (port: FakeApplicationPort) =>
		port.calls.filter((call) => call.command === "named")

	it("asks the host for a declared name the catalogue does not bear", async () => {
		const port = createFakeApplicationPort()
		port.found = [MARKED]
		const controller = controllerOn(port)

		controller.resolveMarks(["paper"])
		await settled()

		expect(controller.getState().marks).toEqual({
			paper: { title: "Paper", mark: MARKED.logo },
		})
	})

	it("leaves a row on its raw name while the lookup is in flight", () => {
		const controller = controllerOn()

		controller.resolveMarks(["paper"])

		expect(controller.getState().marks.paper).toBeUndefined()
	})

	it("asks the host once per name whatever the panels declaring it", async () => {
		const port = createFakeApplicationPort()
		port.found = [MARKED]
		const controller = controllerOn(port)

		controller.resolveMarks(["paper", "paper"])
		controller.resolveMarks(["paper"])
		await settled()
		controller.resolveMarks(["paper"])

		expect(namedCallsOf(port)).toEqual([{ command: "named", name: "paper" }])
	})

	it("asks nothing for a name the curated catalogue already bears", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = controllerOn(port)
		await controller.open()

		controller.resolveMarks(["paper"])
		await settled()

		expect(namedCallsOf(port)).toEqual([])
	})

	it("records a name the host answers nothing for as unresolved", async () => {
		const port = createFakeApplicationPort()
		const controller = controllerOn(port)

		controller.resolveMarks(["ghost"])
		await settled()
		controller.resolveMarks(["ghost"])

		expect(controller.getState().marks).toEqual({ ghost: null })
		expect(namedCallsOf(port)).toHaveLength(1)
	})

	it("records a name the host refuses as unresolved and raises no notice", async () => {
		const port = createFakeApplicationPort()
		port.refusals.named = { kind: "registryTimedOut" }
		const reportFailure = vi.fn()
		const controller = createApplicationsController(
			port,
			createFakeTranscriptStore(),
			{ reportFailure },
		)

		controller.resolveMarks(["paper"])
		await settled()

		expect(controller.getState().marks).toEqual({ paper: null })
		expect(reportFailure).not.toHaveBeenCalled()
	})
})
