import { describe, expect, it } from "vitest"

import { toWhatsNewContent } from "./whats-new-model"

describe("toWhatsNewContent", () => {
	it("reads a headline, a subline and the remaining notes from the body", () => {
		expect(
			toWhatsNewContent({
				version: "0.25.0",
				body: "## Missions show their branch\n\nSee where it lands.\n- One\n* Two",
				visualUrl: null,
			}),
		).toEqual({
			version: "0.25.0",
			visual: undefined,
			headline: "Missions show their branch",
			subline: "See where it lands.",
			notes: ["One", "Two"],
			releaseNotesUrl:
				"https://github.com/shoto290/kiroshi-monorepo/releases/tag/v0.25.0",
		})
	})

	it("names the version when the release has no body", () => {
		expect(
			toWhatsNewContent({ version: "0.25.0", body: null, visualUrl: null }),
		).toMatchObject({
			headline: "What’s new in 0.25.0",
			subline: "",
			notes: [],
		})
	})
})
