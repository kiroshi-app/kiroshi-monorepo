import {
	hashKey,
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"

import { botQueryKeys } from "./bot-query-keys"
import {
	declaredServers,
	declareServer,
	markOf,
	undeclareServer,
} from "./mcp-server-writes"

import { INSTALLED_EVENT } from "../applications/application-transport"
import type { BotMcpServer, EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export type McpServers = {
	owner: EnvOwner | null
	servers: BotMcpServer[]
	hasFailedToLoad: boolean
	isPending: boolean
	reread: () => Promise<void>
	create: (name: string, config: Record<string, unknown>) => Promise<boolean>
	rename: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => Promise<boolean>
	remove: (name: string) => Promise<boolean>
}

type ServerUndeclaration = {
	owner: EnvOwner
	name: string
}

type ServerDeclaration = {
	owner: EnvOwner
	openedName: string | null
	name: string
	config: Record<string, unknown>
}

const NO_SERVERS: BotMcpServer[] = []

const RENDERED_INLINE = { rendersErrorInline: true } as const

const hasLanded = (write: Promise<unknown>) =>
	write.then(
		() => true,
		() => false,
	)

const renamedFromOf = ({ openedName, name }: ServerDeclaration) =>
	openedName && openedName !== name ? openedName : null

export const useMcpServers = (
	store: TranscriptStore,
	owner: EnvOwner | null,
): McpServers => {
	const queryClient = useQueryClient()
	const queryKey = botQueryKeys.mcpServersOf(owner)
	const writeScope = { id: hashKey(queryKey) }

	const {
		data = NO_SERVERS,
		isError,
		isPending,
	} = useQuery({
		queryKey,
		queryFn: owner ? () => declaredServers(store, owner) : skipToken,
		meta: RENDERED_INLINE,
	})

	useInvalidateOnHostEvent(INSTALLED_EVENT, [queryKey])

	const reread = () => queryClient.invalidateQueries({ queryKey })

	const heldServers = () =>
		queryClient.getQueryData<BotMcpServer[]>(queryKey) ?? NO_SERVERS

	const declare = useMutation({
		mutationFn: async (declaration: ServerDeclaration) => {
			const renamedFrom = renamedFromOf(declaration)
			await declareServer(
				store,
				declaration.owner,
				declaration.name,
				declaration.config,
				renamedFrom ? markOf(heldServers(), renamedFrom) : undefined,
			)
			if (renamedFrom) {
				await undeclareServer(store, declaration.owner, renamedFrom)
			}
		},
		onSettled: reread,
		scope: writeScope,
		meta: RENDERED_INLINE,
	})

	const undeclare = useMutation({
		mutationFn: ({ owner: held, name }: ServerUndeclaration) =>
			undeclareServer(store, held, name),
		onSettled: reread,
		scope: writeScope,
		meta: RENDERED_INLINE,
	})

	const landedFor = (write: (held: EnvOwner) => Promise<unknown>) =>
		owner ? hasLanded(write(owner)) : Promise.resolve(false)

	return {
		owner,
		servers: data,
		hasFailedToLoad: isError,
		isPending,
		reread,
		create: (name, config) =>
			landedFor((held) =>
				declare.mutateAsync({ owner: held, openedName: null, name, config }),
			),
		rename: (openedName, name, config) =>
			landedFor((held) =>
				declare.mutateAsync({ owner: held, openedName, name, config }),
			),
		remove: (name) =>
			landedFor((held) => undeclare.mutateAsync({ owner: held, name })),
	}
}
