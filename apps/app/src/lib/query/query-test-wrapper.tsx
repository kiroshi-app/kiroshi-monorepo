import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"

import { createQueryClient } from "./query-client"

type QueryTestWrapper = {
	queryClient: QueryClient
	wrapper: (props: PropsWithChildren) => React.JSX.Element
}

const createTestQueryClient = (): QueryClient => {
	const queryClient = createQueryClient()
	const { queries, mutations } = queryClient.getDefaultOptions()
	queryClient.setDefaultOptions({
		queries: { ...queries, retry: false, gcTime: Number.POSITIVE_INFINITY },
		mutations: { ...mutations, gcTime: Number.POSITIVE_INFINITY },
	})
	return queryClient
}

export const createQueryTestWrapper = (): QueryTestWrapper => {
	const queryClient = createTestQueryClient()
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	)
	return { queryClient, wrapper }
}
