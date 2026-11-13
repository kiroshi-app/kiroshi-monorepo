import type { RosterState } from "../bots/roster-controller"
import { isJoinedRowId } from "../spaces/joined-spaces-controller"

type LaunchRoster = Pick<
	RosterState,
	"hasLoaded" | "isRosterPending" | "spaceRowId"
>

type LaunchReads = {
	hasLoadedPreferences: boolean
	roster: LaunchRoster
}

const isLocalRow = (spaceRowId: string | null) =>
	spaceRowId !== null && !isJoinedRowId(spaceRowId)

const awaitsFirstRosterPage = ({ isRosterPending, spaceRowId }: LaunchRoster) =>
	isRosterPending && isLocalRow(spaceRowId)

export const haveLaunchReadsSettled = ({
	hasLoadedPreferences,
	roster,
}: LaunchReads) =>
	hasLoadedPreferences && roster.hasLoaded && !awaitsFirstRosterPage(roster)
