import type { UpdateBadgeProps } from "@workspace/ui/components/update-badge"

import { downloadedPercentOf } from "./download-progress"
import type { UpdaterState } from "./updater-controller"

type UpdateBadgeModel = Pick<
	UpdateBadgeProps,
	| "status"
	| "version"
	| "releaseNotes"
	| "releaseNotesUrl"
	| "progress"
	| "activeBotCount"
>

type UpdateBadgeInput = {
	state: UpdaterState
	notes: string | null | undefined
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

const BULLET = /^[-*+]\s*/

export const linesOf = (notes: string | null | undefined): string[] =>
	(notes ?? "")
		.split("\n")
		.map((line) => line.trim().replace(BULLET, ""))
		.filter((line) => line.length > 0)

const RELEASE_TAG_URL =
	"https://github.com/shoto290/kiroshi-monorepo/releases/tag"

export const releaseNotesUrlOf = (version: string): string =>
	`${RELEASE_TAG_URL}/v${version}`

export const toUpdateBadgeProps = ({
	state,
	notes,
	busyBotCount,
}: UpdateBadgeInput): UpdateBadgeModel => ({
	status: statusOf(state),
	version: state.offeredVersion ?? undefined,
	releaseNotes: linesOf(notes),
	releaseNotesUrl: state.offeredVersion
		? releaseNotesUrlOf(state.offeredVersion)
		: undefined,
	progress: downloadedPercentOf(state.host),
	activeBotCount: busyBotCount,
})
