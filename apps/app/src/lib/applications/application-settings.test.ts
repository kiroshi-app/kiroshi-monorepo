import { describe, expect, it, type Mock, vi } from "vitest"

import type { Application } from "./application-port"
import {
	applicationTitleOf,
	openedServerScope,
	toApplicationScope,
	toInstallableApplication,
	withApplicationMarks,
} from "./application-settings"
import {
	type ApplicationsController,
	type ApplicationsState,
	type InstallTarget,
	initialApplicationsState,
} from "./applications-controller"
import type { ApplicationRow } from "./connection-port"
import type { ConnectionFailure } from "./connections-controller"
import type { Connections } from "./use-connections"

import type { McpServers } from "../bots/use-mcp-servers"
import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"

const USER: EnvOwner = { kind: "user" }

const LINEAR: Application = {
	name: "linear",
	title: "Linear",
	description: "Files issues.",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
	tools: ["list_issues", "create_issue"],
	logo: "<svg viewBox='0 0 1 1'/>",
	install: { kind: "oauth" },
}

const REGISTERED: Application = {
	name: "io.github.kwn/tasklog",
	title: "io.github.kwn/tasklog",
	description: "Tracks tasks.",
	config: { command: "npx", args: ["-y", "@kwn/tasklog"] },
	install: { kind: "nothing" },
}

const HOSTED: Application = {
	name: "smithery/slack",
	title: "Slack",
	description: "Posts messages as you.",
	config: { type: "http", url: "https://slack.run.tools/mcp" },
	tools: ["post_message"],
	logoUrl: "https://icons.run.tools/slack.png",
	useCount: 12110,
	verified: true,
	hostedBy: "slack.run.tools",
	install: { kind: "oauth" },
}

const NOTION: Application = {
	name: "notion",
	title: "Notion",
	description: "Writes pages.",
	config: { type: "http", url: "https://mcp.notion.test/mcp" },
	categories: ["Productivity", "Developer tools"],
	install: { kind: "nothing" },
}

const SENTRY: Application = {
	name: "sentry",
	title: "Sentry",
	description: "Watches over productivity.",
	config: { type: "http", url: "https://mcp.sentry.test/mcp" },
	categories: ["Developer tools"],
	install: { kind: "nothing" },
}

const GRAFANA: Application = {
	name: "grafana",
	title: "Grafana",
	description: "Charts what Sentry reports.",
	config: { type: "http", url: "https://mcp.grafana.test/mcp" },
	categories: ["Data & analytics"],
	install: { kind: "nothing" },
}

const LINEAR_SERVER: BotMcpServer = {
	name: "linear",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
}

const ATLAS_SERVER: BotMcpServer = {
	name: "atlas",
	config: { type: "http", url: "https://mcp.atlas.test/mcp" },
}

const applicationsWith = (state: Partial<ApplicationsState>) => ({
	state: { ...initialApplicationsState, ...state },
	controller: {
		search: vi.fn(),
		pickCategory: vi.fn(),
		retry: vi.fn(),
		pick: vi.fn(),
		leave: vi.fn(),
		install: vi.fn(async () => undefined),
	} as unknown as ApplicationsController,
})

const serversWith = (
	owner: EnvOwner | null,
	servers: BotMcpServer[] = [],
): McpServers => ({
	owner,
	servers,
	hasFailedToLoad: false,
	isPending: false,
	create: vi.fn(async () => true),
	rename: vi.fn(async () => true),
	remove: vi.fn(async () => true),
	reread: vi.fn(async () => undefined),
})

const NO_CONNECTIONS = {
	state: { owner: null, rows: [], connecting: null, failure: null },
	controller: {
		connect: vi.fn(async () => undefined),
		disconnect: vi.fn(async () => undefined),
		cancel: vi.fn(async () => undefined),
		getState: () => ({
			owner: null,
			rows: [],
			connecting: null,
			failure: null,
		}),
	} as unknown as Connections["controller"],
} as Connections

const scopeOf = (
	applications = applicationsWith({ curated: [LINEAR] }),
	servers = serversWith(USER),
	reopen = vi.fn(async () => undefined),
) => ({
	scope: toApplicationScope({
		applications,
		servers,
		connections: NO_CONNECTIONS,
		openedName: null,
		reopen,
	}),
	applications,
	servers,
	reopen,
})

