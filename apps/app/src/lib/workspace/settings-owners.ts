import { USER_OWNER } from "./user-owner"

import type { RosterState } from "../bots/roster-controller"
import type { EnvOwner } from "../conversations/store-contract"
import {
	type OpenSettings,
	openCompanionIdOf,
} from "../navigation/open-settings"
import type { SpacesState } from "../spaces/spaces-controller"

type ListedBots = Pick<RosterState, "bots">

type SelectedSpace = Pick<SpacesState, "selectedSpaceId">

type HeldSpaces = Pick<SpacesState, "spaces" | "selectedSpaceId">

const routedSpaceIdOf = (
	spaceId: string,
	{ spaces, selectedSpaceId }: HeldSpaces,
	openRowId: string | null,
) => {
	if (spaces.some((space) => space.id === spaceId)) return spaceId
	return spaceId === openRowId ? selectedSpaceId : null
}

export const companionSettingsOwnerOf = (
	openSettings: OpenSettings | null,
	{ bots }: ListedBots,
	{ selectedSpaceId }: SelectedSpace,
): EnvOwner | null => {
	const companionId = openCompanionIdOf(openSettings)
	const isListed = bots.some((bot) => bot.id === companionId)
	return companionId && isListed && selectedSpaceId
		? { kind: "bot", id: companionId, spaceId: selectedSpaceId }
		: null
}

export const spaceSettingsOwnerOf = (
	openSettings: OpenSettings | null,
	spaces: HeldSpaces,
	openRowId: string | null,
): EnvOwner | null => {
	if (openSettings?.kind !== "space") return null
	const id = routedSpaceIdOf(openSettings.spaceId, spaces, openRowId)
	return id ? { kind: "space", id } : null
}

export const userSettingsOwnerOf = (
	openSettings: OpenSettings | null,
): EnvOwner | null => (openSettings?.kind === "user" ? USER_OWNER : null)
