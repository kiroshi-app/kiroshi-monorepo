import { describe, expect, it } from "vitest"

import { GIT_CLIFF_BODY_0_24_2 } from "@workspace/ui/components/release-notes.fixtures"

import { toWhatsNewContent } from "./whats-new-model"

describe("toWhatsNewContent", () => {
	it("names the version and keeps the whole git-cliff body as notes", () => {
		expect(
			toWhatsNewContent({
				version: "0.24.2",
				body: GIT_CLIFF_BODY_0_24_2,
				visualUrl: null,
			}),
		).toEqual({
			version: "0.24.2",
			visual: undefined,
			headline: "What’s new in 0.24.2",
			subline: "",
			notes: GIT_CLIFF_BODY_0_24_2.trim(),
			releaseNotesUrl:
				"https://github.com/shoto290/kiroshi-monorepo/releases/tag/v0.24.2",
		})
	})

	it("names the version when the body opens on a bullet", () => {
		expect(
			toWhatsNewContent({
				version: "0.25.0",
				body: "- One\n- Two",
				visualUrl: null,
			}),
		).toMatchObject({
			headline: "What’s new in 0.25.0",
			subline: "",
			notes: "- One\n- Two",
		})
	})

	it("reads a headline and a subline from a prose body, the rest as notes", () => {
		expect(
			toWhatsNewContent({
				version: "0.25.0",
				body: "Missions show their branch\n\nSee where it lands.\n\n### Features\n\n- **app**: One\n- Two",
				visualUrl: null,
			}),
		).toMatchObject({
			headline: "Missions show their branch",
			subline: "See where it lands.",
			notes: "### Features\n\n- **app**: One\n- Two",
		})
	})

	it("draws no subline when the line after the headline is markdown", () => {
		expect(
			toWhatsNewContent({
				version: "0.25.0",
				body: "Missions show their branch\n- One",
				visualUrl: null,
			}),
		).toMatchObject({
			headline: "Missions show their branch",
			subline: "",
			notes: "- One",
		})
	})

	it("names the version when the release has no body", () => {
		expect(
			toWhatsNewContent({ version: "0.25.0", body: null, visualUrl: null }),
		).toMatchObject({
			headline: "What’s new in 0.25.0",
			subline: "",
			notes: "",
		})
	})
})
