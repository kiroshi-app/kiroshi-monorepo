import {
	type ComponentType,
	type ReactNode,
	useEffect,
	useSyncExternalStore,
} from "react"
import { flushSync } from "react-dom"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_FINISHED,
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

		const selected = "after the review"
		const selectedFrom = ship.value.indexOf(selected)
		ship.setSelectionRange(
			selectedFrom,
			selectedFrom + selected.length,
			"backward",
		)
		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace("Ship on Monday", "Ship early on Monday"),
		})
		await waitFor(() =>
			expect(ship).toHaveValue(
				"Ship early on Monday the 14th, after the review!",
			),
		)
		await expect(document.activeElement).toBe(ship)
		await expect(ship.selectionStart).toBe(selectedFrom + "early ".length)
		await expect(ship.selectionEnd).toBe(
			selectedFrom + "early ".length + selected.length,
		)
		await expect(ship.selectionDirection).toBe("backward")
		await expect(ship.value.slice(ship.selectionStart, ship.selectionEnd)).toBe(
			selected,
		)
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

export const CaretMoves = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onCaretChange: fn() },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person moves the caret through the body while someone else writes, then leaves it. Check that `onCaretChange` reports each move as an offset in the body markdown, the same coordinates as a writer's start and end, that clicking into a block reports where the caret lands and never where it sat before, that moving to the next block reports the new offset without a null between, that text arriving above the caret reports the shifted offset once and text arriving below reports nothing, and that leaving the body for the title, then for outside the editor, reports null once each time.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const onCaretChange = args.onCaretChange as ReturnType<typeof fn>
		const reported = () => onCaretChange.mock.calls.map(([caret]) => caret)
		const [intro] = bodyFieldsIn(canvasElement) as [HTMLTextAreaElement]
		const introEnd = intro.value.length
		const heading = LAUNCH_REVIEW.body.indexOf("Decisions")

		await userEvent.click(intro)
		await expect(onCaretChange).toHaveBeenLastCalledWith(intro.selectionEnd)
		await userEvent.keyboard("{End}{ArrowLeft}")
		await expect(onCaretChange).toHaveBeenLastCalledWith(introEnd - 1)
		await userEvent.keyboard("{ArrowRight}{ArrowDown}")
		await expect(onCaretChange).toHaveBeenLastCalledWith(heading)
		await expect(reported()).not.toContain(null)

		await userEvent.click(canvas.getByRole("textbox", { name: "Title" }))
		await waitFor(() => expect(onCaretChange).toHaveBeenLastCalledWith(null))

		const beforeReturn = onCaretChange.mock.calls.length
		await userEvent.click(intro)
		await expect(intro.selectionEnd).not.toBe(introEnd)
		await expect(onCaretChange).toHaveBeenLastCalledWith(intro.selectionEnd)
		await expect(reported().slice(beforeReturn)).not.toContain(introEnd)

		const landed = intro.selectionEnd
		const above = "Read this before the meeting.\n\n"
		launchReviewDraft.write({
			body: `${above}${launchReviewDraft.read().body}`,
		})
		await waitFor(() =>
			expect(onCaretChange).toHaveBeenLastCalledWith(landed + above.length),
		)
		const afterAbove = onCaretChange.mock.calls.length
		await expect(reported().slice(beforeReturn)).toEqual([
			landed,
			landed + above.length,
		])

		launchReviewDraft.write({
			body: `${launchReviewDraft.read().body}\n\nOne more line below.`,
		})
		await waitFor(() =>
			expect(bodyFieldsIn(canvasElement).at(-1)).toHaveValue(
				"One more line below.",
			),
		)
		const focused = document.activeElement as HTMLTextAreaElement
		await expect(focused).toHaveValue(intro.value)
		await expect(focused.selectionEnd).toBe(landed)
		await expect(onCaretChange).toHaveBeenCalledTimes(afterAbove)

		focused.blur()
		await waitFor(() => expect(onCaretChange).toHaveBeenLastCalledWith(null))

		const calls = reported()
		await expect(calls.filter((caret) => caret === null)).toHaveLength(2)
		await expect(
			calls.some((caret, index) => index > 0 && caret === calls[index - 1]),
		).toBe(false)
	},
})

