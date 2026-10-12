import { useMemo } from "react"

import { HostPill } from "@workspace/ui/components/host-pill"
import { ShareButton } from "@workspace/ui/components/share-button"

import type { OpenJoinedHost } from "@/lib/spaces/open-joined-host"

type SpaceAccess = {
	joinedHost: OpenJoinedHost | null
	isOwnSpace: boolean
	onShare: () => void
}

const spaceAccessOf = ({ joinedHost, isOwnSpace, onShare }: SpaceAccess) => {
	if (joinedHost) {
		return (
			<>
				<HostPill isOnline={joinedHost.isOnline} />
				<ShareButton onShare={onShare} />
			</>
		)
	}
	return isOwnSpace ? <ShareButton onShare={onShare} /> : undefined
}

export const useSpaceAccess = ({
	joinedHost,
	isOwnSpace,
	onShare,
}: SpaceAccess) =>
	useMemo(
		() => spaceAccessOf({ joinedHost, isOwnSpace, onShare }),
		[joinedHost, isOwnSpace, onShare],
	)
