import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { UserSpace } from "@workspace/ui/components/settings-screen"
import type { Space as SwitcherSpace } from "@workspace/ui/components/space"
import type { SpaceInvitation } from "@workspace/ui/components/space-invitations"
import { SPACE_RANK_LIMIT } from "@workspace/ui/hooks/use-space-shortcut"

import { isJoinedRowId, joinedRowIdOf } from "./joined-spaces-controller"
import type { Invitations, InvitationTerms } from "./use-invitations"

import type { JoinedSpace } from "../bindings"
import type { Space } from "../conversations/store-contract"

type SettingsSpacesSource = {
	spaces: SwitcherSpace[]
	hostBySpaceId: Record<string, SpaceHost>
	badgesBySpaceId?: Record<string, unknown>
	invitations: SpaceInvitation[]
}

export type SettingsSpaces = {
	ownedSpaces: UserSpace[]
	joinedSpaces: UserSpace[]
	invitations: SwitcherSpace[]
}

const isReceived = (invitation: SpaceInvitation) =>
	invitation.state !== "hostOffline"

export const settingsSpacesOf = ({
	spaces,
	hostBySpaceId,
	badgesBySpaceId = {},
	invitations,
}: SettingsSpacesSource): SettingsSpaces => {
	const userSpaceOf = (space: SwitcherSpace): UserSpace => ({
		...space,
		host: hostBySpaceId[space.id],
		hasAttention: badgesBySpaceId[space.id] !== undefined,
	})
	return {
		ownedSpaces: spaces
			.filter((space) => !isJoinedRowId(space.id))
			.map(userSpaceOf),
		joinedSpaces: spaces
			.filter((space) => isJoinedRowId(space.id))
			.map(userSpaceOf),
		invitations: invitations
			.filter(isReceived)
			.map(({ id, name, colour }) => ({ id, name, colour })),
	}
}

export type SpacePage =
	| { state: "yours"; space: Space }
	| { state: "joined"; joined: JoinedSpace }
	| { state: "invitation"; name: string; terms: InvitationTerms }
	| { state: "accepted"; rowId: string }
	| { state: "gone" }

export type ShownSpacePage = Extract<
	SpacePage,
	{ state: "yours" | "joined" | "invitation" }
>

type SpacePageSource = {
	spaces: Space[]
	joinedSpaces: JoinedSpace[]
	invitations: Pick<Invitations, "rows" | "termsOf" | "joinedIdOf">
}

const acceptedRowIdOf = (
	spaceId: string,
	{ joinedSpaces, invitations }: SpacePageSource,
) => {
	const joinedId = invitations.joinedIdOf(spaceId)
	const isHeld = joinedSpaces.some((joined) => joined.id === joinedId)
	return joinedId && isHeld ? joinedRowIdOf(joinedId) : undefined
}

const invitationPageOf = (
	spaceId: string,
	{ invitations }: SpacePageSource,
): SpacePage | undefined => {
	const row = invitations.rows.find((invitation) => invitation.id === spaceId)
	const terms = invitations.termsOf(spaceId)
	return row && terms
		? { state: "invitation", name: row.name, terms }
		: undefined
}

export const spacePageOf = (
	spaceId: string,
	source: SpacePageSource,
): SpacePage => {
	const space = source.spaces.find((owned) => owned.id === spaceId)
	if (space) return { state: "yours", space }
	const joined = source.joinedSpaces.find(
		(held) => joinedRowIdOf(held.id) === spaceId,
	)
	if (joined) return { state: "joined", joined }
	const acceptedRowId = acceptedRowIdOf(spaceId, source)
	if (acceptedRowId) return { state: "accepted", rowId: acceptedRowId }
	return invitationPageOf(spaceId, source) ?? { state: "gone" }
}

export const spaceRankOf = (spaces: SwitcherSpace[], spaceId: string) => {
	const rank = spaces.findIndex((space) => space.id === spaceId) + 1
	return rank >= 1 && rank <= SPACE_RANK_LIMIT ? rank : undefined
}