const createShownStore = () => {
	let isShown = true
	const listeners = new Set<() => void>()
	return {
		read: () => isShown,
		hide: () => {
			isShown = false
			for (const listener of listeners) listener()
		},
		reset: () => {
			isShown = true
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

const editorShown = createShownStore()

const UnmountableEditor = (args: LibraryDocumentEditorProps) => {
	const isShown = useSyncExternalStore(editorShown.subscribe, editorShown.read)

	return isShown ? <LiveEditor {...args} /> : null
}

export const UnmountedRightAfterBlur = meta.story({
	tags: ["test-only"],
	args: { ...LAUNCH_REVIEW, template: undefined, onCaretChange: fn() },
	beforeEach: () => {
		launchReviewDraft.reset()
		editorShown.reset()
	},
	render: (args) => <UnmountableEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A body field loses focus, which reports the caret on the next tick, then the editor closes before that tick. Check that a blur with the editor still open reports null once, and that a blur followed at once by the unmount never calls `onCaretChange` after the editor is gone.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const onCaretChange = args.onCaretChange as ReturnType<typeof fn>
		const [intro] = bodyFieldsIn(canvasElement) as [HTMLTextAreaElement]

		await userEvent.click(intro)
		await expect(onCaretChange).toHaveBeenLastCalledWith(intro.selectionEnd)
		const beforeBlur = onCaretChange.mock.calls.length
		intro.blur()
		await waitFor(() => expect(onCaretChange).toHaveBeenLastCalledWith(null))
		await expect(onCaretChange).toHaveBeenCalledTimes(beforeBlur + 1)

		await userEvent.click(intro)
		await expect(onCaretChange).toHaveBeenLastCalledWith(intro.selectionEnd)
		const beforeUnmount = onCaretChange.mock.calls.length
		intro.blur()
		flushSync(editorShown.hide)
		await expect(
			canvasElement.querySelector('[data-slot="library-document-editor"]'),
		).toBeNull()

		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(onCaretChange).toHaveBeenCalledTimes(beforeUnmount)
	},
})

const isSameNodes = (
	current: HTMLTextAreaElement[],
	held: HTMLTextAreaElement[],
) =>
	current.length === held.length &&
	current.every((field, index) => field === held[index])

export const FieldsStayInPlace = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person types in the opening paragraph while someone else adds an item before the first one of the Decisions list, then removes the first item twice. Check that every field other than the one added keeps the same element throughout, and that the caret stays in the paragraph being typed, after the last typed character.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const fields = bodyFieldsIn(canvasElement)
		const [intro, decisions, ship, copy, nextSteps, screenshots] = fields
		const typed = " Notes follow."
		const caretStaysInIntro = async () => {
			await expect(document.activeElement).toBe(intro)
			await expect(intro.selectionStart).toBe(intro.value.length)
			await expect(intro.selectionEnd).toBe(intro.value.length)
		}

		await userEvent.type(intro, typed)
		await expect(intro).toHaveValue(
			`We met to agree the launch date and who signs off the copy.${typed}`,
		)
		await caretStaysInIntro()
		await expect(isSameNodes(bodyFieldsIn(canvasElement), fields)).toBe(true)

		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace(
					"- Ship on the 14th",
					"- Book the venue\n- Ship on the 14th",
				),
		})
		await waitFor(() =>
			expect(bodyFieldsIn(canvasElement)[2]).toHaveValue("Book the venue"),
		)
		const [, , venue] = bodyFieldsIn(canvasElement)
		await expect(
			isSameNodes(bodyFieldsIn(canvasElement), [
				intro,
				decisions,
				venue,
				ship,
				copy,
				nextSteps,
				screenshots,
			]),
		).toBe(true)
		await caretStaysInIntro()

		launchReviewDraft.write({
			body: launchReviewDraft.read().body.replace("- Book the venue\n", ""),
		})
		await waitFor(() => expect(bodyFieldsIn(canvasElement)).toHaveLength(6))
		await expect(isSameNodes(bodyFieldsIn(canvasElement), fields)).toBe(true)
		await caretStaysInIntro()

		launchReviewDraft.write({
			body: launchReviewDraft.read().body.replace("- Ship on the 14th\n", ""),
		})
		await waitFor(() => expect(bodyFieldsIn(canvasElement)).toHaveLength(5))
		await expect(
			isSameNodes(bodyFieldsIn(canvasElement), [
				intro,
				decisions,
				copy,
				nextSteps,
				screenshots,
			]),
		).toBe(true)
		await caretStaysInIntro()
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

const LONG_AGENT_DOCUMENT = {
	...LIBRARY_AGENT_DOCUMENT,
	body: [
		LIBRARY_AGENT_DOCUMENT.body,
		"## Open questions",
		...Array.from(
			{ length: 10 },
			(_, index) =>
				`Question ${index + 1}: who reads the weekly number first, and what do they change when it drops?`,
		),
		"The last line of the brief stays above the finished bar.",
	].join("\n\n"),
}

const rectsOverlap = (first: DOMRect, second: DOMRect) =>
	first.left < second.right &&
	second.left < first.right &&
	first.top < second.bottom &&
	second.top < first.bottom

