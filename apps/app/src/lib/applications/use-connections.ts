import {
	hashKey,
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"

import { applicationQueryKeys } from "./application-query-keys"
import type { ApplicationRow, ConnectionPort } from "./connection-port"

import type { EnvOwner } from "../conversations/store-contract"

export type ConnectionCommand = "status" | "connect" | "cancel" | "disconnect"

export type ConnectionFailure = {
	command: ConnectionCommand
	name: string | null
	reason: unknown
}

export type ConnectionOutcome = {
	rows: ApplicationRow[]
	failure: ConnectionFailure | null
}

export type Connections = {
	rows: ApplicationRow[]
	connecting: string | null
	failure: ConnectionFailure | null
	isPending: boolean
	connect: (name: string, url: string) => Promise<ConnectionOutcome>
	cancel: () => void
	disconnect: (name: string, url: string) => Promise<ConnectionOutcome>
}

type CancelRun = {
	owner: EnvOwner
	connecting: string | null
}

type ConnectionRun = {
	owner: EnvOwner
	command: "connect" | "disconnect"
	name: string
	url: string
}

const NO_ROWS: ApplicationRow[] = []

const NO_OUTCOME: ConnectionOutcome = { rows: NO_ROWS, failure: null }

const RENDERED_INLINE = { rendersErrorInline: true } as const

const isCancellation = (reason: unknown) =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === "cancelled"

const reportRefusal = (owner: EnvOwner, failure: ConnectionFailure) =>
	console.error(
		`connections: ${failure.command} was refused for ${failure.name ?? owner.kind}`,
		failure.reason,
	)

const readStatus = (port: ConnectionPort, owner: EnvOwner) =>
	port.status(owner).catch((reason: unknown) => {
		reportRefusal(owner, { command: "status", name: null, reason })
		throw reason
	})

const failureOf = (
	{ command, name }: ConnectionRun,
	reason: unknown,
): ConnectionFailure | null =>
	isCancellation(reason) ? null : { command, name, reason }

const isSameOwner = (left: EnvOwner | null, right: EnvOwner | null) =>
	hashKey([left]) === hashKey([right])

export const useConnections = (
	port: ConnectionPort,
	owner: EnvOwner | null,
): Connections => {
	const queryClient = useQueryClient()
	const queryKey = applicationQueryKeys.connectionsOf(owner)

	const { data = NO_ROWS, isPending } = useQuery({
		queryKey,
		queryFn: owner ? () => readStatus(port, owner) : skipToken,
		meta: RENDERED_INLINE,
	})

	const rereadStatus = () => queryClient.invalidateQueries({ queryKey })

	const run = useMutation({
		mutationFn: async ({ owner: held, command, name, url }: ConnectionRun) => {
			if (command === "connect") {
				await port.connect(held, name, url)
			} else {
				await port.disconnect(held, name, url)
			}
		},
		onError: (reason, variables) => {
			const failure = failureOf(variables, reason)
			if (failure) reportRefusal(variables.owner, failure)
		},
		onSettled: rereadStatus,
		meta: RENDERED_INLINE,
	})

	const cancelRun = useMutation({
		mutationFn: (_: CancelRun) => port.cancel(),
		onError: (reason, { owner: held, connecting: name }) =>
			reportRefusal(held, { command: "cancel", name, reason }),
		onSettled: rereadStatus,
		meta: RENDERED_INLINE,
	})

	const ownRun =
		run.variables && isSameOwner(run.variables.owner, owner)
			? run.variables
			: null
	const connecting =
		ownRun?.command === "connect" && run.isPending ? ownRun.name : null
	const failure = ownRun && run.isError ? failureOf(ownRun, run.error) : null

	const outcomeOf = async (
		variables: ConnectionRun,
	): Promise<ConnectionOutcome> => {
		const failed = await run.mutateAsync(variables).then(
			() => null,
			(reason: unknown) => failureOf(variables, reason),
		)
		const rows = queryClient.getQueryData<ApplicationRow[]>(
			applicationQueryKeys.connectionsOf(variables.owner),
		)
		return { rows: rows ?? NO_ROWS, failure: failed }
	}

	const sendTo =
		(command: ConnectionRun["command"]) => (name: string, url: string) =>
			owner
				? outcomeOf({ owner, command, name, url })
				: Promise.resolve(NO_OUTCOME)

	return {
		rows: data,
		connecting,
		failure,
		isPending,
		connect: sendTo("connect"),
		cancel: () => {
			if (owner) cancelRun.mutate({ owner, connecting })
		},
		disconnect: sendTo("disconnect"),
	}
}