const connectionsLanding = (connected: string[]): Connections => {
	const state = {
		owner: USER,
		rows: connected.map((name) => ({ name, status: "connected" as const })),
		connecting: null,
		failure: null,
	}
	return {
		state,
		controller: {
			connect: vi.fn(async () => undefined),
			disconnect: vi.fn(async () => undefined),
			cancel: vi.fn(async () => undefined),
			getState: () => state,
		},
	} as unknown as Connections
}

type SettlingScopeSource = {
	owner?: EnvOwner | null
	connected: string[]
	openedName?: string | null
}

const settlingScopeOf = ({
	owner = USER,
	connected,
	openedName = null,
}: SettlingScopeSource) => {
	const reopen = vi.fn(async () => undefined)
	return {
		scope: toApplicationScope({
			applications: applicationsWith({ curated: [LINEAR] }),
			servers: serversWith(owner, [LINEAR_SERVER, ATLAS_SERVER]),
			connections: connectionsLanding(connected),
			openedName,
			reopen,
		}),
		reopen,
	}
}

const settled = async () => {
	await Promise.resolve()
	await Promise.resolve()
}

describe("withApplicationMarks", () => {
	it("names a declared server after the curated application it carries", () => {
		const marked = withApplicationMarks(
			[
				{ name: "linear", config: {} },
				{ name: "atlas", config: {} },
			],
			[LINEAR],
			{},
		)

		expect(marked).toEqual([
			{
				name: "linear",
				config: {},
				displayName: "Linear",
				mark: LINEAR.logo,
			},
			{ name: "atlas", config: {} },
		])
	})

	it("leaves a server that already carries the mark it kept", () => {
		const kept = {
			name: "linear",
			config: {},
			displayName: "Linear at work",
			mark: "<svg id='kept'/>",
		}

		expect(withApplicationMarks([kept], [LINEAR], {})).toEqual([kept])
	})

	it("names a declared server after the mark the host answered", () => {
		const marked = withApplicationMarks([{ name: "atlas", config: {} }], [], {
			atlas: { title: "Atlas", mark: "https://atlas.test/logo.png" },
		})

		expect(marked).toEqual([
			{
				name: "atlas",
				config: {},
				displayName: "Atlas",
				mark: "https://atlas.test/logo.png",
			},
		])
	})

	it("leaves a name the host resolved to nothing on its raw name", () => {
		const raw = [{ name: "atlas", config: {} }]

		expect(withApplicationMarks(raw, [], { atlas: null })).toEqual(raw)
		expect(withApplicationMarks(raw, [], {})).toEqual(raw)
	})
})

describe("toInstallableApplication", () => {
	it("hands the install page the identity, the setup and the tools of the descriptor", () => {
		expect(toInstallableApplication(LINEAR)).toMatchObject({
			id: "linear",
			name: "Linear",
			packageIdentity: "linear",
			setup: "signIn",
			tools: ["list_issues", "create_issue"],
		})
	})

	it("hands the install page the icon, the pill, the uses and the host", () => {
		expect(toInstallableApplication(HOSTED)).toMatchObject({
			mark: HOSTED.logoUrl,
			isVerified: true,
			useCount: 12110,
			host: "slack.run.tools",
		})
	})

	it("hands the install page nothing the search did not carry", () => {
		const installable = toInstallableApplication(REGISTERED)

		expect(installable.mark).toBeUndefined()
		expect(installable.isVerified).toBeUndefined()
		expect(installable.useCount).toBeUndefined()
		expect(installable.host).toBeUndefined()
	})

	it("hands the install page no tool list when the descriptor carries none", () => {
		expect(toInstallableApplication(REGISTERED).tools).toBeUndefined()
		expect(
			toInstallableApplication({ ...REGISTERED, tools: [] }).tools,
		).toEqual([])
	})

	it("reads the setup out of what the install asks", () => {
		expect(toInstallableApplication(REGISTERED).setup).toBe("none")
		expect(
			toInstallableApplication({
				...REGISTERED,
				install: {
					kind: "key",
					fields: [{ name: "Authorization", secret: "KEY", concealed: true }],
				},
			}).setup,
		).toBe("apiKey")
	})

	it("hands the install page every asked field in the order it arrives", () => {
		const installable = toInstallableApplication({
			...REGISTERED,
			install: {
				kind: "key",
				fields: [
					{
						name: "GODOT_PATH",
						secret: "GODOT_PATH",
						description: "The Godot executable.",
						concealed: false,
					},
					{ name: "TOKEN", secret: "TOKEN", concealed: true },
				],
			},
		})

		expect(installable.fields).toEqual([
			{
				name: "GODOT_PATH",
				description: "The Godot executable.",
				concealed: false,
			},
			{ name: "TOKEN", description: undefined, concealed: true },
		])
	})

	it("hands the install page no field when the install asks for none", () => {
		expect(toInstallableApplication(REGISTERED).fields).toEqual([])
	})

	it("hands the install page the field and the reason of a refusal", () => {
		const installable = toInstallableApplication({
			...REGISTERED,
			install: {
				kind: "refused",
				field: "apiKey",
				reason: "it names no header to carry it",
			},
		})

		expect(installable.setup).toBe("unavailable")
		expect(installable.refusal).toEqual({
			field: "apiKey",
			reason: "it names no header to carry it",
		})
	})

	it("hands the install page no refusal when the install asks for a key", () => {
		expect(toInstallableApplication(REGISTERED).refusal).toBeUndefined()
	})
})