export const AgentFinished = meta.story({
	args: {
		title: LONG_AGENT_DOCUMENT.name,
		body: LONG_AGENT_DOCUMENT.body,
		detail: LONG_AGENT_DOCUMENT.detail,
		template: undefined,
		finished: LIBRARY_FINISHED,
		onUndoAll: fn(),
		onDone: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira done writing in a long document open to edit, as artboard 11 draws it and as `LibraryDocumentView` renders it. Check that the presence pill and the carets are gone, that each added run keeps its agent's colour as plain text, that the finished bar floats centred at the bottom of the column with Undo all and Done, and that the last line of the document clears the bar once scrolled to the end.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvasElement.querySelector("[data-slot='library-document-presence']"),
		).toBe(null)
		await expect(
			canvasElement.querySelector("[data-slot='library-document-caret']"),
		).toBe(null)

		const runs = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-run']",
		)
		await expect([...runs].map((run) => run.textContent)).toEqual([
			"and the agent says why it asks",
			"We also count how often someone stops an agent in its",
		])
		const [atlasRun] = runs
		const drawn = (atlasRun as HTMLElement).closest(
			"[data-slot='library-document-drawn-text']",
		) as HTMLElement
		await expect(getComputedStyle(atlasRun as HTMLElement).color).not.toBe(
			getComputedStyle(drawn).color,
		)
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).toBe("rgba(0, 0, 0, 0)")

		const bar = slotIn(canvasElement, "library-document-finished")
		await expect(bar).toHaveTextContent("Atlas and Mira finished")
		await expect(bar).toHaveTextContent("2 sentences added · 1m 48s")
		await expect(bar.getBoundingClientRect()).toMatchObject({
			width: 640,
			height: 52,
		})

		const fields = bodyFieldsIn(canvasElement)
		const scroller = slotIn(canvasElement, "library-document-body").closest(
			"article",
		)?.parentElement as HTMLElement
		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
		scroller.scrollTop = scroller.scrollHeight
		const lastLine = fields.at(-1) as HTMLTextAreaElement
		await expect(lastLine.value).toBe(
			"The last line of the brief stays above the finished bar.",
		)
		await expect(lastLine.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			bar.getBoundingClientRect().top,
		)

		await userEvent.click(canvas.getByRole("button", { name: "Undo all" }))
		await expect(args.onUndoAll).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Done" }))
		await expect(args.onDone).toHaveBeenCalledOnce()
	},
})

const ATLAS_WRITERS = LIBRARY_WRITERS.slice(0, 1)

const LEA = { id: "lea", name: "Léa Martin", caret: ATLAS_WRITERS[0]?.end ?? 0 }

export const PersonCaretBesideAgent = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: ATLAS_WRITERS,
		people: [LEA],
		finished: LIBRARY_FINISHED,
		onStopAll: fn(),
		onStop: fn(),
		onUndoAll: fn(),
		onDone: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Léa, another member of the Space, has her caret where Atlas is writing, while a finished set of edits is waiting. Check that the finished bar and the tint of the finished runs stay hidden while anyone writes, that the pill counts Atlas alone, that Léa's caret wears the Space colour with a flag holding her round avatar and her name only, hung under the line so neither flag covers the other's name, and that assistive tech reads her name on it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvasElement.querySelector("[data-slot='library-document-finished']"),
		).toBe(null)
		await expect(
			slotIn(canvasElement, "library-document-presence"),
		).toHaveTextContent("1 agent writing")
		const runs = canvasElement.querySelectorAll<HTMLElement>(
			"[data-slot='library-document-run']",
		)
		await expect([...runs].map((run) => run.textContent)).toEqual([
			"and the agent says why it asks",
		])

		const personCaret = canvas.getByRole("img", { name: LEA.name })
		await expect(personCaret.getBoundingClientRect()).toMatchObject({
			width: 2,
			height: 24,
		})
		const personFlag = slotIn(personCaret, "library-document-person-flag")
		await expect(personFlag).toHaveTextContent(LEA.name)
		await expect(personFlag.getBoundingClientRect().height).toBe(20)
		const avatar = slotIn(personFlag, "user-avatar")
		await expect(avatar.getBoundingClientRect().width).toBe(16)
		await expect(getComputedStyle(avatar).borderRadius).not.toBe("0px")
		await expect(personFlag.querySelector("button")).toBe(null)
		await expect(
			canvas.queryByRole("button", { name: new RegExp(LEA.name) }),
		).toBe(null)

		const agentCaret = slotIn(canvasElement, "library-document-caret")
		const agentFlag = screen.getByRole("button", { name: "Atlas is writing" })
		await expect(agentCaret.getBoundingClientRect().top).toBe(
			personCaret.getBoundingClientRect().top,
		)
		await expect(
			rectsOverlap(
				agentFlag.getBoundingClientRect(),
				personFlag.getBoundingClientRect(),
			),
		).toBe(false)
	},
})

type Rgba = [red: number, green: number, blue: number, alpha: number]

