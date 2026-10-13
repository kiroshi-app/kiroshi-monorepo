import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"
import type { InstallableApplication } from "@workspace/ui/components/plugin-settings/application-install-page"
import type {
	ApplicationSetup,
	CatalogueApplication,
	CatalogueCategory,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import type { ApplicationsCatalogueSection } from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { i18n } from "@workspace/ui/lib/i18n"

import { categoriesOf } from "./application-categories"
import type { Application, Install } from "./application-port"
import {
	type ApplicationMark,
	type ApplicationMarks,
	type ApplicationsController,
	type ApplicationsState,
	applicationMarkOf,
	catalogueStatusOf,
	type InstallTarget,
	serverScopeOf,
} from "./applications-controller"
import type { ApplicationRow } from "./connection-port"
import {
	type ConnectionSettings,
	toConnectionSettings,
} from "./connection-settings"
import { type SessionReopener, scopeOfOwner } from "./session-reopening"
import type { Applications } from "./use-applications"
import type { Connections } from "./use-connections"

import type { McpServers } from "../bots/use-mcp-servers"
import type { EnvOwner, EnvScope } from "../conversations/store-contract"
import { toEnvironmentRows } from "../environment/environment-rows"
import type { Environment } from "../environment/use-environment"
import { folded } from "../search/search-fold"

const SETUP_OF_INSTALL = {
	nothing: "none",
	key: "apiKey",
	oauth: "signIn",
	refused: "unavailable",
} as const satisfies Record<Install["kind"], ApplicationSetup>

const setupOf = (application: Application) =>
	SETUP_OF_INSTALL[application.install.kind]

const askedFieldsOf = ({ install }: Application) =>
	install.kind === "key"
		? install.fields.map(({ name, description, concealed }) => ({
				name,
				description,
				concealed,
			}))
		: []

const refusalOf = ({ install }: Application) =>
	install.kind === "refused"
		? { field: install.field, reason: install.reason }
		: undefined

const isMarked = ({ displayName, mark }: BotMcpServerItem) =>
	displayName !== undefined || mark !== undefined

const knownMarkOf = (
	curated: Application[],
	marks: ApplicationMarks,
	name: string,
): ApplicationMark | null => {
	const known = curated.find((held) => held.name === name)
	return known ? applicationMarkOf(known) : (marks[name] ?? null)
}

export const withApplicationMarks = (
	servers: BotMcpServerItem[],
	curated: Application[],
	marks: ApplicationMarks,
): BotMcpServerItem[] =>
	servers.map((server) => {
		if (isMarked(server)) {
			return server
		}
		const known = knownMarkOf(curated, marks, server.name)
		if (!known) {
			return server
		}
		return { ...server, displayName: known.title, mark: known.mark }
	})

const toCatalogueApplication = (
	application: Application,
): CatalogueApplication => ({
	id: application.name,
	name: application.title,
	description: application.description,
	setup: setupOf(application),
	mark: application.logo ?? application.logoUrl,
	useCount: application.useCount,
	isVerified: application.verified,
	host: application.hostedBy,
})

const packageIdentityOf = (application: Application) => {
	const { command, url } = readMcpServerLaunch(application.config)
	return command ?? url ?? undefined
}

const toRegistryApplication = (
	application: Application,
): CatalogueApplication => ({
	...toCatalogueApplication(application),
	packageIdentity: packageIdentityOf(application),
})

export const toInstallableApplication = (
	application: Application,
): InstallableApplication => ({
	...toCatalogueApplication(application),
	description: application.description || undefined,
	packageIdentity: application.name,
	tools: application.tools,
	fields: askedFieldsOf(application),
	refusal: refusalOf(application),
})

const connectRefusalOf = (rows: ApplicationRow[], name: string) => {
	const row = rows.find((held) => held.name === name)
	if (!row) {
		return new Error(i18n.t("bots:applications.connection.state.failed"))
	}
	if (row.status !== "needsAuthorization" && row.status !== "failed") {
		return null
	}
	return new Error(
		row.reason ?? i18n.t(`bots:applications.connection.state.${row.status}`),
	)
}

const connectFor =
	({ controller }: Connections) =>
	async (name: string, url: string) => {
		await controller.connect(name, url)
		const { failure, rows } = controller.getState()
		if (failure?.command === "connect" && failure.name === name) {
			throw failure.reason
		}
		const refused = connectRefusalOf(rows, name)
		if (refused) {
			throw refused
		}
	}

const isTitleMatch = ({ title }: Application, needle: string) =>
	folded(title).includes(needle)

const isDescriptionMatch = ({ description }: Application, needle: string) =>
	folded(description).includes(needle)

const matching = (applications: Application[], needle: string) => {
	if (needle === "") {
		return applications
	}
	return [
		...applications.filter((held) => isTitleMatch(held, needle)),
		...applications.filter(
			(held) => !isTitleMatch(held, needle) && isDescriptionMatch(held, needle),
		),
	]
}

type CatalogueNarrowing = {
	needle: string
	category: CatalogueCategory
	declared: string[]
}

const isUnderCategory = (
	application: Application,
	{ category, declared }: CatalogueNarrowing,
) => {
	if (category === "everything") {
		return true
	}
	if (category === "on-this-machine") {
		return declared.includes(application.name)
	}
	return categoriesOf(application).includes(category)
}

const narrowed = (applications: Application[], narrowing: CatalogueNarrowing) =>
	matching(
		applications.filter((held) => isUnderCategory(held, narrowing)),
		narrowing.needle,
	)

type ApplicationsCatalogueSource = {
	state: ApplicationsState
	controller: ApplicationsController
	target: InstallTarget
}

const toApplicationsCatalogue = ({
	state,
	controller,
	target,
}: ApplicationsCatalogueSource): ApplicationsCatalogueSection => {
	const narrowing: CatalogueNarrowing = {
		needle: folded(state.query.trim()),
		category: state.category,
		declared: target.declared,
	}
	const curatedNames = new Set(state.curated.map(({ name }) => name))
	const beyondCurated = state.directory.filter(
		({ name }) => !curatedNames.has(name),
	)
	const { picked } = state

	return {
		query: state.query,
		onQueryChange: controller.search,
		category: state.category,
		onCategoryChange: controller.pickCategory,
		applications: [
			...narrowed(state.curated, narrowing).map(toCatalogueApplication),
			...narrowed(beyondCurated, narrowing).map(toRegistryApplication),
		],
		...catalogueStatusOf(state),
		hasPartlyFailed: state.hasDirectoryPartlyFailed,
		isStale: state.isDirectoryStale,
		onRetry: controller.retry,
		onOpen: controller.browse,
		onPick: (application) => controller.pick(application.id),
		install: picked
			? {
					application: toInstallableApplication(picked),
					isInstalling: state.installing === picked.name,
					isInstalled: target.declared.includes(picked.name),
					failure: state.failure ?? undefined,
					onInstall: (values) => {
						void controller.install(target, values)
					},
					onLeave: controller.leave,
				}
			: undefined,
	}
}

export const applicationTitleOf = (curated: Application[], name: string) =>
	curated.find((held) => held.name === name)?.title ?? name

export const openedServerScope = (
	name: string | null,
	owner: EnvOwner | null,
): EnvScope | null => (name && owner ? serverScopeOf(owner, name) : null)

type ServerEnvironmentSource = {
	environment: Environment
	opened: EnvScope | null
	curated: Application[]
	reopen: SessionReopener
}

export const toServerEnvironmentSection = ({
	environment,
	opened,
	curated,
	reopen,
}: ServerEnvironmentSource): EnvironmentSection => {
	const reopenScope = () => {
		if (opened?.kind !== "server") {
			return
		}
		void reopen({
			scope: scopeOfOwner(opened.owner),
			application: applicationTitleOf(curated, opened.name),
		})
	}

	return {
		entries: toEnvironmentRows(environment.entries),
		hasFailedToRead: environment.hasFailedToRead,
		onSet: ({ name, value }) => environment.set(name, value).then(reopenScope),
		onDelete: environment.remove,
	}
}

type ApplicationScopeSource = {
	applications: Applications
	servers: McpServers
	connections: Connections
	openedName: string | null
	reopen: SessionReopener
}

type ApplicationScope = ConnectionSettings & {
	mcpCatalogue?: ApplicationsCatalogueSection
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
}

export const toApplicationScope = ({
	applications,
	servers,
	connections,
	openedName,
	reopen,
}: ApplicationScopeSource): ApplicationScope => {
	const { curated, marks } = applications.state
	const owner = servers.state.owner

	const reopenFor = (name: string) => {
		if (!owner) {
			return
		}
		void reopen({
			scope: scopeOfOwner(owner),
			application: applicationTitleOf(curated, name),
		})
	}

	const onceWritten = (name: string) => (landed: boolean) => {
		if (landed) {
			reopenFor(name)
		}
	}

	const connectionSettings = toConnectionSettings({
		servers: servers.state.servers,
		connections,
		openedName,
		onSettled: reopenFor,
	})

	const installTarget = (owned: EnvOwner): InstallTarget => ({
		owner: owned,
		declared: servers.state.servers.map((server) => server.name),
		connect: connectFor(connections),
		settle: async () => {
			await servers.controller.reload()
			reopenFor(applications.state.picked?.name ?? "")
		},
	})

	return {
		...connectionSettings,
		mcpServers: withApplicationMarks(
			connectionSettings.mcpServers,
			curated,
			marks,
		),
		mcpCatalogue: owner
			? toApplicationsCatalogue({
					state: applications.state,
					controller: applications.controller,
					target: installTarget(owner),
				})
			: undefined,
		onMcpServerCreate: (name, config) => {
			void servers.controller.create(name, config).then(onceWritten(name))
		},
		onMcpServerChange: (opened, name, config) => {
			void servers.controller
				.rename(opened, name, config)
				.then(onceWritten(name))
		},
		onMcpServerDelete: (name) => {
			void servers.controller.remove(name).then(onceWritten(name))
		},
	}
}
