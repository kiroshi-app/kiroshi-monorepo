import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useState } from "react"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import {
	type CatalogueCategory,
	EVERYTHING_CATEGORY,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type ApplicationDirectory,
	readDirectory,
} from "./application-directory"
import {
	type InstallDependencies,
	type InstallRun,
	type InstallTarget,
	type InstallValues,
	installFailureOf,
	runInstall,
} from "./application-install"
import type { Application, ApplicationPort } from "./application-port"
import { applicationQueryKeys } from "./application-query-keys"
import { useReadBound } from "./use-read-bound"

import { failureReporterIn } from "../failure-report"
import type { TranscriptStore } from "../conversations/store-port"

export type ApplicationsState = {
	curated: Application[]
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

export type ApplicationsActions = {
	browse: () => void
	search: (query: string) => void
	pickCategory: (category: CatalogueCategory) => void
	retry: () => void
	pick: (id: string) => void
	leave: () => void
	install: (target: InstallTarget, values?: InstallValues) => void
}

export type Applications = {
	state: ApplicationsState
	actions: ApplicationsActions
}

type ApplicationsOptions = {
	isCatalogueOpen: boolean
	reportFailure?: (notice: NoticeMessage) => void
}

type CatalogueStatus = {
	isLoading: boolean
	hasFailed: boolean
}

const RAISED_IN = "use-applications"

const RENDERED_INLINE = { rendersErrorInline: true } as const

const NO_APPLICATIONS: Application[] = []

const EMPTY_DIRECTORY: ApplicationDirectory = {
	applications: NO_APPLICATIONS,
	isStale: false,
	hasPartlyFailed: false,
}

const reportInApplications = failureReporterIn(RAISED_IN)

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

const unrefreshedNotice = (): NoticeMessage => ({
	title: i18n.t("bots:applications.catalogue.unrefreshed.title"),
	description: i18n.t("bots:applications.catalogue.unrefreshed.description"),
})

const usePortInvalidations = (port: ApplicationPort) => {
	const queryClient = useQueryClient()

	useEffect(() => {
		const invalidate = (queryKey: QueryKey) => {
			void queryClient
				.cancelQueries({ queryKey })
				.then(() => queryClient.invalidateQueries({ queryKey }))
		}
		const reportUnheard = (subscription: string) => (reason: unknown) => {
			console.error(
				`applications: ${subscription} could not be listened to`,
				reason,
			)
			return () => undefined
		}
		const installs = port
			.onInstalled(({ application }) => {
				invalidate(applicationQueryKeys.catalogue())
				invalidate(applicationQueryKeys.directory())
				invalidate(applicationQueryKeys.mark(application))
			})
			.catch(reportUnheard("installs"))
		const refreshes = port
			.onDirectoryRefreshed(() => invalidate(applicationQueryKeys.directory()))
			.catch(reportUnheard("directory refreshes"))
		return () => {
			void installs.then((unlisten) => unlisten())
			void refreshes.then((unlisten) => unlisten())
		}
	}, [port, queryClient])
}

const useRereadAfresh = () => {
	const queryClient = useQueryClient()
	return (queryKey: QueryKey) =>
		queryClient
			.cancelQueries({ queryKey })
			.then(() => queryClient.refetchQueries({ queryKey }))
}

const useCatalogueRead = (port: ApplicationPort) => {
	const rereadAfresh = useRereadAfresh()
	const catalogue = useQuery({
		queryKey: applicationQueryKeys.catalogue(),
		queryFn: () => port.catalogue(),
		meta: {
			failureNotice: () => ({
				title: i18n.t("bots:applications.catalogue.unavailable"),
			}),
			raisedIn: RAISED_IN,
		},
	})
	const curated = catalogue.data ?? NO_APPLICATIONS
	const hasOverrun = useReadBound(catalogue.isFetching && curated.length === 0)
	const hasFailed = (catalogue.isError && !catalogue.isFetching) || hasOverrun

	return {
		curated,
		isReading: catalogue.isFetching && !hasOverrun,
		hasFailed,
		retry: () => {
			if (hasFailed) void rereadAfresh(applicationQueryKeys.catalogue())
		},
	}
}

type DirectoryReadOptions = {
	isEnabled: boolean
	reportFailure: (notice: NoticeMessage) => void
}

const useDirectoryRead = (
	port: ApplicationPort,
	{ isEnabled, reportFailure }: DirectoryReadOptions,
) => {
	const queryClient = useQueryClient()
	const rereadAfresh = useRereadAfresh()
	const [isBrowsing, setBrowsing] = useState(false)
	const queryKey = applicationQueryKeys.directory()
	const directory = useQuery({
		queryKey,
		queryFn: ({ signal }) =>
			readDirectory(
				port,
				queryClient.getQueryData<ApplicationDirectory>(queryKey),
				() => {
					if (!signal.aborted) reportFailure(unrefreshedNotice())
				},
			),
		enabled: isBrowsing && isEnabled,
		meta: RENDERED_INLINE,
	})
	const answered = directory.data ?? EMPTY_DIRECTORY
	const holdsRows = answered.applications.length > 0
	const hasOverrun = useReadBound(directory.isFetching && !holdsRows)

	return {
		applications: answered.applications,
		isReading: directory.isFetching && !hasOverrun,
		hasFailed: (directory.isError && !directory.isFetching) || hasOverrun,
		hasPartlyFailed:
			answered.hasPartlyFailed && (holdsRows || !directory.isFetching),
		isStale: !directory.isError && answered.isStale,
		browse: () => {
			setBrowsing(true)
			void queryClient.refetchQueries({ queryKey }, { cancelRefetch: false })
		},
		retry: () => void rereadAfresh(queryKey),
	}
}

const useInstall = (dependencies: InstallDependencies) => {
	const queryClient = useQueryClient()
	const install = useMutation({
		mutationKey: applicationQueryKeys.install(),
		mutationFn: async (run: InstallRun) => {
			await runInstall(dependencies, run)
			await run.target.settle()
		},
		meta: RENDERED_INLINE,
	})

	return {
		installing: install.isPending
			? (install.variables?.application.name ?? null)
			: null,
		failure: install.isError ? installFailureOf(install.error) : null,
		forgetFailure: () => {
			if (install.isError) install.reset()
		},
		isRunning: () =>
			queryClient.isMutating({ mutationKey: applicationQueryKeys.install() }) >
			0,
		run: install.mutate,
	}
}

export const useApplications = (
	port: ApplicationPort,
	store: TranscriptStore,
	{
		isCatalogueOpen,
		reportFailure = reportInApplications,
	}: ApplicationsOptions,
): Applications => {
	const [query, setQuery] = useState("")
	const [category, setCategory] =
		useState<CatalogueCategory>(EVERYTHING_CATEGORY)
	const [pickedName, setPickedName] = useState<string | null>(null)
	usePortInvalidations(port)
	const catalogue = useCatalogueRead(port)
	const directory = useDirectoryRead(port, {
		isEnabled: isCatalogueOpen,
		reportFailure,
	})
	const install = useInstall({ port, store, reportFailure })
	const picked =
		[...catalogue.curated, ...directory.applications].find(
			(held) => held.name === pickedName,
		) ?? null

	return {
		state: {
			curated: catalogue.curated,
			isReadingCatalogue: catalogue.isReading,
			hasCatalogueFailed: catalogue.hasFailed,
			query,
			category,
			directory: directory.applications,
			isReadingDirectory: directory.isReading,
			hasDirectoryFailed: directory.hasFailed,
			hasDirectoryPartlyFailed: directory.hasPartlyFailed,
			isDirectoryStale: directory.isStale,
			picked,
			installing: install.installing,
			failure: install.failure,
		},
		actions: {
			browse: directory.browse,
			search: setQuery,
			pickCategory: setCategory,
			retry: () => {
				catalogue.retry()
				directory.retry()
			},
			pick: (id) => {
				setPickedName(id)
				install.forgetFailure()
			},
			leave: () => {
				setPickedName(null)
				install.forgetFailure()
			},
			install: (target, values = {}) => {
				if (
					!picked ||
					install.isRunning() ||
					target.declared.includes(picked.name)
				) {
					return
				}
				install.run({ application: picked, target, values })
			},
		},
	}
}
