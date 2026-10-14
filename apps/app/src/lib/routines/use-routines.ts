import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import type { RoutineTriggerSource } from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type {
	RoutinesFailure,
	RoutinesPanelDetail,
	RoutinesPanelForm,
} from "@workspace/ui/components/routines-panel"

import type { Routine, RunsOfRoutine } from "./routine-contract"
import { routineQueryKeys } from "./routine-query-keys"
import {
	type KnownSources,
	type ReportedRunRead,
	toKnownSources,
	toReportedRuns,
	toRoutineRows,
	toTriggerSources,
} from "./routines-model"
import { routinesTransport } from "./routines-transport"
import type { BotTriggerSources, TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { useRoutineAnnouncements } from "./use-routine-announcements"
import { useRoutineDetail } from "./use-routine-detail"
import { useRoutineForm } from "./use-routine-form"

import { useReachableHost } from "@/lib/host/use-reachable-host"
import { isFirstReadPending } from "@/lib/query/last-read"

const NO_SOURCES: RoutineTriggerSource[] = []

export type ConversationRoutines = {
	routines: RoutineRowModel[]
	isPending: boolean
	reportedRuns: ReportedRunRead[]
	failure: RoutinesFailure | null
	reload: () => void
	setEnabled: (id: string, isEnabled: boolean) => void
	remove: (id: string) => Promise<void>
	form: RoutinesPanelForm
	detail: RoutinesPanelDetail
}

type Declaration = { botId: string; sources: TriggerSource[] }

const declarationsIn = (
	read: PromiseSettledResult<BotTriggerSources[]>,
): Declaration[] =>
	read.status === "fulfilled"
		? read.value.flatMap(({ botId, triggerSources, failure }) =>
				failure === null ? [{ botId, sources: triggerSources }] : [],
			)
		: []

const leadSourcesIn = (
	read: PromiseSettledResult<BotTriggerSources[]>,
	leadBotId: string | null,
): TriggerSource[] | null => {
	if (leadBotId === null) {
		return []
	}
	if (read.status === "rejected") {
		return null
	}
	const lead = read.value.find(({ botId }) => botId === leadBotId)
	if (!lead) {
		return []
	}
	return lead.failure === null ? lead.triggerSources : null
}

type ReportedRunsRead = {
	reported: ReportedRunRead[]
	hasFailed: boolean
}

const reportedRunsOf = (
	listed: Routine[],
	known: KnownSources,
	read: PromiseSettledResult<RunsOfRoutine[]>,
): ReportedRunsRead => {
	if (read.status === "rejected") {
		return { reported: [], hasFailed: true }
	}
	const runsByRoutineId = new Map(
		read.value.map(({ routineId, runs }) => [routineId, runs]),
	)
	const held = listed.map((routine) => ({
		routine,
		runs: runsByRoutineId.get(routine.id) ?? [],
	}))

	return { reported: toReportedRuns(held, known), hasFailed: false }
}

type RoutinesRead = {
	rows: Routine[]
	known: KnownSources
	reported: ReportedRunRead[]
	sources: RoutineTriggerSource[]
	failure: RoutinesFailure | null
}

const NOTHING_READ: RoutinesRead = {
	rows: [],
	known: new Map(),
	reported: [],
	sources: NO_SOURCES,
	failure: null,
}

type RoutinesReading = {
	conversationId: string
	spaceId: string
	leadBotId: string | null
	held: RoutinesRead | undefined
}

const readRoutines = async ({
	conversationId,
	spaceId,
	leadBotId,
	held,
}: RoutinesReading): Promise<RoutinesRead> => {
	const [listing, declaring, running] = await Promise.allSettled([
		routinesTransport.list(conversationId),
		triggerSourcesTransport.sourcesOfSpace(spaceId),
		routinesTransport.runsOfSpace(spaceId),
	])
	const declarations = declarationsIn(declaring)
	const declared = leadSourcesIn(declaring, leadBotId)
	const sources = declared ? toTriggerSources(declared) : NO_SOURCES

	if (listing.status === "rejected") {
		return { ...(held ?? NOTHING_READ), sources, failure: "routines" }
	}

	const known = toKnownSources(declarations)
	const runs = reportedRunsOf(listing.value, known, running)

	return {
		rows: listing.value,
		known,
		reported: runs.reported,
		sources,
		failure: declared && !runs.hasFailed ? null : "routines",
	}
}

type EnabledChange = { routine: Routine; isEnabled: boolean }

const writeEnabled = ({ routine, isEnabled }: EnabledChange) =>
	routinesTransport.update(routine.id, {
		title: routine.title,
		instruction: routine.instruction,
		filter: routine.filter,
		triggerConfig: routine.triggerConfig,
		isEnabled,
	})

const withRoutineReplaced = (written: Routine) => (rows: Routine[]) =>
	rows.map((row) => (row.id === written.id ? written : row))

const withRoutineHeld = (written: Routine) => (rows: Routine[]) =>
	rows.some((row) => row.id === written.id)
		? withRoutineReplaced(written)(rows)
		: [...rows, written]

const withRoutineRemoved = (id: string) => (rows: Routine[]) =>
	rows.filter((row) => row.id !== id)

export const useRoutines = (
	conversationId: string | null,
	spaceId: string | null,
	leadBotId?: string,
): ConversationRoutines => {
	const queryClient = useQueryClient()
	const host = useReachableHost()
	const lead = leadBotId ?? null
	const canRead = conversationId !== null && spaceId !== null && host !== null
	const [writeFailedAt, setWriteFailedAt] = useState<number | null>(null)

	const listing = useQuery({
		queryKey: routineQueryKeys.list(conversationId, lead, host, spaceId),
		queryFn: canRead
			? ({ client, queryKey: readKey }) =>
					readRoutines({
						conversationId,
						spaceId,
						leadBotId: lead,
						held: client.getQueryData<RoutinesRead>(readKey),
					})
			: skipToken,
		meta: { rendersErrorInline: true },
	})
	const { data = NOTHING_READ, dataUpdatedAt, refetch } = listing
	const isPending = isFirstReadPending(listing)
	const { rows, known, reported, sources } = data
	const hasWriteFailedLast =
		writeFailedAt !== null && writeFailedAt >= dataUpdatedAt
	const failure = hasWriteFailedLast ? "write" : data.failure

	const reload = useCallback(() => {
		if (canRead) {
			void refetch()
		}
	}, [canRead, refetch])

	const patchRows = useCallback(
		(change: (rows: Routine[]) => Routine[]) => {
			queryClient.setQueryData<RoutinesRead>(
				routineQueryKeys.list(conversationId, lead, host, spaceId),
				(held) => held && { ...held, rows: change(held.rows) },
			)
			setWriteFailedAt(null)
		},
		[queryClient, conversationId, lead, host, spaceId],
	)

	const raiseWriteFailure = useCallback(() => setWriteFailedAt(Date.now()), [])

	const { mutate: writeEnabledChange } = useMutation({
		mutationFn: writeEnabled,
		onSuccess: (written) => patchRows(withRoutineReplaced(written)),
		onError: raiseWriteFailure,
		meta: { rendersErrorInline: true },
	})

	const { mutateAsync: remove } = useMutation({
		mutationFn: (id: string) => routinesTransport.delete(id),
		onSuccess: (_removed, id) => patchRows(withRoutineRemoved(id)),
		meta: { rendersErrorInline: true },
	})

	const setEnabled = useCallback(
		(id: string, isEnabled: boolean) => {
			const routine = rows.find((candidate) => candidate.id === id)
			if (routine) {
				writeEnabledChange({ routine, isEnabled })
			}
		},
		[rows, writeEnabledChange],
	)

	const hold = useCallback(
		(written: Routine) => patchRows(withRoutineHeld(written)),
		[patchRows],
	)

	const routines = useMemo(() => toRoutineRows(rows, known), [rows, known])

	const detail = useRoutineDetail({
		routines,
		onWriteFailure: raiseWriteFailure,
	})

	useRoutineAnnouncements(conversationId)

	const form = useRoutineForm({
		conversationId,
		isOverDetail: detail.open !== null,
		leadBotId,
		sources,
		known,
		held: rows,
		onWritten: hold,
		onWriteFailure: raiseWriteFailure,
	})

	return useMemo(
		() => ({
			routines,
			isPending,
			reportedRuns: reported,
			failure,
			reload,
			setEnabled,
			remove,
			form,
			detail,
		}),
		[
			routines,
			isPending,
			reported,
			failure,
			reload,
			setEnabled,
			remove,
			form,
			detail,
		],
	)
}
