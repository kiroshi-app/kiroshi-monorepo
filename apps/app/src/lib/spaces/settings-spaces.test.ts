import { describe, expect, it } from "vitest"

import type { SpaceInvitation } from "@workspace/ui/components/space-invitations"

import { settingsSpacesOf, spacePageOf, spaceRankOf } from "./settings-spaces"
import type { Invitations } from "./use-invitations"

import type { JoinedSpace } from "../bindings"
import type { Space } from "../conversations/store-contract"

const STUDIO = { id: "studio", name: "Studio", colour: 257 } as Space

const HARBOR: JoinedSpace = {
	id: "harbor",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "harbor-on-host",
	name: "Harbor",
	state: "waitingForHost",
	hostedBy: "Steve",
	colour: 132,
	instanceId: "instance-of-harbor",
}

const ATELIER: SpaceInvitation = {
	id: "atelier",
	name: "Atelier",
	hostEmail: "steve@example.com",
	state: "waiting",
}

const ATELIER_TERMS = { hostEmail: "steve@example.com", expiresAt: 1_800_000 }

const invitationsOf = (
	rows: SpaceInvitation[],
	joinedIds: Record<string, string> = {},
): Pick<Invitations, "rows" | "termsOf" | "joinedIdOf"> => ({
	rows,
	termsOf: (id) =>
		rows.some((row) => row.id === id) ? ATELIER_TERMS : undefined,
	joinedIdOf: (id) => joinedIds[id],
})

const sourceOf = (
	invitations = invitationsOf([ATELIER]),
	joinedSpaces = [HARBOR],
) => ({ spaces: [STUDIO], joinedSpaces, invitations })

describe("spacePageOf", () => {
	it("shows a space of yours by its id", () => {
		expect(spacePageOf("studio", sourceOf())).toEqual({
			state: "yours",
			space: STUDIO,
		})
	})

	it("shows a joined space by its row id", () => {
		expect(spacePageOf("joined:harbor", sourceOf())).toEqual({
			state: "joined",
			joined: HARBOR,
		})
	})

	it("shows an invitation with the terms it was sent on", () => {
		expect(spacePageOf("atelier", sourceOf())).toEqual({
			state: "invitation",
			name: "Atelier",
			terms: ATELIER_TERMS,
		})
	})

	it("turns an accepted invitation into the row of the space it joined", () => {
		const accepted = invitationsOf([ATELIER], { atelier: "harbor" })

		expect(spacePageOf("atelier", sourceOf(accepted))).toEqual({
			state: "accepted",
			rowId: "joined:harbor",
		})
	})

	it("keeps the invitation until the space it joined is held", () => {
		const accepted = invitationsOf([ATELIER], { atelier: "harbor" })

		expect(spacePageOf("atelier", sourceOf(accepted, [])).state).toBe(
			"invitation",
		)
	})

	it("finds nothing once the space is gone", () => {
		expect(spacePageOf("joined:harbor", sourceOf(undefined, []))).toEqual({
			state: "gone",
		})
	})
})

describe("settingsSpacesOf", () => {
	const listed = settingsSpacesOf({
		spaces: [
			{ id: "studio", name: "Studio", avatarSeed: "studio" },
			{ id: "joined:harbor", name: "Harbor", avatarSeed: "joined:harbor" },
		],
		hostBySpaceId: { studio: "shared", "joined:harbor": "down" },
		badgesBySpaceId: { studio: "unread" },
		invitations: [
			ATELIER,
			{ ...ATELIER, id: "admitted", state: "hostOffline" },
		],
	})

	it("lists the spaces of yours apart from the joined ones, each with its host mark", () => {
		expect(listed.ownedSpaces).toEqual([
			{
				id: "studio",
				name: "Studio",
				avatarSeed: "studio",
				host: "shared",
				hasAttention: true,
			},
		])
		expect(listed.joinedSpaces).toEqual([
			{
				id: "joined:harbor",
				name: "Harbor",
				avatarSeed: "joined:harbor",
				host: "down",
				hasAttention: false,
			},
		])
	})

	it("lists the received invitations, without the ones already joined", () => {
		expect(listed.invitations).toEqual([
			{
				id: "atelier",
				name: "Atelier",
				colour: undefined,
				avatarSeed: "atelier",
			},
		])
	})
})

describe("spaceRankOf", () => {
	const spaces = Array.from({ length: 10 }, (_, i) => ({
		id: `space-${i + 1}`,
		name: `Space ${i + 1}`,
		avatarSeed: `space-${i + 1}`,
	}))

	it("ranks a space by its place in the switcher", () => {
		expect(spaceRankOf(spaces, "space-2")).toBe(2)
	})

	it("ranks no space past the last shortcut, nor one the switcher lacks", () => {
		expect(spaceRankOf(spaces, "space-10")).toBeUndefined()
		expect(spaceRankOf(spaces, "atelier")).toBeUndefined()
	})
})