describe("applicationTitleOf", () => {
	it("falls back to the declared name outside the catalogue", () => {
		expect(applicationTitleOf([LINEAR], "linear")).toBe("Linear")
		expect(applicationTitleOf([LINEAR], "atlas")).toBe("atlas")
	})
})

describe("openedServerScope", () => {
	it("answers nothing without a name or an owner", () => {
		expect(openedServerScope(null, USER)).toBeNull()
		expect(openedServerScope("linear", null)).toBeNull()
		expect(openedServerScope("linear", USER)).toEqual({
			kind: "server",
			name: "linear",
			owner: USER,
		})
	})
})

describe("toApplicationScope", () => {
	it("lists the applications of the catalogue", () => {
		const { scope } = scopeOf()

		expect(scope.mcpCatalogue?.applications).toEqual([
			{
				id: "linear",
				name: "Linear",
				description: "Files issues.",
				setup: "signIn",
				mark: LINEAR.logo,
			},
		])
	})

	it("names a registry result by the configuration that starts it", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR], directory: [REGISTERED] }),
		)

		expect(scope.mcpCatalogue?.applications).toEqual([
			{
				id: "linear",
				name: "Linear",
				description: "Files issues.",
				setup: "signIn",
				mark: LINEAR.logo,
			},
			{
				id: "io.github.kwn/tasklog",
				name: "io.github.kwn/tasklog",
				description: "Tracks tasks.",
				setup: "none",
				mark: undefined,
				packageIdentity: "npx -y @kwn/tasklog",
			},
		])
	})

	it("carries the icon, the pill, the uses and the host of a registry result", () => {
		const { scope } = scopeOf(applicationsWith({ directory: [HOSTED] }))

		expect(scope.mcpCatalogue?.applications).toEqual([
			{
				id: "smithery/slack",
				name: "Slack",
				description: "Posts messages as you.",
				setup: "signIn",
				mark: HOSTED.logoUrl,
				useCount: 12110,
				isVerified: true,
				host: "slack.run.tools",
				packageIdentity: "https://slack.run.tools/mcp",
			},
		])
	})

	it("tells the catalogue the read could not be done", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [HOSTED], hasDirectoryFailed: true }),
		)

		expect(scope.mcpCatalogue?.hasFailed).toBe(true)
	})

	it("tells the catalogue it is still reading", () => {
		const { scope } = scopeOf(applicationsWith({ isReadingCatalogue: true }))

		expect(scope.mcpCatalogue?.isLoading).toBe(true)
	})

	it("keeps listing the held rows while it reads them again", () => {
		const { scope } = scopeOf(
			applicationsWith({
				curated: [LINEAR],
				directory: [HOSTED],
				isReadingCatalogue: true,
				isReadingDirectory: true,
			}),
		)

		expect(scope.mcpCatalogue?.isLoading).toBe(false)
		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			LINEAR.name,
			HOSTED.name,
		])
	})

	it("keeps only what the typed query matches among the curated ones", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR, REGISTERED], query: "tasklog" }),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"io.github.kwn/tasklog",
		])
	})

	it("narrows the held directory on a typed query, folded", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [NOTION, SENTRY], query: "  NOTÎ  " }),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"notion",
		])
	})

	it("places a title match before a description match", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [GRAFANA, SENTRY], query: "sentry" }),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"sentry",
			"grafana",
		])
	})

	it("keeps the loading flag false while a query narrows what is held", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [NOTION], query: "notion" }),
		)

		expect(scope.mcpCatalogue?.isLoading).toBe(false)
	})

	it("shows only the applications carrying the picked category", () => {
		const { scope } = scopeOf(
			applicationsWith({
				directory: [NOTION, SENTRY, REGISTERED],
				category: "productivity",
			}),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"notion",
		])
	})

	it("keeps an application of several buckets reachable from each", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [NOTION], category: "developer-tools" }),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"notion",
		])
	})

	it("places an application carrying no bucket under other", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [REGISTERED, NOTION], category: "other" }),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"io.github.kwn/tasklog",
		])
	})

	it("shows only what the owner declares under on this machine", () => {
		const { scope } = scopeOf(
			applicationsWith({
				curated: [LINEAR],
				directory: [NOTION],
				category: "on-this-machine",
			}),
			serversWith(USER, [LINEAR_SERVER]),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.id)).toEqual([
			"linear",
		])
	})

	it("renders one card per name, the curated one winning", () => {
		const { scope } = scopeOf(
			applicationsWith({
				curated: [LINEAR],
				directory: [{ ...LINEAR, title: "Linear from the directory" }],
			}),
		)

		expect(scope.mcpCatalogue?.applications.map((held) => held.name)).toEqual([
			"Linear",
		])
	})

	it("hands the catalogue the category the app holds", () => {
		const { scope } = scopeOf(applicationsWith({ category: "travel" }))

		expect(scope.mcpCatalogue?.category).toBe("travel")
	})

	it("tells the catalogue the served cache is stale", () => {
		const { scope } = scopeOf(
			applicationsWith({ directory: [NOTION], isDirectoryStale: true }),
		)

		expect(scope.mcpCatalogue?.isStale).toBe(true)
	})

	it("hands no catalogue while the panel has no owner open", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR] }),
			serversWith(null),
		)

		expect(scope.mcpCatalogue).toBeUndefined()
	})

	it("reads the installed state off what the owner already declares", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR], picked: LINEAR }),
			serversWith(USER, [{ name: "linear", config: {} }]),
		)

		expect(scope.mcpCatalogue?.install?.isInstalled).toBe(true)
	})

	it("offers an application no declaration of this owner names", () => {
		const { scope } = scopeOf(
			applicationsWith({ curated: [LINEAR], picked: LINEAR }),
			serversWith(USER, [{ name: "atlas", config: {} }]),
		)

		expect(scope.mcpCatalogue?.install?.isInstalled).toBe(false)
	})

	it("pushes the install page of the picked application", () => {
		const { scope } = scopeOf(
			applicationsWith({
				curated: [LINEAR],
				picked: LINEAR,
				installing: "linear",
			}),
		)

		expect(scope.mcpCatalogue?.install).toMatchObject({
			isInstalling: true,
			isInstalled: false,
		})
		expect(scope.mcpCatalogue?.install?.application.name).toBe("Linear")
	})

	it("reopens the sessions of the scope once a server is declared", async () => {
		const { scope, reopen } = scopeOf()

		scope.onMcpServerCreate("linear", {})
		await Promise.resolve()
		await Promise.resolve()

		expect(reopen).toHaveBeenCalledWith({
			scope: { kind: "user" },
			application: "Linear",
		})
	})

	it("leaves the sessions alone when the declaration was refused", async () => {
		const servers = serversWith(USER)
		servers.create = vi.fn(async () => false)
		const { scope, reopen } = scopeOf(
			applicationsWith({ curated: [LINEAR] }),
			servers,
		)

		scope.onMcpServerCreate("linear", {})
		await Promise.resolve()
		await Promise.resolve()

		expect(reopen).not.toHaveBeenCalled()
	})

	it("reopens the sessions of the panel owner once a panel row connects", async () => {
		const { scope, reopen } = settlingScopeOf({ connected: ["linear"] })

		scope.onServerConnect({ name: "linear", config: {} })
		await settled()

		expect(reopen).toHaveBeenCalledWith({
			scope: { kind: "user" },
			application: "Linear",
		})
	})

	it("reopens the sessions of the panel owner once the opened page connects", async () => {
		const { scope, reopen } = settlingScopeOf({
			connected: ["linear"],
			openedName: "linear",
		})

		scope.serverConnection?.onConnect?.()
		await settled()

		expect(reopen).toHaveBeenCalledWith({
			scope: { kind: "user" },
			application: "Linear",
		})
	})

	it("names the settled application, not the opened one", async () => {
		const { scope, reopen } = settlingScopeOf({
			connected: ["atlas"],
			openedName: "linear",
		})

		scope.onServerConnect({ name: "atlas", config: {} })
		await settled()

		expect(reopen).toHaveBeenCalledWith({
			scope: { kind: "user" },
			application: "atlas",
		})
	})

	it("leaves the sessions alone when the connect never lands", async () => {
		const { scope, reopen } = settlingScopeOf({ connected: [] })

		scope.onServerConnect({ name: "linear", config: {} })
		await settled()

		expect(reopen).not.toHaveBeenCalled()
	})

	it("leaves the sessions alone while the panel holds no owner", async () => {
		const { scope, reopen } = settlingScopeOf({
			owner: null,
			connected: ["linear"],
		})

		scope.onServerConnect({ name: "linear", config: {} })
		await settled()

		expect(reopen).not.toHaveBeenCalled()
	})
})

