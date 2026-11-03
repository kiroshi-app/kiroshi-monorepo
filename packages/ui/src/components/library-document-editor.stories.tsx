import {
	type ComponentType,
	type ReactNode,
	useEffect,
	useSyncExternalStore,
} from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_WRITERS,
} from "@workspace/ui/components/library.fixtures"
import {
	LibraryDocumentEditor,
	type LibraryDocumentEditorProps,
	libraryDocumentStartOf,
} from "@workspace/ui/components/library-document-editor"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
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

type EditorFrameProps = {
	children?: ReactNode
}

const EditorFrame = ({ children }: EditorFrameProps) => (
	<div
		className="flex h-[832px] w-[1280px] bg-background ps-15 pe-1.5 pt-2 pb-2"
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

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
		<EditorFrame>
			<LibraryDocumentEditor {...args} />
		</EditorFrame>
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

type DocumentDraft = {
	title: string
	body: string
}

const createDraftStore = (start: DocumentDraft) => {
	let draft = start
	const listeners = new Set<() => void>()
	return {
		read: () => draft,
		write: (change: Partial<DocumentDraft>) => {
			draft = { ...draft, ...change }
			for (const listener of listeners) listener()
		},
		reset: () => {
			draft = start
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

const launchReviewDraft = createDraftStore(LAUNCH_REVIEW)

const LiveEditor = (args: LibraryDocumentEditorProps) => {
	const { title, body } = useSyncExternalStore(
		launchReviewDraft.subscribe,
		launchReviewDraft.read,
	)

	return (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				body={body}
				onBodyChange={(next) => {
					launchReviewDraft.write({ body: next })
					args.onBodyChange(next)
				}}
				onTitleChange={(next) => {
					launchReviewDraft.write({ title: next })
					args.onTitleChange(next)
				}}
				title={title}
			/>
		</EditorFrame>
	)
}

const bodyFieldsIn = (canvasElement: HTMLElement) =>
	within(slotIn(canvasElement, "library-document-body")).getAllByRole(
		"textbox",
	) as HTMLTextAreaElement[]

const textBeforeCaret = (field: HTMLTextAreaElement) =>
	field.value.slice(0, field.selectionStart)

export const OutsideChangeWhileTyping = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Someone else writes in the document while the person types, the body arriving through the same prop the editor reports to. The story types in a list item, then lands a change in a later paragraph and a word before the caret in the item being typed. Check that the focused field stays the same element, that the caret stays after the same character of the person's text, that typing goes on where it stopped, and that neither outside change nor the echo of the person's own edits is reported back through `onBodyChange`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const editor = slotIn(canvasElement, "library-document-editor")
		const fields = bodyFieldsIn(canvasElement)
		const ship = fields[2] as HTMLTextAreaElement
		const screenshots = fields[5] as HTMLTextAreaElement
		const typed = ", after the review"

		await userEvent.type(ship, typed)
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typed.length)
		await expect(document.activeElement).toBe(ship)
		const caret = ship.selectionStart
		await expect(caret).toBe(ship.value.length)

		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace(
					"Screenshots land on the 10th.",
					"Screenshots land on the 10th, the release notes on the 12th.",
				),
		})
		await waitFor(() =>
			expect(screenshots).toHaveValue(
				"Screenshots land on the 10th, the release notes on the 12th.",
			),
		)
		await expect(document.activeElement).toBe(ship)
		await expect(ship.selectionStart).toBe(caret)
		await expect(ship.selectionEnd).toBe(caret)

		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace("Ship on the 14th", "Ship on Monday the 14th"),
		})
		await waitFor(() =>
			expect(ship).toHaveValue("Ship on Monday the 14th, after the review"),
		)
		await expect(document.activeElement).toBe(ship)
		await expect(textBeforeCaret(ship)).toBe(
			"Ship on Monday the 14th, after the review",
		)
		await expect(ship.selectionStart).toBe(caret + "Monday ".length)
		await expect(ship.selectionEnd).toBe(ship.selectionStart)
		await expect(bodyFieldsIn(canvasElement)).toEqual(fields)
		await expect(slotIn(canvasElement, "library-document-editor")).toBe(editor)
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typed.length)

		await userEvent.keyboard("!")
		await expect(ship).toHaveValue("Ship on Monday the 14th, after the review!")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			launchReviewDraft.read().body,
		)
		await expect(launchReviewDraft.read().body).toContain(
			"- Ship on Monday the 14th, after the review!",
		)
		await expect(launchReviewDraft.read().body).toContain(
			"Screenshots land on the 10th, the release notes on the 12th.",
		)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})

