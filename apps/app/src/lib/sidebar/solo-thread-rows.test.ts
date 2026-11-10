import { describe, expect, it } from "vitest"

import { soloThreadRowsOf } from "./solo-thread-rows"

const ATLAS = { id: "atlas", name: "Atlas", blot: 3, pinPosition: 0 }

const NOVA = { id: "nova", name: "Nova" }

describe("soloThreadRowsOf", () => {
	it("shows the agent of a solo thread in the Space as a conversation row, and no agent without one", () => {
		const rows = soloThreadRowsOf({
			agents: [ATLAS, NOVA],
			soloThreads: {
				"thread-atlas": { spaceId: "studio", botId: "atlas" },
				"thread-nova": { spaceId: "elsewhere", botId: "nova" },
			},
			spaceId: "studio",
		})

		expect(rows).toEqual([
			expect.objectContaining({
				id: "atlas",
				name: "Atlas",
				participants: [ATLAS],
				color: 3,
				pinPosition: 0,
			}),
		])
	})
})
