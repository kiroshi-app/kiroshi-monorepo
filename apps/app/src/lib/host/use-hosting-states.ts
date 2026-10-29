import { type UseQueryResult, useQueries } from "@tanstack/react-query"

import { hostQueryKeys } from "./host-query-keys"
import { type HostingTransport, hostingTransport } from "./hosting-transport"
import { isDesktopHost } from "./index"

import {
	HOSTING_CHANGED_EVENT,
	type HostingChanged,
	type HostingState,
} from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

const readHostingOf =
	(transport: Pick<HostingTransport, "read">, spaceId: string) =>
	async (): Promise<HostingChanged> => ({
		spaceId,
		state: await transport.read(spaceId),
	})

const hostingBySpaceIdOf = (
	reads: UseQueryResult<HostingChanged>[],
): Record<string, HostingState> =>
	Object.fromEntries(
		reads.flatMap(({ data }) => (data ? [[data.spaceId, data.state]] : [])),
	)

export const useHostingStates = (
	spaceIds: string[],
	transport: Pick<HostingTransport, "read"> = hostingTransport,
): Record<string, HostingState> => {
	const hostingBySpaceId = useQueries({
		queries: spaceIds.map((spaceId) => ({
			queryKey: hostQueryKeys.hostingStateOf(spaceId),
			queryFn: readHostingOf(transport, spaceId),
			enabled: isDesktopHost(),
			meta: { rendersErrorInline: true as const },
		})),
		combine: hostingBySpaceIdOf,
	})
	useInvalidateOnHostEvent(HOSTING_CHANGED_EVENT, [
		hostQueryKeys.hostingStates(),
	])
	return hostingBySpaceId
}
