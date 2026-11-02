import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import { LibraryDocumentEditor } from "@workspace/ui/components/library-document-editor"

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
		template: "blank",
		createdAt: new Date(2026, 10, 2),
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
	args: { template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"A document from Meeting notes, as artboard 5 draws it. Check that the title is dated, that each empty section shows its placeholder under its heading, and that the markdown carries the headings and the typed text but never a placeholder.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
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
