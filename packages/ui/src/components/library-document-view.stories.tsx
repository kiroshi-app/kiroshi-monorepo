import { expect, fn, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	type LibraryDocument,
	LibraryDocumentView,
} from "@workspace/ui/components/library-document-view"

const SPRING_BRIEF: LibraryDocument = {
	id: "brief",
	name: "Spring launch brief",
	detail: "1,240 words · Edited today at 10:41",
	body: [
		"The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats, so the copy, the screenshots and the release notes say the same thing.",
		"## Audience",
		"Teams of five to twenty who already keep their notes and references in a shared folder, and lose them there. They don't want another tool; they want the folder to stop forgetting.",
		"## Messages",
		"- Everything the Space holds, in one place.\n- Images and documents side by side, searchable by name.\n- Nothing to set up: drop files in and they're there.",
		"## Timeline",
		"Copy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.",
	].join("\n\n"),
}

const meta = preview.meta({
	title: "Navigation/LibraryDocumentView",
	component: LibraryDocumentView,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"One document of the Library, read-only, in place of the grid. The bar carries the breadcrumb back to the Library and a More button that only reports the document to `onMore`; the body is the document's markdown, rendered by the repo renderer in a 640 wide column.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		document: SPRING_BRIEF,
		onBack: fn(),
		onMore: fn(),
	},
	render: (args) => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryDocumentView {...args} />
			</ContentCard>
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A document open from the Library, as artboard 9 draws it. Check that Library in the breadcrumb calls `onBack`, that More names itself in a tooltip and reports the document, and that the body keeps 15/24 paragraphs with 17/24 headings.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Library" }))
		await expect(args.onBack).toHaveBeenCalledOnce()

		const more = canvas.getByRole("button", { name: "More" })
		await userEvent.hover(more)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("More")
		await userEvent.click(more)
		await expect(args.onMore).toHaveBeenCalledWith(SPRING_BRIEF)

		const body = slotIn(canvasElement, "markdown")
		const paragraph = body.querySelector("p") as HTMLElement
		const heading = body.querySelector("h2") as HTMLElement
		await expect(getComputedStyle(paragraph).fontSize).toBe("15px")
		await expect(getComputedStyle(paragraph).lineHeight).toBe("24px")
		await expect(getComputedStyle(heading).fontSize).toBe("17px")
		await expect(getComputedStyle(heading).lineHeight).toBe("24px")
		await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
			"Spring launch brief",
		)
	},
})
