import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LibraryDocumentEditor,
	libraryDocumentStartOf,
} from "@workspace/ui/components/library-document-editor"
import { i18n } from "@workspace/ui/lib/i18n"

const t = i18n.getFixedT("en", "common")

const CREATED_ON = new Date(2026, 10, 2)

const BLANK = libraryDocumentStartOf("blank", CREATED_ON, t)

const MEETING_NOTES = libraryDocumentStartOf("meetingNotes", CREATED_ON, t)

const LAUNCH_REVIEW = {
	title: "Launch review",
	detail: "38 words · Edited today at 10:41",
	body: [
		"We met to agree the launch date and who signs off the copy.",
		"## Decisions",
		"- Ship on the 14th\n- Copy is final on the 7th",
		"## Next steps",
		"Screenshots land on the 10th.",
	].join("\n\n"),
}

const PLACEHOLDER_INK = "rgb(115, 115, 115)"

const TITLE_PLACEHOLDER_INK = "rgb(82, 82, 82)"

const placeholderInkOf = (field: HTMLElement) =>
	getComputedStyle(field, "::placeholder").color

const breadcrumbIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector('[aria-current="page"]') as HTMLElement

const meta = preview.meta({
	title: "Navigation/LibraryDocumentEditor",
	component: LibraryDocumentEditor,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A new document, written in place of the read-only view: same bar, same 640 column, same type. The title leaves as a string through `onTitleChange` and the body as markdown through `onBodyChange`; # then a space starts a heading, - then a space a list item. Placeholders are drawn, never written into the markdown.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		...BLANK,
		template: "blank" as const,
		onTitleChange: fn(),
		onBodyChange: fn(),
		onBack: fn(),
		onMore: fn(),
	},
	render: (args) => (
		<div
			className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
			{...hueScopeOf("blue")}
		>
			<ContentCard isLandmark={false}>
				<LibraryDocumentEditor {...args} />
			</ContentCard>
		</div>
	),
})

export const Blank = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A blank document, as artboard 4 draws it. Check that the empty title reads Untitled in the field and in the breadcrumb, that the body shows its one placeholder line, and that clearing what was typed brings both back and reports empty values.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = canvas.getByRole("textbox", { name: "Title" })
		const body = canvas.getByRole("textbox", { name: "Text" })
		await expect(title).toHaveAttribute("placeholder", "Untitled")
		await expect(placeholderInkOf(title)).toBe(TITLE_PLACEHOLDER_INK)
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")
		await expect(canvas.getByText("Created just now")).toBeVisible()
		await expect(body).toHaveAttribute(
			"placeholder",
			"Start writing. Use # for a heading and - for a list.",
		)
		await expect(placeholderInkOf(body)).toBe(PLACEHOLDER_INK)
		await expect(getComputedStyle(body).fontSize).toBe("15px")
		await expect(getComputedStyle(body).lineHeight).toBe("24px")

		await userEvent.type(title, "Q")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Q")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Q")
		await userEvent.type(title, "{Backspace}")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")

		await userEvent.type(body, "Hi")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith("Hi")
		await userEvent.clear(body)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith("")
		await expect(body).toHaveValue("")
	},
})

export const FromMeetingNotes = meta.story({
	args: { ...MEETING_NOTES, template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"A document from Meeting notes, as artboard 5 draws it. Check that the title is dated, that each empty section shows its placeholder under its heading, and that the markdown carries the headings and the typed text but never a placeholder.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(MEETING_NOTES).toEqual({
			title: "Meeting notes, 2 November",
			body: "## Decisions\n\n## Next steps",
			detail: "Created just now from Meeting notes",
		})
		const title = canvas.getByRole("textbox", { name: "Title" })
		await expect(title).toHaveValue("Meeting notes, 2 November")
		await expect(
			canvas.getByText("Created just now from Meeting notes"),
		).toBeVisible()

		const body = within(slotIn(canvasElement, "library-document-body"))
		const fields = body.getAllByRole("textbox")
		await expect(
			fields.map(
				(field) =>
					(field as HTMLTextAreaElement).value ||
					field.getAttribute("placeholder"),
			),
		).toEqual([
			"Who was there, and what the meeting was for.",
			"Decisions",
			"One line per decision, with the reason behind it.",
			"Next steps",
			"Who does what, and by when.",
		])
		const heading = body.getAllByRole("textbox", { name: "Heading" })[0]
		await expect(getComputedStyle(heading as HTMLElement).fontSize).toBe("17px")
		await expect(getComputedStyle(heading as HTMLElement).lineHeight).toBe(
			"24px",
		)
		await expect(getComputedStyle(heading as HTMLElement).fontWeight).toBe(
			"600",
		)

		await userEvent.type(title, "!")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Meeting notes, 2 November!",
		)
		await userEvent.type(title, "{Backspace}")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Meeting notes, 2 November",
		)

		const decisions = fields[2] as HTMLElement
		await userEvent.type(decisions, "Ship")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"## Decisions\n\nShip\n\n## Next steps",
		)
		await userEvent.clear(decisions)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"## Decisions\n\n## Next steps",
		)
		await expect(decisions).toHaveAttribute(
			"placeholder",
			"One line per decision, with the reason behind it.",
		)
	},
})

export const WithTypedText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A blank document once written in. Check that # then a space turns a line into a heading, that - then a space turns it into a list item, and that the markdown reported follows what the page shows.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.type(
			canvas.getByRole("textbox", { name: "Title" }),
			"Launch review",
		)
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Launch review")

		await userEvent.type(
			canvas.getByRole("textbox", { name: "Text" }),
			"We agreed the date.{Enter}# Decisions{Enter}- Ship on the 14th{Enter}Copy is final on the 7th",
		)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"We agreed the date.\n\n## Decisions\n\n- Ship on the 14th\n- Copy is final on the 7th",
		)
		await expect(canvas.getByRole("textbox", { name: "Heading" })).toHaveValue(
			"Decisions",
		)
		const items = within(canvas.getByRole("list")).getAllByRole("textbox", {
			name: "List item",
		})
		await expect(
			items.map((item) => (item as HTMLTextAreaElement).value),
		).toEqual(["Ship on the 14th", "Copy is final on the 7th"])
	},
})

export const ExistingDocument = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A Library document opened to edit, from its title and its markdown. Check that each heading, paragraph and list item lands in its own line, that nothing is reported before the first edit, and that undoing an edit reports the body it opened on.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Launch review",
		)
		await expect(canvas.getByText(LAUNCH_REVIEW.detail)).toBeVisible()
		const fields = within(
			slotIn(canvasElement, "library-document-body"),
		).getAllByRole("textbox")
		await expect(
			fields.map((field) => [
				field.getAttribute("aria-label"),
				(field as HTMLTextAreaElement).value,
			]),
		).toEqual([
			["Text", "We met to agree the launch date and who signs off the copy."],
			["Heading", "Decisions"],
			["List item", "Ship on the 14th"],
			["List item", "Copy is final on the 7th"],
			["Heading", "Next steps"],
			["Text", "Screenshots land on the 10th."],
		])
		await expect(args.onTitleChange).not.toHaveBeenCalled()
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		const ship = fields[2] as HTMLElement
		await userEvent.type(ship, ", after the review")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			LAUNCH_REVIEW.body.replace(
				"Ship on the 14th",
				"Ship on the 14th, after the review",
			),
		)
		await userEvent.type(
			ship,
			"{Backspace}".repeat(", after the review".length),
		)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(LAUNCH_REVIEW.body)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})
