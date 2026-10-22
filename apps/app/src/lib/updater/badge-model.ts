import type { UpdateBadgeProps } from "@workspace/ui/components/update-badge"

import { downloadedPercentOf } from "./download-progress"
import type { UpdaterState } from "./updater-controller"

type UpdateBadgeModel = Pick<
	UpdateBadgeProps,
	"status" | "version" | "progress" | "activeBotCount"
>

type UpdateBadgeInput = {
	state: UpdaterState
	busyBotCount: number
}

const statusOf = ({ host }: UpdaterState): UpdateBadgeProps["status"] => {
	switch (host.kind) {
		case "readyToRestart":
			return "ready"
		case "downloading":
			return "downloading"
		case "failed":
			return "error"
		case "available":
			return "available"
		default:
			return "idle"
	}
}

const RELEASE_TAG_URL =
	"https://github.com/kiroshi-app/kiroshi-monorepo/releases/tag"

export const releaseNotesUrlOf = (version: string): string =>
	`${RELEASE_TAG_URL}/v${version}`

export const toUpdateBadgeProps = ({
	state,
	busyBotCount,
}: UpdateBadgeInput): UpdateBadgeModel => ({
	status: statusOf(state),
	version: state.offeredVersion ?? undefined,
	progress: downloadedPercentOf(state.host),
	activeBotCount: busyBotCount,
})
