import { describe, expect, it } from "vitest"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { type Space, spaceAtRank } from "@workspace/ui/components/space"

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: BLOT_HUES.blue, avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.green, avatarSeed: "vocca" },
	{
		id: "atelier",
		name: "Atelier",
		colour: BLOT_HUES.pink,
		avatarSeed: "atelier",
	},
]

describe("spaceAtRank", () => {
	it("counts from one", () => {
		expect(spaceAtRank(SPACES, 1)?.id).toBe("perso")
		expect(spaceAtRank(SPACES, 3)?.id).toBe("atelier")
	})

	it("answers nothing for a rank no space fills", () => {
		expect(spaceAtRank(SPACES, 4)).toBeUndefined()
		expect(spaceAtRank([], 1)).toBeUndefined()
	})
})
