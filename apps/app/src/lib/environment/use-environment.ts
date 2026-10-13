import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"

import { environmentQueryKeys } from "./environment-query-keys"

import type { EnvEntry, EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type Environment = {
	entries: EnvEntry[]
	hasFailedToRead: boolean
	isPending: boolean
	set: (name: string, value: string) => Promise<void>
	remove: (name: string) => Promise<void>
}

type VariableWrite = {
	name: string
	value: string
}

const NO_ENTRIES: EnvEntry[] = []

const RENDERED_INLINE = { rendersErrorInline: true } as const

export const useEnvironment = (
	store: TranscriptStore,
	scope: EnvScope | null,
): Environment => {
	const queryClient = useQueryClient()
	const queryKey = environmentQueryKeys.scope(scope)

	const {
		data = NO_ENTRIES,
		isError,
		isPending,
	} = useQuery({
		queryKey,
		queryFn: scope ? () => store.environmentVariables(scope) : skipToken,
		meta: RENDERED_INLINE,
	})

	const rereadScope = () => queryClient.invalidateQueries({ queryKey })

	const setVariable = useMutation({
		mutationFn: async ({ name, value }: VariableWrite) => {
			if (scope) await store.setEnvironmentVariable(scope, name, value)
		},
		onSettled: rereadScope,
		meta: RENDERED_INLINE,
	})

	const removeVariable = useMutation({
		mutationFn: async (name: string) => {
			if (scope) await store.deleteEnvironmentVariable(scope, name)
		},
		onSettled: rereadScope,
		meta: RENDERED_INLINE,
	})

	return {
		entries: data,
		hasFailedToRead: isError,
		isPending,
		set: (name, value) => setVariable.mutateAsync({ name, value }),
		remove: removeVariable.mutateAsync,
	}
}
