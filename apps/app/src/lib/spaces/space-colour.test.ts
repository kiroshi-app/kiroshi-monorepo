import { describe, expect, it } from "vitest"

import { spaceColourOf } from "./joined-spaces-controller"

import type { JoinedSpace, Space } from "../bindings"

const HOME: Space = {
	id: "home",
	name: "Home",
	colour: 210,
	position: 0,
	createdAt: 0,
	shared: false,
	instanceId: null,
}

const STUDIO: Space = { ...HOME, id: "studio", name: "Studio", colour: 30 }

const GARAGE: JoinedSpace = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
	state: "online",
	hostedBy: null,
	colour: 132,
	instanceId: "instance-of-joined-garage",
}

const SPACES = { spaces: [HOME, STUDIO], selectedSpaceId: HOME.id }
const JOINED = { joinedSpaces: [GARAGE], openId: null, departed: null }

describe("the colour of the space of a conversation", () => {
	it("is the colour of the open space for a conversation of the open space", () => {
		expect(spaceColourOf(HOME.id, SPACES, JOINED)).toBe(210)
	})

	it("is the colour of its own space, not the open one, for a conversation of another space", () => {
		expect(spaceColourOf(STUDIO.id, SPACES, JOINED)).toBe(30)
	})

	it("is the colour of a joined space for a conversation of that space", () => {
		expect(spaceColourOf("garage", SPACES, JOINED)).toBe(132)
	})

	it("is the colour of the open joined space when it is the space of the conversation", () => {
		const garageOpen = {
			spaces: [HOME, { ...STUDIO, id: "garage" }],
			selectedSpaceId: "garage",
		}

		expect(
			spaceColourOf("garage", garageOpen, { ...JOINED, openId: GARAGE.id }),
		).toBe(132)
	})

	it("is none for a space no longer known", () => {
		expect(spaceColourOf("gone", SPACES, JOINED)).toBeUndefined()
	})
})
