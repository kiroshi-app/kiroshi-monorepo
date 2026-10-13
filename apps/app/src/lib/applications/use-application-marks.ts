import { useQueries } from "@tanstack/react-query"

import type { Application, ApplicationPort } from "./application-port"
import { applicationQueryKeys } from "./application-query-keys"
import { hasKeptMark } from "./connection-settings"

import type { BotMcpServer } from "../conversations/store-contract"

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

const namesToLookUp = (servers: BotMcpServer[], curated: Application[]) => [
	...new Set(
		servers
			.filter((server) => !hasKeptMark(server))
			.map((server) => server.name)
			.filter((name) => !curated.some((held) => held.name === name)),
	),
]

export const useApplicationMarks = (
	port: ApplicationPort,
	curated: Application[],
	servers: BotMcpServer[],
): ApplicationMarks => {
	const names = namesToLookUp(servers, curated)
	const lookups = useQueries({
		queries: names.map((name) => ({
			queryKey: applicationQueryKeys.mark(name),
			queryFn: async () => {
				const found = await port.named(name)
				return found && applicationMarkOf(found)
			},
			meta: { rendersErrorInline: true } as const,
		})),
	})

	return Object.fromEntries(
		names.flatMap((name, index) => {
			const { data, isError, isSuccess } = lookups[index] ?? {}
			if (isError) return [[name, null]]
			return isSuccess ? [[name, data ?? null]] : []
		}),
	)
}