const rgbaOf = (color: string): Rgba => {
	const context = document.createElement("canvas").getContext("2d", {
		willReadFrequently: true,
	})
	if (!context) throw new Error("No 2d canvas to read a colour with")
	context.clearRect(0, 0, 1, 1)
	context.fillStyle = color
	context.fillRect(0, 0, 1, 1)
	const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(
		0,
		0,
		1,
		1,
	).data
	return [red, green, blue, alpha / 255]
}

const over = ([red, green, blue, alpha]: Rgba, [r, g, b]: Rgba): Rgba => [
	red * alpha + r * (1 - alpha),
	green * alpha + g * (1 - alpha),
	blue * alpha + b * (1 - alpha),
	1,
]

const luminanceOf = (color: Rgba) => {
	const [red = 0, green = 0, blue = 0] = color
		.slice(0, 3)
		.map((channel) => channel / 255)
		.map((channel) =>
			channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
		)
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastOf = (first: Rgba, second: Rgba) => {
	const [light, dark] = [luminanceOf(first), luminanceOf(second)].sort(
		(a, b) => b - a,
	)
	return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

const groundOf = (element: HTMLElement): Rgba => {
	for (
		let node: HTMLElement | null = element;
		node;
		node = node.parentElement
	) {
		const ground = rgbaOf(getComputedStyle(node).backgroundColor)
		if (ground[3] === 1) return ground
	}
	return rgbaOf("white")
}

const ATLAS_ITEM =
	"Notifications wait for the first finished task, and the agent says why it asks"

type PlayedCanvas = {
	canvasElement: HTMLElement
}

const selectingAcrossAgentRun = (theme: "light" | "dark") => ({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: LIBRARY_WRITERS,
	},
	globals: { theme },
	parameters: {
		docs: {
			description: {
				story: `The person selects text across Atlas's run while Atlas is writing, in the ${theme} theme. The field paints its selection on a translucent ground over the drawn text, so the run, its colour and the text under the selection stay on screen. Check that the selected text reads at 4.5:1 or more against what sits under it, inside and outside the run.`,
			},
		},
	},
	play: async ({ canvasElement }: PlayedCanvas) => {
		const item = bodyFieldsIn(canvasElement).find(
			(field) => field.value === ATLAS_ITEM,
		) as HTMLTextAreaElement
		const runFrom = ATLAS_ITEM.indexOf("and the agent")
		item.focus()
		item.setSelectionRange(runFrom - "task, ".length, ATLAS_ITEM.length)
		await expect(document.activeElement).toBe(item)
		await expect(item.value.slice(item.selectionStart, item.selectionEnd)).toBe(
			"task, and the agent says why it asks",
		)

		const drawn = slotIn(
			item.parentElement as HTMLElement,
			"library-document-drawn-text",
		)
		const run = slotIn(drawn, "library-document-run")
		await expect(run).toHaveTextContent("and the agent says why it asks")
		await expect(getComputedStyle(item).webkitTextFillColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		const selection = rgbaOf(
			getComputedStyle(item, "::selection").backgroundColor,
		)
		await expect(selection[3]).toBeGreaterThan(0)
		await expect(selection[3]).toBeLessThan(1)

		const ground = groundOf(item)
		const runGround = over(
			rgbaOf(getComputedStyle(run).backgroundColor),
			ground,
		)
		const painted = [
			[getComputedStyle(run).color, runGround],
			[getComputedStyle(drawn).color, ground],
		] as const
		for (const [ink, under] of painted)
			await expect(
				contrastOf(
					over(selection, over(rgbaOf(ink), under)),
					over(selection, under),
				),
			).toBeGreaterThanOrEqual(4.5)
	},
})

export const SelectingAcrossAgentRun = meta.story({
	...selectingAcrossAgentRun("dark"),
})

export const SelectingAcrossAgentRunLight = meta.story({
	...selectingAcrossAgentRun("light"),
})

type FailureNoticeProps = {
	entry: "create" | "open" | "save" | "write" | "caret"
}

const DocumentFailureNotice = ({ entry }: FailureNoticeProps) => {
	useEffect(() => {
		const notice = raiseFailureNotice({
			title: i18n.t(`common:library.failure.document.${entry}`, {
				name: LIBRARY_AGENTS.atlas.name,
			}),
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

export const WriteFailure = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
	},
	...failureStory(
		"write",
		"Atlas stopped writing before it finished. Ask again from the conversation.",
		"The notice raised over the open editor when an agent's write broke off before it finished, from `common:library.failure.document.write`, which takes the agent's name. Check that it names the agent and sends the person back to the conversation.",
	),
})

export const CaretShareFailure = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	...failureStory(
		"caret",
		"Couldn’t show others where you are in the document. Keep editing to try again.",
		"The notice raised over the open editor when sharing the person's caret was refused, from `common:library.failure.document.caret`. Check that it names what failed and tells the person to keep editing.",
	),
})
