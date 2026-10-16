import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ReleaseNotes } from "@workspace/ui/components/release-notes"
import { GIT_CLIFF_BODY_0_24_2 } from "@workspace/ui/components/release-notes.fixtures"

const meta = preview.meta({
	title: "Feedback/ReleaseNotes",
	component: ReleaseNotes,
	parameters: {
		docs: {
			description: {
				component:
					"The one rendering of a GitHub release body, shared by the Update ready panel and the What's new dialog. It reads the body as markdown: a `###` heading becomes a section label over its entries, each `- ` line one bullet, `**scope**` bold, and a body with no markdown stays readable line by line. `xs` is the muted size of the panel, `sm` the foreground size of the dialog.",
			},
		},
	},
	args: { body: GIT_CLIFF_BODY_0_24_2, size: "xs" as const },
	argTypes: {
		size: { control: "inline-radio", options: ["xs", "sm"] },
	},
})

export const GitCliffBody = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The real git-cliff body of 0.24.2 at the panel's muted xs size. Check each heading reads as a label with no `#`, each entry as one bullet with its scope bold and no asterisk, and `(OPE-NN)` as plain text.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const label = canvas.getByRole("heading", { level: 3, name: "Features" })

		await expect(label.nextElementSibling?.tagName).toBe("UL")
		await expect(
			canvas.getAllByText("ui", { selector: "strong" }).length,
		).toBeGreaterThan(0)
		await expect(canvas.getAllByRole("listitem")).toHaveLength(35)
		await expect(canvas.queryByRole("link")).toBeNull()
		await expect(canvasElement.textContent).not.toMatch(/\*\*|#/)
	},
})

export const GitCliffBodySmall = meta.story({
	args: { size: "sm" },
	parameters: {
		docs: {
			description: {
				story:
					"The same body at the What's new dialog's foreground sm size, its section labels staying at xs.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { level: 3, name: "Fixes" }),
		).toBeVisible()
	},
})

export const PlainText = meta.story({
	args: {
		body: "Faster launches.\nThe sidebar keeps its width.\nSee the assets to download this version and install.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A fallback body with no markdown, a tag message or the release workflow's line. Check each line stays on its own line and nothing turns into a list.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("list")).toBeNull()
		await expect(
			canvas.getByText(/The sidebar keeps its width\./),
		).toBeVisible()
	},
})

export const RepeatedLines = meta.story({
	args: { body: "- **app**: fix the sidebar\n- **app**: fix the sidebar" },
	parameters: {
		docs: {
			description: {
				story:
					"Two identical entries, which a changelog can carry. Check both are drawn.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("listitem")).toHaveLength(2)
	},
})
