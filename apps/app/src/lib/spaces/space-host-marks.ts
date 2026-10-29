import type { SpaceHost } from "@workspace/ui/components/host-pill"

import { hostMarksOf } from "./joined-spaces-controller"

import type { HostingState, JoinedSpace } from "../bindings"
import type { JoinedHostState } from "../host/joined-hosts"

type SpaceHostSources = {
	sharedBySpaceId: Record<string, boolean>
	hostingBySpaceId: Record<string, HostingState>
	joinedSpaces: JoinedSpace[]
	connections: Record<string, JoinedHostState>
}

const hostedHostOf = (hosting: HostingState | undefined): SpaceHost =>
	hosting?.kind === "online" ? "up" : "down"

const hostedMarksOf = (
	sharedBySpaceId: Record<string, boolean>,
	hostingBySpaceId: Record<string, HostingState>,
): Record<string, SpaceHost> =>
	Object.fromEntries(
		Object.keys(sharedBySpaceId)
			.filter((spaceId) => sharedBySpaceId[spaceId])
			.map((spaceId) => [spaceId, hostedHostOf(hostingBySpaceId[spaceId])]),
	)

export const spaceHostMarksOf = ({
	sharedBySpaceId,
	hostingBySpaceId,
	joinedSpaces,
	connections,
}: SpaceHostSources): Record<string, SpaceHost> => ({
	...hostedMarksOf(sharedBySpaceId, hostingBySpaceId),
	...hostMarksOf(joinedSpaces, connections),
})
