import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import {
	type CatalogueCategory,
	EVERYTHING_CATEGORY,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Application,
	ApplicationPort,
	ApplicationSearch,
	InstallField,
} from "./application-port"

import { createStore } from "../store"
import {
	declaredServers,
	declareServer,
	undeclareServer,
} from "../bots/mcp-server-writes"
import type { EnvOwner, EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type ApplicationMark = {
	title: string
	mark?: string
}

export type ApplicationMarks = Record<string, ApplicationMark | null>

export const applicationMarkOf = ({
	title,
	logo,
	logoUrl,
}: Application): ApplicationMark => ({
	title,
	mark: logo ?? logoUrl,
})

export type ApplicationsState = {
	curated: Application[]
	marks: ApplicationMarks
	isReadingCatalogue: boolean
	hasCatalogueFailed: boolean
	query: string
	category: CatalogueCategory
	directory: Application[]
	isReadingDirectory: boolean
	hasDirectoryFailed: boolean
	hasDirectoryPartlyFailed: boolean
	isDirectoryStale: boolean
	picked: Application | null
	installing: string | null
	failure: string | null
}

export type InstallTarget = {
	owner: EnvOwner
	declared: string[]
	connect: (name: string, url: string) => Promise<void>
	settle: () => Promise<void>
}

export type ApplicationsController = {
	getState: () => ApplicationsState
	subscribe: (listener: () => void) => () => void
	open: () => Promise<void>
	browse: () => void
	stopWatchingDirectory: () => void
	search: (query: string) => void
	pickCategory: (category: CatalogueCategory) => void
	retry: () => void
	pick: (id: string) => void
	leave: () => void
	resolveMarks: (names: string[]) => void
	install: (target: InstallTarget, values?: InstallValues) => Promise<void>
}

export const initialApplicationsState: ApplicationsState = {
	curated: [],
	marks: {},
	isReadingCatalogue: false,
	hasCatalogueFailed: false,
	query: "",
	category: EVERYTHING_CATEGORY,
	directory: [],
	isReadingDirectory: false,
	hasDirectoryFailed: false,
	hasDirectoryPartlyFailed: false,
	isDirectoryStale: false,
	picked: null,
	installing: null,
	failure: null,
}

const isRecord = (reason: unknown): reason is Record<string, unknown> =>
	typeof reason === "object" && reason !== null

const refusalTextOf = (reason: unknown): string => {
	if (reason instanceof Error) {
		return reason.message
	}
	if (typeof reason === "string") {
		return reason
	}
	if (isRecord(reason) && typeof reason.kind === "string") {
		return typeof reason.detail === "string"
			? `${reason.kind}: ${reason.detail}`
			: reason.kind
	}
	return String(reason)
}

export const serverScopeOf = (owner: EnvOwner, name: string): EnvScope => ({
	kind: "server",
	name,
	owner,
})

type InstallValues = Record<string, string>

type TypedValue = { field: InstallField; value: string }

const typedValuesOf = (
	install: Application["install"],
	values: InstallValues,
): TypedValue[] =>
	install.kind === "key"
		? install.fields.map((field) => ({
				field,
				value: values[field.name] ?? "",
			}))
		: []

const urlOf = (application: Application) =>
	readMcpServerLaunch(application.config).url ?? ""

export const DIRECTORY_READ_BOUND_MS = 15_000

type CatalogueStatus = {
	isLoading: boolean
	hasFailed: boolean
}

const holdsNoRows = ({ curated, directory }: ApplicationsState) =>
	curated.length === 0 && directory.length === 0

const isReadingWithNoRowsHeld = (state: ApplicationsState) =>
	(state.isReadingCatalogue && state.curated.length === 0) ||
	(state.isReadingDirectory && state.directory.length === 0)

export const catalogueStatusOf = (
	state: ApplicationsState,
): CatalogueStatus => {
	const hasFailed =
		state.hasDirectoryFailed || (state.hasCatalogueFailed && holdsNoRows(state))
	return { isLoading: !hasFailed && isReadingWithNoRowsHeld(state), hasFailed }
}

export type ApplicationsControllerOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export const createApplicationsController = (
	port: ApplicationPort,
	store: TranscriptStore,
	{ reportFailure = raiseFailureNotice }: ApplicationsControllerOptions = {},
): ApplicationsController => {
	const stateStore = createStore(initialApplicationsState)
	const current = stateStore.getState
	let issuedRead = 0
	let readBound: ReturnType<typeof setTimeout> | undefined
	let catalogueBound: ReturnType<typeof setTimeout> | undefined
	let unwatchDirectory: (() => void) | null = null
	const askedNames = new Set<string>()

	const set = (fields: Partial<ApplicationsState>) =>
		stateStore.setState({ ...current(), ...fields })

	const reportDirectoryUnrefreshed = () =>
		reportFailure({
			title: i18n.t("bots:applications.catalogue.unrefreshed.title"),
			description: i18n.t(
				"bots:applications.catalogue.unrefreshed.description",
			),
		})

	const holdsDirectory = () => current().directory.length > 0

	const cancelReadBound = () => clearTimeout(readBound)

	const failUnansweredRead = () =>
		set({ isReadingDirectory: false, hasDirectoryFailed: true })

	const boundReadWithNoRowsHeld = () => {
		cancelReadBound()
		if (holdsDirectory()) {
			return
		}
		readBound = setTimeout(failUnansweredRead, DIRECTORY_READ_BOUND_MS)
	}

	const failUnansweredCatalogue = () =>
		set({ isReadingCatalogue: false, hasCatalogueFailed: true })

	const boundCatalogueWithNoRowsHeld = () => {
		clearTimeout(catalogueBound)
		if (current().curated.length > 0) {
			return
		}
		catalogueBound = setTimeout(
			failUnansweredCatalogue,
			DIRECTORY_READ_BOUND_MS,
		)
	}

	const readCatalogue = async () => {
		if (current().isReadingCatalogue) {
			return
		}
		set({ isReadingCatalogue: true, hasCatalogueFailed: false })
		boundCatalogueWithNoRowsHeld()
		try {
			set({ curated: await port.catalogue(), hasCatalogueFailed: false })
		} catch {
			set({ hasCatalogueFailed: true })
			reportFailure({
				title: i18n.t("bots:applications.catalogue.unavailable"),
			})
		} finally {
			clearTimeout(catalogueBound)
			set({ isReadingCatalogue: false })
		}
	}

	const directoryAnsweredBy = (found: ApplicationSearch) => {
		const isKeepingHeldRows =
			found.registryFailure !== undefined && holdsDirectory()
		return isKeepingHeldRows
			? {
					directory: current().directory,
					isDirectoryStale: current().isDirectoryStale,
				}
			: {
					directory: found.applications,
					isDirectoryStale: found.isStale === true,
				}
	}

	const readDirectory = () => {
		issuedRead += 1
		const attempt = issuedRead
		const isLastIssued = () => attempt === issuedRead
		set({
			isReadingDirectory: true,
			hasDirectoryFailed: false,
			hasDirectoryPartlyFailed:
				holdsDirectory() && current().hasDirectoryPartlyFailed,
		})
		boundReadWithNoRowsHeld()
		void port.search("").then(
			(found) => {
				if (!isLastIssued()) {
					return
				}
				cancelReadBound()
				const hasPartlyFailed = found.registryFailure !== undefined
				set({
					...directoryAnsweredBy(found),
					isReadingDirectory: false,
					hasDirectoryFailed: false,
					hasDirectoryPartlyFailed: hasPartlyFailed,
				})
				if (hasPartlyFailed) {
					reportDirectoryUnrefreshed()
				}
			},
			() => {
				if (!isLastIssued()) {
					return
				}
				cancelReadBound()
				const isKeepingRows = holdsDirectory()
				set({
					isReadingDirectory: false,
					hasDirectoryFailed: !isKeepingRows,
					isDirectoryStale: isKeepingRows && current().isDirectoryStale,
				})
				if (isKeepingRows) {
					reportDirectoryUnrefreshed()
				}
			},
		)
	}

	const watchDirectory = () => {
		if (unwatchDirectory) {
			return
		}
		let isListening = true
		const listening = port
			.onDirectoryRefreshed(() => {
				if (isListening) {
					readDirectory()
				}
			})
			.catch((reason) => {
				console.error(
					"applications: directory refreshes could not be listened to",
					reason,
				)
				return () => undefined
			})
		unwatchDirectory = () => {
			isListening = false
			unwatchDirectory = null
			void listening.then((unlisten) => unlisten())
		}
	}

	const recordMark = (name: string, found: Application | null) => {
		set({
			marks: {
				...current().marks,
				[name]: found && applicationMarkOf(found),
			},
		})
	}

	const askNamed = (name: string) => {
		askedNames.add(name)
		void port.named(name).then(
			(found) => recordMark(name, found),
			() => recordMark(name, null),
		)
	}

	const needsLookup = (name: string) =>
		!askedNames.has(name) &&
		!current().curated.some((held) => held.name === name)

	const applicationNamed = (id: string) => {
		const { curated, directory } = current()
		return [...curated, ...directory].find((held) => held.name === id) ?? null
	}

	const deleteWrittenSecrets = async (owner: EnvOwner, name: string) => {
		const scope = serverScopeOf(owner, name)
		const written = await store.environmentVariables(scope)
		for (const entry of written) {
			if (entry.definedIn.kind === "server") {
				await store.deleteEnvironmentVariable(scope, entry.name)
			}
		}
	}

	const refusalOf = async (step: () => Promise<void>) => {
		try {
			await step()
			return null
		} catch (refusal) {
			return refusal
		}
	}

	const rollBackDeclaration = async (owner: EnvOwner, name: string) => {
		const secretsRefusal = await refusalOf(() =>
			deleteWrittenSecrets(owner, name),
		)
		const undeclareRefusal = await refusalOf(() =>
			undeclareServer(store, owner, name),
		)
		const refusal = undeclareRefusal ?? secretsRefusal
		if (!refusal) {
			return
		}
		reportFailure({
			title: i18n.t("bots:applications.install.rollback.title", { name }),
			description: i18n.t("bots:applications.install.rollback.description", {
				reason: refusalTextOf(refusal),
			}),
		})
	}

	const writeKeys = async (
		owner: EnvOwner,
		name: string,
		asked: TypedValue[],
	) => {
		const scope = serverScopeOf(owner, name)
		for (const { field, value } of asked) {
			await store.setEnvironmentVariable(scope, field.secret, value)
		}
	}

	const isDeclaredUnder = async (owner: EnvOwner, name: string) => {
		const held = await declaredServers(store, owner)
		return held.some((server) => server.name === name)
	}

	const runInstall = async (
		application: Application,
		target: InstallTarget,
		values: InstallValues,
	) => {
		if (application.install.kind === "refused") {
			throw new Error(application.install.reason)
		}
		const asked = typedValuesOf(application.install, values)
		const unfilled = asked.filter((held) => held.value.trim() === "")
		if (unfilled.length > 0) {
			throw new Error(
				i18n.t("bots:applications.install.missing", {
					fields: unfilled.map((held) => held.field.name).join(", "),
				}),
			)
		}
		const unrunnable = await port.runnable(application.config)
		if (unrunnable) {
			throw new Error(unrunnable.reason)
		}
		const { owner } = target
		const wasDeclared = await isDeclaredUnder(owner, application.name)
		await declareServer(store, owner, application.name, application.config, {
			title: application.title,
			logo: application.logo,
			logoUrl: application.logoUrl,
		})
		const orRollBack = async (step: () => Promise<void>) => {
			try {
				await step()
			} catch (refusal) {
				if (!wasDeclared) {
					await rollBackDeclaration(owner, application.name)
				}
				throw refusal
			}
		}
		await orRollBack(() => writeKeys(owner, application.name, asked))
		if (application.install.kind === "oauth") {
			await orRollBack(() =>
				target.connect(application.name, urlOf(application)),
			)
		}
	}

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		open: readCatalogue,

		browse: () => {
			watchDirectory()
			if (current().isReadingDirectory) {
				return
			}
			readDirectory()
		},

		stopWatchingDirectory: () => unwatchDirectory?.(),

		search: (query: string) => set({ query }),

		pickCategory: (category: CatalogueCategory) => set({ category }),

		retry: () => {
			if (current().hasCatalogueFailed) {
				void readCatalogue()
			}
			readDirectory()
		},

		pick: (id: string) => set({ picked: applicationNamed(id), failure: null }),

		leave: () => set({ picked: null, failure: null }),

		resolveMarks: (names: string[]) => {
			for (const name of new Set(names)) {
				if (needsLookup(name)) {
					askNamed(name)
				}
			}
		},

		install: async (target: InstallTarget, values: InstallValues = {}) => {
			const { picked: application, installing } = current()
			if (
				!application ||
				installing !== null ||
				target.declared.includes(application.name)
			) {
				return
			}
			set({ installing: application.name, failure: null })
			try {
				await runInstall(application, target, values)
				await target.settle()
			} catch (reason) {
				set({
					failure: i18n.t("bots:applications.install.failed", {
						reason: refusalTextOf(reason),
					}),
				})
			} finally {
				set({ installing: null })
			}
		},
	}
}