export const OutsideTitleChange = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Someone else renames the document while the person types in its title. Check that the field and the breadcrumb show the new title without the editor remounting, that the caret stays after the same character of the person's text, and that the rename is never reported back through `onTitleChange`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = canvas.getByRole("textbox", {
			name: "Title",
		}) as HTMLTextAreaElement
		const typed = " notes"

		await userEvent.type(title, typed)
		await expect(args.onTitleChange).toHaveBeenCalledTimes(typed.length)
		await expect(title.selectionStart).toBe("Launch review notes".length)

		launchReviewDraft.write({ title: "Spring launch review notes" })
		await waitFor(() => expect(title).toHaveValue("Spring launch review notes"))
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent(
			"Spring launch review notes",
		)
		await expect(canvas.getByRole("textbox", { name: "Title" })).toBe(title)
		await expect(document.activeElement).toBe(title)
		await expect(textBeforeCaret(title)).toBe("Spring launch review notes")
		await expect(args.onTitleChange).toHaveBeenCalledTimes(typed.length)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const AgentsWriting = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: LIBRARY_WRITERS,
		onStopAll: fn(),
		onStop: fn(),
		onOpenConversation: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira writing in the document while the person has it open to edit, as artboard 10 draws it and as `LibraryDocumentView` renders it. Check that the presence pill counts the writers and reports Stop all, that each added run and its named caret paint in the agent's own colour over the text it covers, that the hover card reports Stop Mira and Open conversation, and that every block, the written ones included, still takes the person's typing.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
		await userEvent.click(canvas.getByRole("button", { name: "Stop all" }))
		await expect(args.onStopAll).toHaveBeenCalledOnce()

		const runs = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-run']",
		)
		const [atlasRun, miraRun] = runs
		await expect([...runs].map((run) => run.textContent)).toEqual([
			"and the agent says why it asks",
			"We also count how often someone stops an agent in its",
		])
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).not.toBe(getComputedStyle(miraRun as HTMLElement).backgroundColor)
		await expect((miraRun as HTMLElement).getBoundingClientRect().height).toBe(
			24,
		)
		const carets = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-caret']",
		)
		await expect(carets).toHaveLength(2)
		await expect(
			(carets[0] as HTMLElement).getBoundingClientRect(),
		).toMatchObject({
			width: 2,
			height: 24,
		})

		const fields = bodyFieldsIn(canvasElement)
		const written = fields.filter((field) =>
			field.parentElement?.querySelector(
				"[data-slot='library-document-drawn-text']",
			),
		)
		await expect(written.map((field) => field.value)).toEqual([
			"Notifications wait for the first finished task, and the agent says why it asks",
			"We also count how often someone stops an agent in its",
		])
		await expect(
			getComputedStyle(written[1] as HTMLElement).webkitTextFillColor,
		).toBe("rgba(0, 0, 0, 0)")
		await expect(
			getComputedStyle(fields[0] as HTMLElement).webkitTextFillColor,
		).not.toBe("rgba(0, 0, 0, 0)")
		for (const field of fields) await expect(field).toBeEnabled()
		await expect(fields.some((field) => field.readOnly)).toBe(false)

		const flag = screen.getByRole("button", { name: "Mira is writing" })
		await expect(flag).toHaveTextContent("Mira")
		await expect(flag.getBoundingClientRect().height).toBe(20)
		await userEvent.hover(flag)
		const card = await screen.findByRole("dialog", {
			name: "Mira is writing…",
		})
		await expect(card).toHaveAttribute(
			"data-hue",
			String(LIBRARY_AGENTS.mira.hue),
		)
		await expect(card).toHaveTextContent(
			"1 sentence added to “What we measure”",
		)
		await userEvent.click(screen.getByRole("button", { name: "Stop Mira" }))
		await expect(args.onStop).toHaveBeenCalledWith(LIBRARY_AGENTS.mira)
		await userEvent.click(
			screen.getByRole("button", { name: "Open conversation" }),
		)
		await expect(args.onOpenConversation).toHaveBeenCalledWith(
			LIBRARY_AGENTS.mira,
		)

		await userEvent.type(written[1] as HTMLElement, " tracks")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			LIBRARY_AGENT_DOCUMENT.body.replace(
				"stops an agent in its",
				"stops an agent in its tracks",
			),
		)
	},
})

type FailureNoticeProps = {
	entry: "create" | "open" | "save"
}

const DocumentFailureNotice = ({ entry }: FailureNoticeProps) => {
	useEffect(() => {
		const notice = raiseFailureNotice({
			title: i18n.t(`common:library.failure.document.${entry}`),
		})
		return () => endNotice(notice)
	}, [entry])

	return <NoticeSurface />
}

const failureStory = (
	entry: FailureNoticeProps["entry"],
	title: string,
	story: string,
) => ({
	decorators: [
		(Story: ComponentType) => (
			<>
				<Story />
				<DocumentFailureNotice entry={entry} />
			</>
		),
	],
	parameters: { docs: { description: { story } } },
	play: async () => {
		const shown = await waitFor(() => slotIn(document.body, "toast-title"))
		await expect(shown).toHaveTextContent(title)
	},
})

export const CreateFailure = meta.story({
	render: () => <EditorFrame />,
	...failureStory(
		"create",
		"Couldn’t create the document. Try again from New document.",
		"The notice raised when a new document could not be created on the host of its Space, from `common:library.failure.document.create`. Check that it names what failed and sends the person back to New document.",
	),
})

export const OpenFailure = meta.story({
	render: () => <EditorFrame />,
	...failureStory(
		"open",
		"Couldn’t open the document. Open it again from the Library.",
		"The notice raised when a Library document could not be opened, from `common:library.failure.document.open`. Check that it names what failed and sends the person back to the Library.",
	),
})

export const SaveFailure = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	...failureStory(
		"save",
		"Couldn’t save your last changes. Keep the document open and edit again to retry.",
		"The notice raised over the open editor when the last edits did not reach the host, from `common:library.failure.document.save`. Check that it names what failed and tells the person to keep the document open and edit again.",
	),
})