const connectionsReading = (
	rows: ApplicationRow[],
	failure: ConnectionFailure | null = null,
): Connections => {
	const state = { owner: USER, rows, connecting: null, failure }
	return {
		state,
		controller: {
			connect: vi.fn(async () => undefined),
			disconnect: vi.fn(async () => undefined),
			cancel: vi.fn(async () => undefined),
			getState: () => state,
		},
	} as unknown as Connections
}

const installTargetOf = (connections: Connections) => {
	const applications = applicationsWith({ curated: [LINEAR], picked: LINEAR })
	const scope = toApplicationScope({
		applications,
		servers: serversWith(USER),
		connections,
		openedName: null,
		reopen: vi.fn(async () => undefined),
	})
	scope.mcpCatalogue?.install?.onInstall({})
	const install = applications.controller.install as Mock
	return install.mock.calls[0]?.[0] as InstallTarget
}

const connectingLinear = (connections: Connections) =>
	installTargetOf(connections).connect("linear", "https://mcp.linear.app/mcp")

describe("the connect an install runs", () => {
	it("refuses a connect the read back row says needs authorization", async () => {
		const connections = connectionsReading([
			{ name: "linear", status: "needsAuthorization", reason: "you said no" },
		])

		await expect(connectingLinear(connections)).rejects.toThrow("you said no")
	})

	it("refuses a connect the read back row says failed", async () => {
		const connections = connectionsReading([
			{ name: "linear", status: "failed", reason: "the token was refused" },
		])

		await expect(connectingLinear(connections)).rejects.toThrow(
			"the token was refused",
		)
	})

	it("names the status read back when the refusal carries no reason", async () => {
		const connections = connectionsReading([
			{ name: "linear", status: "needsAuthorization" },
		])

		await expect(connectingLinear(connections)).rejects.toThrow(
			"Needs authorization",
		)
	})

	it("reports the failure of the connect over the status read back", async () => {
		const connections = connectionsReading(
			[{ name: "linear", status: "failed", reason: "the token was refused" }],
			{
				command: "connect",
				name: "linear",
				reason: "the browser wouldn’t open",
			},
		)

		await expect(connectingLinear(connections)).rejects.toThrow(
			"the browser wouldn’t open",
		)
	})

	it("lands a connect the read back row says connected", async () => {
		const connections = connectionsReading([
			{ name: "linear", status: "connected" },
		])

		await expect(connectingLinear(connections)).resolves.toBeUndefined()
	})

	it("lands a connect the read back row says is still connecting", async () => {
		const connections = connectionsReading([
			{ name: "linear", status: "connecting" },
		])

		await expect(connectingLinear(connections)).resolves.toBeUndefined()
	})

	it("refuses a connect whose application carries no row", async () => {
		await expect(connectingLinear(connectionsReading([]))).rejects.toThrow(
			"Couldn’t connect",
		)
	})
})
