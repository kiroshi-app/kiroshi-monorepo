import { syntaxTree } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import {
	type ComponentType,
	createRef,
	type ReactNode,
	type RefObject,
	useEffect,
	useSyncExternalStore,
} from "react"
import { expect, fn, screen, spyOn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_FINISHED,
	LIBRARY_WRITERS,
} from "@workspace/ui/components/library.fixtures"
import {
	LibraryDocumentEditor,
	type LibraryDocumentEditorHandle,
	type LibraryDocumentEditorProps,
	type LibraryDocumentRange,
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

const ROUND_TRIP = [
	"# Launch plan",
	"## Decisions",
	"### Owners",
	"",
	"- Ship on the **14th**",
	"- Copy is *final* on the 7th",
	"",
	"1. Draft the notes",
	"2. Review with ~~legal~~ design",
	"",
	"- [ ] Book the room",
	"- [x] Send the invite",
	"",
	"> Keep the launch quiet until the 14th.",
	"",
	"```ts",
	"const launch = await ship()",
	"```",
	"",
	"Read the `brief` and the [press kit](https://kiroshi.app/press).",
	"",
].join("\n")

const PLACEHOLDER_INK = "rgb(115, 115, 115)"

const TITLE_PLACEHOLDER_INK = "rgb(82, 82, 82)"

const COMMAND = navigator.userAgent.includes("Mac") ? "Meta" : "Control"

const bodyIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "library-document-body")

const viewIn = (canvasElement: HTMLElement) => {
	const view = EditorView.findFromDOM(
		bodyIn(canvasElement).closest<HTMLElement>(".cm-editor") as HTMLElement,
	)
	if (!view) throw new Error("No editor")
	return view
}

const textIn = (canvasElement: HTMLElement) =>
	viewIn(canvasElement).state.doc.toString()

const selectRange = (canvasElement: HTMLElement, from: number, to = from) => {
	const view = viewIn(canvasElement)
	view.focus()
	view.dispatch({ selection: { anchor: from, head: to } })
}

const selectText = (canvasElement: HTMLElement, text: string, from = 0) => {
	const start = textIn(canvasElement).indexOf(text, from)
	if (start === -1) throw new Error(`No ${text} in the body`)
	selectRange(canvasElement, start, start + text.length)
	return start
}

const caretAfter = (canvasElement: HTMLElement, text: string) => {
	const start = textIn(canvasElement).indexOf(text)
	selectRange(canvasElement, start + text.length)
}

const selectedTextIn = (canvasElement: HTMLElement) => {
	const { state } = viewIn(canvasElement)
	const { from, to } = state.selection.main
	return state.sliceDoc(from, to)
}

const lineAt = (canvasElement: HTMLElement, number: number) => {
	const view = viewIn(canvasElement)
	const { node } = view.domAtPos(view.state.doc.line(number).from)
	const line = (
		node instanceof Element ? node : node.parentElement
	)?.closest<HTMLElement>(".cm-line")
	if (!line) throw new Error(`No line ${number}`)
	return line
}

const linesIn = (canvasElement: HTMLElement) =>
	[...bodyIn(canvasElement).querySelectorAll<HTMLElement>(".cm-line")].map(
		(line) => line.textContent,
	)

const keyboard = async (keys: string) => (await realPointer()).keyboard(keys)

const pressWithCommand = (keys: string) =>
	keyboard(`{${COMMAND}>}${keys}{/${COMMAND}}`)

const breadcrumbIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector('[aria-current="page"]') as HTMLElement

const placeholdersIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-placeholder").map(
		(shown) => shown.dataset.placeholder,
	)

const BLANK_PLACEHOLDER = "Start writing. Use # for a heading and - for a list."

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

type DraftStore = ReturnType<typeof createDraftStore>

const launchReviewDraft = createDraftStore(LAUNCH_REVIEW)

const boldOn =
	(draft: DraftStore) =>
	({ start, end }: LibraryDocumentRange) => {
		const { body } = draft.read()
		draft.write({
			body: `${body.slice(0, start)}**${body.slice(start, end)}**${body.slice(end)}`,
		})
	}

type LiveEditorProps = LibraryDocumentEditorProps & {
	draft: DraftStore
}

const LiveEditor = ({ draft, ...args }: LiveEditorProps) => {
	const { title, body } = useSyncExternalStore(draft.subscribe, draft.read)

	return (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				body={body}
				onBodyChange={(next) => {
					draft.write({ body: next })
					args.onBodyChange(next)
				}}
				onTitleChange={(next) => {
					draft.write({ title: next })
					args.onTitleChange(next)
				}}
				title={title}
			/>
		</EditorFrame>
	)
}

const meta = preview.meta({
	title: "Navigation/LibraryDocumentEditor",
	component: LibraryDocumentEditor,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A Library document written in place of the read-only view: same bar, same 640 column, same type. The body is one CodeMirror document whose text is the markdown string, shown as a live preview: every heading, list, task, quote, fence and inline format renders styled with its markers hidden, and shows its markers as plain text while the caret or the selection sits in it. The title leaves as a string through `onTitleChange` and the body as markdown through `onBodyChange`; placeholders are drawn, never written into the markdown.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		...BLANK,
		template: "blank" as const,
		onTitleChange: fn(),
		onTitleConfirm: fn(),
		onBodyChange: fn(),
		onBack: fn(),
		onShowInFolder: fn(),
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
					"A blank document, as artboard 4 draws it. Check that the empty title reads Untitled in the field and in the breadcrumb, that the body is a named multi-line textbox in the reading type showing its one placeholder line, that focus draws no outline and no ring around it, the caret being its only signal, with no colour transition, and that clearing what was typed brings the placeholder back and reports an empty body.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = canvas.getByRole("textbox", { name: "Title" })
		const body = canvas.getByRole("textbox", { name: "Document text" })
		await expect(body).toBe(bodyIn(canvasElement))
		await expect(body).toHaveAttribute("aria-multiline", "true")
		await expect(title).toHaveAttribute("placeholder", "Untitled")
		await expect(getComputedStyle(title, "::placeholder").color).toBe(
			TITLE_PLACEHOLDER_INK,
		)
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")
		await expect(canvas.getByText("Created just now")).toBeVisible()
		await expect(placeholdersIn(canvasElement)).toEqual([BLANK_PLACEHOLDER])
		await expect(
			getComputedStyle(
				slotIn(canvasElement, "library-document-placeholder"),
				"::before",
			).color,
		).toBe(PLACEHOLDER_INK)
		await expect(getComputedStyle(body).fontSize).toBe("15px")
		await expect(getComputedStyle(body).lineHeight).toBe("24px")
		await expect(getComputedStyle(body).transitionProperty).toBe("none")

		await userEvent.type(title, "Q")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Q")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Q")
		await userEvent.type(title, "{Backspace}")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")

		selectRange(canvasElement, 0)
		const editor = body.closest(".cm-editor") as HTMLElement
		await waitFor(() => expect(editor).toHaveClass("cm-focused"))
		for (const focused of [editor, body]) {
			await expect(getComputedStyle(focused).outlineStyle).toBe("none")
			await expect(getComputedStyle(focused).boxShadow).toBe("none")
		}
		if (!isInBrowserRunner()) return
		await keyboard("Hi")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith("Hi")
		await expect(title).toHaveValue("")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("")
		await keyboard("{Backspace}{Backspace}")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith("")
		await expect(placeholdersIn(canvasElement)).toEqual([BLANK_PLACEHOLDER])
	},
})

const titleHandle = createRef<LibraryDocumentEditorHandle>()

const titleIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole<HTMLTextAreaElement>("textbox", {
		name: "Title",
	})

const titleLookOf = (element: Element) => {
	const style = getComputedStyle(element)
	return {
		fontFamily: style.fontFamily,
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		lineHeight: style.lineHeight,
		color: style.color,
	}
}

const pressComposing = (field: HTMLElement, key: string) =>
	field.dispatchEvent(
		new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true }),
	)

export const TitleAtRest = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The title of an open document, before any edit. Check that it reads the document title in the heading type, with no field border, no outline and no fill, and that nothing is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const title = titleIn(canvasElement)
		await expect(title).toHaveValue("Launch review")
		await expect(title).not.toHaveFocus()
		await expect(titleLookOf(title)).toEqual(
			titleLookOf(title.parentElement as HTMLElement),
		)
		await expect(titleLookOf(title)).toMatchObject({
			fontSize: "28px",
			fontWeight: "600",
			lineHeight: "34px",
		})
		await expect(getComputedStyle(title).borderTopWidth).toBe("0px")
		await expect(getComputedStyle(title).outlineStyle).toBe("none")
		await expect(getComputedStyle(title).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})

export const TitleFocusedByRename = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	render: (args) => (
		<EditorFrame>
			<LibraryDocumentEditor {...args} ref={titleHandle} />
		</EditorFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The app calls `focusTitle()` on the editor handle, as Rename does. Check that the title takes the focus with the caret collapsed after its last character, that its type, size, colour and bare edges stay those of the title at rest, and that typing goes on from there.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		const atRest = titleLookOf(title)

		titleHandle.current?.focusTitle()
		await expect(title).toHaveFocus()
		await expect(title.selectionStart).toBe("Launch review".length)
		await expect(title.selectionEnd).toBe("Launch review".length)
		await expect(titleLookOf(title)).toEqual(atRest)
		await expect(getComputedStyle(title).borderTopWidth).toBe("0px")
		await expect(getComputedStyle(title).outlineStyle).toBe("none")

		await userEvent.keyboard(" v2")
		await expect(title).toHaveValue("Launch review v2")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2",
		)
	},
})

const renameHandle = createRef<LibraryDocumentEditorHandle>()

const titleFieldOf =
	(handle: RefObject<LibraryDocumentEditorHandle | null>) => () =>
		handle.current?.titleField() ?? false

export const RenameFocusesTitleFromHandle = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onRename: fn() },
	render: (args) => (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				menuFinalFocus={titleFieldOf(renameHandle)}
				ref={renameHandle}
			/>
		</EditorFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Rename picked from More while `menuFinalFocus` returns the handle's `titleField()`, as the app wires it. Check that the title holds focus once the menu closes and that More does not.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(titleFieldOf(createRef())()).toBe(false)
		const title = titleIn(canvasElement)
		await expect(renameHandle.current?.titleField()).toBe(title)

		const more = canvas.getByRole("button", { name: "More" })
		await userEvent.click(more)
		const menu = await screen.findByRole("menu")
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		)
		await expect(args.onRename).toHaveBeenCalledOnce()
		await waitFor(() => expect(title).toHaveFocus())
		await expect(more).not.toHaveFocus()
	},
})

export const TitleEnterMovesToBody = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Enter in an edited title. Check that Enter during an IME composition leaves the caret in the title and confirms nothing, and that Enter otherwise keeps the edited title, confirms its trimmed name once through `onTitleConfirm`, never again from the blur that follows, and moves the caret to the start of the body.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		await userEvent.type(title, " v2 ")
		pressComposing(title, "Enter")
		await expect(title).toHaveFocus()
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")
		await expect(bodyIn(canvasElement)).toHaveFocus()
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
		await expect(viewIn(canvasElement).state.selection.main).toMatchObject({
			from: 0,
			to: 0,
		})
		await expect(title).toHaveValue("Launch review v2 ")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2 ",
		)
	},
})

export const TitleEscapeRestores = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Escape in an edited title. Check that Escape during an IME composition changes nothing, and that Escape otherwise brings back the title held when the edit started, reports it through `onTitleChange`, leaves the field and confirms nothing through `onTitleConfirm`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)

		await userEvent.type(title, " v2")
		pressComposing(title, "Escape")
		await expect(title).toHaveFocus()
		await expect(title).toHaveValue("Launch review v2")

		await userEvent.keyboard("{Escape}")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")
		await expect(title).not.toHaveFocus()
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()
	},
})

export const TitleClickAwayKeeps = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"An edited title left by a click in the body. Check that the edited title stays, that leaving reports nothing more through `onTitleChange`, and that it confirms the name once through `onTitleConfirm`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		const intro = lineAt(canvasElement, 1)

		await userEvent.type(title, " v2")
		const reportedWhileTyping = (args.onTitleChange as ReturnType<typeof fn>)
			.mock.calls.length
		await userEvent.click(intro)
		await expect(title).not.toHaveFocus()
		await expect(title).toHaveValue("Launch review v2")
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2",
		)
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
	},
})

export const TitleEmptiedRestores = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A titled document whose title is cleared to spaces, then left. Check that leaving brings back the title held when the edit started and reports it through `onTitleChange`, and that Enter or leaving confirms nothing through `onTitleConfirm`. A document that starts untitled keeps its empty title: see Blank.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		const intro = lineAt(canvasElement, 1)

		await userEvent.clear(title)
		await userEvent.type(title, "   ")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("   ")
		await userEvent.keyboard("{Enter}")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")

		await userEvent.clear(title)
		await userEvent.type(title, "   ")
		await userEvent.click(intro)
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()
	},
})

const refusedRenameHandle = createRef<LibraryDocumentEditorHandle>()

const refusedRenameDraft = createDraftStore(LAUNCH_REVIEW)

const RefusingRenameEditor = (args: LibraryDocumentEditorProps) => {
	const { title } = useSyncExternalStore(
		refusedRenameDraft.subscribe,
		refusedRenameDraft.read,
	)

	return (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				ref={refusedRenameHandle}
				title={title}
			/>
		</EditorFrame>
	)
}

export const TitleRestoredAfterRefusedRename = meta.story({
	args: {
		...LAUNCH_REVIEW,
		template: undefined,
		onTitleConfirm: fn(() =>
			refusedRenameHandle.current?.restoreTitle(LAUNCH_REVIEW.title),
		),
	},
	beforeEach: refusedRenameDraft.reset,
	render: (args) => <RefusingRenameEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A rename the app refuses: it calls `restoreTitle()` on the editor handle with the old name, equal to the title it still passes. Check that the field shows the old name again without reporting it through `onTitleChange` or `onTitleConfirm`, and that a title passed afterwards is shown.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)

		await userEvent.type(title, " v2")
		const reportedWhileTyping = (args.onTitleChange as ReturnType<typeof fn>)
			.mock.calls.length
		await userEvent.keyboard("{Enter}")
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)

		refusedRenameDraft.write({ title: "Spring launch review" })
		await waitFor(() => expect(title).toHaveValue("Spring launch review"))
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
	},
})

export const FromMeetingNotes = meta.story({
	args: { ...MEETING_NOTES, template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"A document from Meeting notes, as artboard 5 draws it. Check that the title is dated, that each empty line of the template shows its placeholder, that the headings render without their markers, and that typing on a placeholder line writes there and drops only that placeholder, never writing one into the markdown.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(MEETING_NOTES).toEqual({
			title: "Meeting notes, 2 November",
			body: "\n## Decisions\n\n## Next steps\n",
			detail: "Created just now from Meeting notes",
		})
		await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Meeting notes, 2 November",
		)
		await expect(
			canvas.getByText("Created just now from Meeting notes"),
		).toBeVisible()
		await expect(linesIn(canvasElement)).toEqual([
			"",
			"Decisions",
			"",
			"Next steps",
			"",
		])
		await expect(placeholdersIn(canvasElement)).toEqual([
			"Who was there, and what the meeting was for.",
			"One line per decision, with the reason behind it.",
			"Who does what, and by when.",
		])
		await expect(getComputedStyle(lineAt(canvasElement, 2)).fontWeight).toBe(
			"600",
		)

		if (!isInBrowserRunner()) return
		selectRange(canvasElement, "\n## Decisions\n".length)
		await keyboard("Ship")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"\n## Decisions\nShip\n## Next steps\n",
		)
		await expect(placeholdersIn(canvasElement)).toEqual([
			"Who was there, and what the meeting was for.",
			"Who does what, and by when.",
		])
	},
})

export const WithTypedText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A blank document once written in. Check that # then a space makes a heading, that - then a space makes a list item Enter carries on, and that the markdown reported is the text typed.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		selectRange(canvasElement, 0)
		await keyboard(
			"We agreed the date.{Enter}# Decisions{Enter}- Ship on the 14th{Enter}Copy is final on the 7th",
		)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"We agreed the date.\n# Decisions\n- Ship on the 14th\n- Copy is final on the 7th",
		)
		await expect(getComputedStyle(lineAt(canvasElement, 2)).fontSize).toBe(
			"26.25px",
		)
		await expect(
			slotsIn(canvasElement, "library-document-bullet"),
		).toHaveLength(1)
	},
})

export const ExistingDocument = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A Library document opened to edit, from its title and its markdown. Check that the editor text is the markdown byte for byte, that nothing is reported before the first edit, and that taking back what was typed reports the body it opened on.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Launch review",
		)
		await expect(canvas.getByText(LAUNCH_REVIEW.detail)).toBeVisible()
		await expect(textIn(canvasElement)).toBe(LAUNCH_REVIEW.body)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "Ship on the 14th")
		await keyboard(", after the review")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			LAUNCH_REVIEW.body.replace(
				"Ship on the 14th",
				"Ship on the 14th, after the review",
			),
		)
		await keyboard("{Backspace}".repeat(", after the review".length))
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(LAUNCH_REVIEW.body)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})

export const RoundTripFixture = meta.story({
	args: {
		title: "Launch plan",
		body: ROUND_TRIP,
		detail: "",
		template: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document holding H1 to H3, bullet and numbered lists, tasks, a quote, a fenced code block, bold, italic, strikethrough, inline code and a link. Check that the caret visiting every line reports nothing, and that a character typed then taken back reports the markdown equal byte for byte to the one the document opened on.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const view = viewIn(canvasElement)
		await expect(textIn(canvasElement)).toBe(ROUND_TRIP)
		for (let number = 1; number <= view.state.doc.lines; number++) {
			const line = view.state.doc.line(number)
			selectRange(canvasElement, line.from, line.to)
			selectRange(canvasElement, line.to)
		}
		await expect(args.onBodyChange).not.toHaveBeenCalled()
		await expect(textIn(canvasElement)).toBe(ROUND_TRIP)

		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "Launch plan")
		await keyboard("x{Backspace}")
		await expect(args.onBodyChange).toHaveBeenCalledTimes(2)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(ROUND_TRIP)
	},
})

const lookOf = (canvasElement: HTMLElement, number: number, text: string) => {
	const span = [...lineAt(canvasElement, number).querySelectorAll("span")]
		.filter((candidate) => candidate.textContent === text)
		.at(-1)
	if (!span) throw new Error(`No ${text} on line ${number}`)
	return getComputedStyle(span)
}

type PlayContext = {
	args: LibraryDocumentEditorProps
	canvasElement: HTMLElement
}

const livePreviewStory = (theme: "dark" | "light") => ({
	globals: { theme },
	args: {
		title: "Launch plan",
		body: ROUND_TRIP,
		detail: "",
		template: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same document with the caret outside every node. Check that each heading, list, task, quote, fence and inline format renders styled with its markers hidden, and that moving the caret into each node shows its markers as plain text again.",
			},
		},
	},
	play: async ({ canvasElement }: PlayContext) => {
		await expect(linesIn(canvasElement)).toEqual([
			"Launch plan",
			"Decisions",
			"Owners",
			"",
			"• Ship on the 14th",
			"• Copy is final on the 7th",
			"",
			"1. Draft the notes",
			"2. Review with legal design",
			"",
			" Book the room",
			" Send the invite",
			"",
			"Keep the launch quiet until the 14th.",
			"",
			"",
			"const launch = await ship()",
			"",
			"",
			"Read the brief and the press kit.",
			"",
		])
		await expect(
			[1, 2, 3].map(
				(line) => getComputedStyle(lineAt(canvasElement, line)).fontSize,
			),
		).toEqual(["26.25px", "18.75px", "16.875px"])
		await expect(lookOf(canvasElement, 5, "14th").fontWeight).toBe("600")
		await expect(lookOf(canvasElement, 6, "final").fontStyle).toBe("italic")
		await expect(lookOf(canvasElement, 9, "legal").textDecorationLine).toBe(
			"line-through",
		)
		await expect(
			slotsIn(canvasElement, "library-document-task").map(
				(box) => (box as HTMLInputElement).checked,
			),
		).toEqual([false, true])
		await expect(
			getComputedStyle(lineAt(canvasElement, 14)).borderInlineStartWidth,
		).toBe("2px")
		await expect(
			getComputedStyle(lineAt(canvasElement, 17)).fontFamily,
		).toContain("Geist Mono")
		await expect(lookOf(canvasElement, 20, "brief").fontFamily).toContain(
			"Geist Mono",
		)
		await expect(
			lookOf(canvasElement, 20, "press kit").textDecorationLine,
		).toBe("underline")

		const shownWith = async (text: string, number: number, line: string) => {
			caretAfter(canvasElement, text)
			await waitFor(() =>
				expect(lineAt(canvasElement, number).textContent).toBe(line),
			)
		}
		await shownWith("Launch", 1, "# Launch plan")
		await shownWith("Owners", 3, "### Owners")
		await shownWith("**14", 5, "- Ship on the **14th**")
		await shownWith("*fin", 6, "- Copy is *final* on the 7th")
		await shownWith("~~leg", 9, "2. Review with ~~legal~~ design")
		await shownWith("Book", 11, "- [ ] Book the room")
		await shownWith("Keep", 14, "> Keep the launch quiet until the 14th.")
		await shownWith("const", 16, "```ts")
		await shownWith(
			"[press",
			20,
			"Read the brief and the [press kit](https://kiroshi.app/press).",
		)
		await shownWith("`bri", 20, "Read the `brief` and the press kit.")
		await expect(lineAt(canvasElement, 1).textContent).toBe("Launch plan")
	},
})

export const LivePreview = meta.story({ ...livePreviewStory("dark") })

export const LivePreviewLight = meta.story({ ...livePreviewStory("light") })

export const BoldTypedMarkersHidden = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Bold typed at the end of a paragraph, then the caret moving on and coming back. Check that the markers show while the caret touches the bold, that they hide and the words turn bold once the caret leaves, and that they show again when the caret re-enters.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "Screenshots land on the 10th.")
		await keyboard(" Then **ship**")
		const lastLine = viewIn(canvasElement).state.doc.lines
		await expect(lineAt(canvasElement, lastLine).textContent).toBe(
			"Screenshots land on the 10th. Then **ship**",
		)
		await keyboard(" it.")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			`${LAUNCH_REVIEW.body} Then **ship** it.`,
		)
		await expect(lineAt(canvasElement, lastLine).textContent).toBe(
			"Screenshots land on the 10th. Then ship it.",
		)
		await expect(lookOf(canvasElement, lastLine, "ship").fontWeight).toBe("600")

		await keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}")
		await expect(lineAt(canvasElement, lastLine).textContent).toBe(
			"Screenshots land on the 10th. Then **ship** it.",
		)
	},
})

const TASKS = {
	title: "Launch checklist",
	detail: "",
	template: undefined,
	body: "- [ ] Book the room\n- [x] Send the invite",
}

export const TaskToggle = meta.story({
	args: TASKS,
	parameters: {
		docs: {
			description: {
				story:
					"Two tasks, the caret elsewhere. Check that clicking an open task's checkbox writes [x] in its line and reports the markdown, and that clicking a done one writes [ ] back.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const [open, done] = slotsIn(canvasElement, "library-document-task") as [
			HTMLInputElement,
			HTMLInputElement,
		]
		await expect(open).toHaveAccessibleName("Done")
		await userEvent.click(open)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"- [x] Book the room\n- [x] Send the invite",
		)
		await userEvent.click(
			slotsIn(canvasElement, "library-document-task")[1] ?? done,
		)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			"- [x] Book the room\n- [ ] Send the invite",
		)
		await expect(
			slotsIn(canvasElement, "library-document-task").map(
				(box) => (box as HTMLInputElement).checked,
			),
		).toEqual([true, false])
	},
})

export const OutsideChangeWhileTyping = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} draft={launchReviewDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"Someone else writes in the document while the person types, the body arriving through the same prop the editor reports to. Check that the change lands as a minimal edit in the same editor, that the caret stays after the same character of the person's text, that typing goes on where it stopped, and that the outside change is never reported back through `onBodyChange`.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const content = bodyIn(canvasElement)
		caretAfter(canvasElement, "Ship on the 14th")
		await keyboard(", after the review")
		const typedCount = ", after the review".length
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typedCount)

		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace("Ship on", "We ship on")
				.replace("on the 10th", "on the 11th"),
		})
		await waitFor(() => expect(textIn(canvasElement)).toContain("on the 11th."))
		await expect(bodyIn(canvasElement)).toBe(content)
		const { state } = viewIn(canvasElement)
		await expect(state.sliceDoc(0, state.selection.main.head)).toMatch(
			/We ship on the 14th, after the review$/,
		)
		await keyboard(" call")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			LAUNCH_REVIEW.body
				.replace(
					"Ship on the 14th",
					"We ship on the 14th, after the review call",
				)
				.replace("on the 10th", "on the 11th"),
		)
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typedCount + 5)
	},
})

const undoDraft = createDraftStore(LAUNCH_REVIEW)

export const UndoAfterOutsideEdit = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: undoDraft.reset,
	render: (args) => <LiveEditor {...args} draft={undoDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person types, someone else then changes a heading, and the person presses Cmd+Z. Check that the undo takes back only the person's typing and keeps the outside change, and that Cmd+Shift+Z brings the typing back.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "signs off the copy.")
		await keyboard(" Léa chairs.")
		const outside = undoDraft.read().body.replace("## Next steps", "## Then")
		undoDraft.write({ body: outside })
		await waitFor(() => expect(textIn(canvasElement)).toBe(outside))

		await pressWithCommand("z")
		const undone = LAUNCH_REVIEW.body.replace("## Next steps", "## Then")
		await expect(textIn(canvasElement)).toBe(undone)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(undone)

		await keyboard(`{${COMMAND}>}{Shift>}z{/Shift}{/${COMMAND}}`)
		await expect(textIn(canvasElement)).toBe(outside)
	},
})

const BLOCK_GAP = 14

const gapsAroundLine = (canvasElement: HTMLElement, number: number) => {
	const above = lineAt(canvasElement, number - 1).getBoundingClientRect()
	const below = lineAt(canvasElement, number + 1).getBoundingClientRect()
	return below.top - above.bottom
}

const blankLinesIn = (canvasElement: HTMLElement) => {
	const { doc } = viewIn(canvasElement).state
	return Array.from({ length: doc.lines }, (_, index) => index + 1).filter(
		(number) => doc.line(number).text === "",
	)
}

export const BlankLineBetweenBlocks = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The blank line markdown keeps between two blocks. Check that it renders the 14px gap the blocks always had, never a full line, that the caret placed on it reports nothing, and that typing there writes on that line and taking it back leaves the markdown byte for byte as it opened.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const blanks = blankLinesIn(canvasElement)
		await expect(blanks).toEqual([2, 4, 7, 9])
		for (const number of blanks)
			await expect(gapsAroundLine(canvasElement, number)).toBe(BLOCK_GAP)

		const view = viewIn(canvasElement)
		const blank = view.state.doc.line(9)
		selectRange(canvasElement, blank.from)
		const caret = view.coordsAtPos(blank.from)
		const shown = lineAt(canvasElement, 9).getBoundingClientRect()
		const caretMiddle = ((caret?.top ?? 0) + (caret?.bottom ?? 0)) / 2
		await expect(caretMiddle).toBeGreaterThan(shown.top)
		await expect(caretMiddle).toBeLessThan(shown.bottom)
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		if (!isInBrowserRunner()) return
		await keyboard("Note")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(
			`${LAUNCH_REVIEW.body.slice(0, blank.from)}Note${LAUNCH_REVIEW.body.slice(blank.from)}`,
		)
		await keyboard("{Backspace}{Backspace}{Backspace}{Backspace}")
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(LAUNCH_REVIEW.body)
		await expect(gapsAroundLine(canvasElement, 9)).toBe(BLOCK_GAP)
	},
})

const PASTED = "First thought.\n\nSecond thought.\n\nThird thought."

export const MultiParagraphPaste = meta.story({
	args: { ...MEETING_NOTES, template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"Three paragraphs separated by blank lines, with no leading newline, pasted on the empty line under Decisions. Check that the markdown reported carries them exactly as pasted, and that they render as three paragraphs a block gap apart.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const view = viewIn(canvasElement)
		const empty = view.state.doc.line(3)
		await expect(empty.text).toBe("")
		selectRange(canvasElement, empty.from)
		const clipboardData = new DataTransfer()
		clipboardData.setData("text/plain", PASTED)
		bodyIn(canvasElement).dispatchEvent(
			new ClipboardEvent("paste", {
				bubbles: true,
				cancelable: true,
				clipboardData,
			}),
		)

		const expected = `${MEETING_NOTES.body.slice(0, empty.from)}${PASTED}${MEETING_NOTES.body.slice(empty.from)}`
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(expected)
		await expect(textIn(canvasElement)).toBe(expected)
		const paragraphs: string[] = []
		syntaxTree(view.state).iterate({
			from: empty.from,
			to: empty.from + PASTED.length,
			enter: (node) => {
				if (node.name === "Paragraph")
					paragraphs.push(view.state.sliceDoc(node.from, node.to))
			},
		})
		await expect(paragraphs).toEqual([
			"First thought.",
			"Second thought.",
			"Third thought.",
		])
		await expect(linesIn(canvasElement).slice(2, 7)).toEqual([
			"First thought.",
			"",
			"Second thought.",
			"",
			"Third thought.",
		])
		await expect(gapsAroundLine(canvasElement, 4)).toBe(BLOCK_GAP)
		await expect(gapsAroundLine(canvasElement, 6)).toBe(BLOCK_GAP)
	},
})

const formatDraft = createDraftStore(LAUNCH_REVIEW)

export const FormatUndoneWhole = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onBold: boldOn(formatDraft) },
	beforeEach: formatDraft.reset,
	render: (args) => <LiveEditor {...args} draft={formatDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person types, then turns a few words bold from the toolbar and again with Cmd+B, the host writing the bold back through `body`. Check that each bold lands in the text, that the next Cmd+Z takes the whole bold back in one step and keeps the typing, and that the typing goes on the following Cmd+Z.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "Screenshots land on the 10th.")
		await keyboard(" Then launch.")
		const typed = `${LAUNCH_REVIEW.body} Then launch.`
		await expect(textIn(canvasElement)).toBe(typed)

		selectText(canvasElement, "the launch date")
		await (await realPointer()).click(
			await canvas.findByRole("button", { name: "Bold" }),
		)
		const bolded = typed.replace("the launch date", "**the launch date**")
		await waitFor(() => expect(textIn(canvasElement)).toBe(bolded))
		await pressWithCommand("z")
		await expect(textIn(canvasElement)).toBe(typed)
		await expect(args.onBodyChange).toHaveBeenLastCalledWith(typed)

		selectText(canvasElement, "who signs off")
		await pressWithCommand("b")
		await waitFor(() =>
			expect(textIn(canvasElement)).toBe(
				typed.replace("who signs off", "**who signs off**"),
			),
		)
		await pressWithCommand("z")
		await expect(textIn(canvasElement)).toBe(typed)
		await pressWithCommand("z")
		await expect(textIn(canvasElement)).toBe(LAUNCH_REVIEW.body)
	},
})

const unchangedFormatDraft = createDraftStore(LAUNCH_REVIEW)

export const FormatWithoutChange = meta.story({
	args: {
		...LAUNCH_REVIEW,
		template: undefined,
		onBold: boldOn(unchangedFormatDraft),
		onItalic: fn(() =>
			unchangedFormatDraft.write({ body: unchangedFormatDraft.read().body }),
		),
	},
	beforeEach: unchangedFormatDraft.reset,
	render: (args) => <LiveEditor {...args} draft={unchangedFormatDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person presses Cmd+I and the host answers with the text unchanged, someone else then changes a heading, and the person turns a few words bold with Cmd+B. Check that the bold lands, that the next Cmd+Z takes the whole bold back and keeps the outside change, and that a further Cmd+Z leaves the outside change in place.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		selectText(canvasElement, "the launch date")
		await pressWithCommand("i")
		await expect(args.onItalic).toHaveBeenCalledOnce()
		await expect(textIn(canvasElement)).toBe(LAUNCH_REVIEW.body)

		const outside = LAUNCH_REVIEW.body.replace("## Next steps", "## Then")
		unchangedFormatDraft.write({ body: outside })
		await waitFor(() => expect(textIn(canvasElement)).toBe(outside))

		selectText(canvasElement, "who signs off")
		await pressWithCommand("b")
		await waitFor(() =>
			expect(textIn(canvasElement)).toBe(
				outside.replace("who signs off", "**who signs off**"),
			),
		)
		await pressWithCommand("z")
		await expect(textIn(canvasElement)).toBe(outside)
		await pressWithCommand("z")
		await expect(textIn(canvasElement)).toBe(outside)
	},
})

export const OutsideTitleChange = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} draft={launchReviewDraft} />,
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
		await expect(title.value.slice(0, title.selectionStart)).toBe(
			"Spring launch review notes",
		)
		await expect(args.onTitleChange).toHaveBeenCalledTimes(typed.length)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const CaretMoves = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onCaretChange: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"The person moves the caret in the body, then leaves it for the title. Check that each move reports the caret as a markdown offset, and that leaving the body reports no caret.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const at = LAUNCH_REVIEW.body.indexOf("Ship")
		selectRange(canvasElement, at)
		await waitFor(() => expect(args.onCaretChange).toHaveBeenLastCalledWith(at))
		selectRange(canvasElement, at + 4)
		await waitFor(() =>
			expect(args.onCaretChange).toHaveBeenLastCalledWith(at + 4),
		)
		await userEvent.click(canvas.getByRole("textbox", { name: "Title" }))
		await waitFor(() =>
			expect(args.onCaretChange).toHaveBeenLastCalledWith(null),
		)
	},
})

export const ClickBelowTheLastLine = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A press in the empty space of the column, under the last line and beside a heading. Check that the press below the last line puts the caret at the end of the text so typing writes there, that a press beside a line puts the caret at its end, and that a press on the text itself keeps the editor's own caret placement.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const column = slotIn(canvasElement, "library-document-column")
		const view = viewIn(canvasElement)
		const lastLine = lineAt(
			canvasElement,
			view.state.doc.lines,
		).getBoundingClientRect()
		await expect(column.getBoundingClientRect().bottom).toBeGreaterThan(
			lastLine.bottom + 80,
		)

		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: column,
			coords: { clientX: lastLine.left + 40, clientY: lastLine.bottom + 80 },
		})
		await expect(bodyIn(canvasElement)).toHaveFocus()
		await expect(view.state.selection.main.head).toBe(LAUNCH_REVIEW.body.length)

		const headingLine = lineAt(canvasElement, 3).getBoundingClientRect()
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: column,
			coords: {
				clientX: column.getBoundingClientRect().left + 8,
				clientY: headingLine.top + headingLine.height / 2,
			},
		})
		await expect(bodyIn(canvasElement)).toHaveFocus()
		await expect(view.state.selection.main.head).toBe(
			LAUNCH_REVIEW.body.indexOf("## Decisions") + "## Decisions".length,
		)

		if (!isInBrowserRunner()) return
		const who = LAUNCH_REVIEW.body.indexOf("who signs")
		const opening = lineAt(canvasElement, 1)
		const word = view.coordsAtPos(who + 1)
		const line = opening.getBoundingClientRect()
		await (await realPointer()).click(opening, {
			position: { x: (word?.left ?? 0) - line.left, y: line.height / 2 },
		})
		await expect(
			Math.abs(view.state.selection.main.head - (who + 1)),
		).toBeLessThanOrEqual(1)
	},
})

const runTextsIn = (canvasElement: HTMLElement) => {
	const texts = new Map<string, string>()
	for (const run of slotsIn(canvasElement, "library-document-run")) {
		const agent = run.dataset.agent ?? ""
		texts.set(agent, `${texts.get(agent) ?? ""}${run.textContent}`)
	}
	return Object.fromEntries(texts)
}

const AGENT_RUNS = {
	atlas: "and the agent says why it asks",
	mira: "We also count how often someone stops an agent in its",
}

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
					"Atlas and Mira writing in the document while the person has it open to edit, as artboard 10 draws it. Check that the presence pill counts the writers and reports Stop all, that each added run and its named caret paint in the agent's own colour over the text it covers, that the hover card reports Stop Mira and Open conversation, and that the written text still takes the person's typing.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
		await userEvent.click(canvas.getByRole("button", { name: "Stop all" }))
		await expect(args.onStopAll).toHaveBeenCalledOnce()

		await waitFor(() => expect(runTextsIn(canvasElement)).toEqual(AGENT_RUNS))
		const [atlasRun] = slotsIn(canvasElement, "library-document-run")
		const miraRun = slotsIn(canvasElement, "library-document-run").find(
			(run) => run.dataset.agent === "mira",
		) as HTMLElement
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).not.toBe(getComputedStyle(miraRun).backgroundColor)
		const carets = slotsIn(canvasElement, "library-document-caret")
		await expect(carets).toHaveLength(2)
		await expect(
			(carets[0] as HTMLElement).getBoundingClientRect(),
		).toMatchObject({
			width: 2,
			height: 24,
		})

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

		if (!isInBrowserRunner()) return
		caretAfter(canvasElement, "stops an agent in its")
		await keyboard(" tracks")
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
					"Atlas and Mira done writing in a long document open to edit, as artboard 11 draws it. Check that the presence pill and the carets are gone, that each added run keeps its agent's colour as plain text, that the finished bar floats centred at the bottom of the column with Undo all and Done, and that the last line of the document clears the bar once scrolled to the end.",
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
		await waitFor(() => expect(runTextsIn(canvasElement)).toEqual(AGENT_RUNS))
		const [atlasRun] = slotsIn(canvasElement, "library-document-run")
		await expect(getComputedStyle(atlasRun as HTMLElement).color).not.toBe(
			getComputedStyle(bodyIn(canvasElement)).color,
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

		const column = slotIn(canvasElement, "library-document-column")
		await expect(column.scrollHeight).toBeGreaterThan(column.clientHeight)
		column.scrollTop = column.scrollHeight
		const view = viewIn(canvasElement)
		await waitFor(() =>
			expect(lineAt(canvasElement, view.state.doc.lines).textContent).toBe(
				"The last line of the brief stays above the finished bar.",
			),
		)
		await expect(
			lineAt(canvasElement, view.state.doc.lines).getBoundingClientRect()
				.bottom,
		).toBeLessThanOrEqual(bar.getBoundingClientRect().top)

		await userEvent.click(canvas.getByRole("button", { name: "Undo all" }))
		await expect(args.onUndoAll).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Done" }))
		await expect(args.onDone).toHaveBeenCalledOnce()
	},
})

const ATLAS_WRITERS = LIBRARY_WRITERS.slice(0, 1)

const createWritersStore = () => {
	let writers = ATLAS_WRITERS
	const listeners = new Set<() => void>()
	const write = (next: typeof ATLAS_WRITERS) => {
		writers = next
		for (const listener of listeners) listener()
	}
	return {
		read: () => writers,
		finish: () => write([]),
		resume: () => write(ATLAS_WRITERS),
		reset: () => {
			writers = ATLAS_WRITERS
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

type WritersStore = ReturnType<typeof createWritersStore>

type FinishingWriterEditorProps = LibraryDocumentEditorProps & {
	writing: WritersStore
}

const FinishingWriterEditor = ({
	writing,
	...args
}: FinishingWriterEditorProps) => {
	const writers = useSyncExternalStore(writing.subscribe, writing.read)
	return (
		<EditorFrame>
			<LibraryDocumentEditor {...args} writers={writers} />
		</EditorFrame>
	)
}

const after = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

const atlasRunIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-run").find(
		(run) => run.dataset.agent === "atlas",
	)

const heldRunIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-held-run").find(
		(run) => run.dataset.agent === "atlas",
	)

const agentCaretIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector("[data-slot='library-document-caret']")

const HELD_RUN_ARGS = {
	title: LIBRARY_AGENT_DOCUMENT.name,
	body: LIBRARY_AGENT_DOCUMENT.body,
	detail: LIBRARY_AGENT_DOCUMENT.detail,
	template: undefined,
	onStopAll: fn(),
}

const stopWriting = async (
	canvasElement: HTMLElement,
	writing: WritersStore,
) => {
	const run = await waitFor(() => {
		const shown = atlasRunIn(canvasElement)
		expect(shown).toBeDefined()
		return getComputedStyle(shown as HTMLElement)
	})
	const writtenLook = { backgroundColor: run.backgroundColor, color: run.color }
	writing.finish()
	const stoppedAt = performance.now()
	await waitFor(() => expect(agentCaretIn(canvasElement)).toBe(null))
	return {
		writtenLook,
		atSinceStop: (milliseconds: number) =>
			after(milliseconds - (performance.now() - stoppedAt)),
		sinceStop: () => performance.now() - stoppedAt,
	}
}

const expectWrittenLook = async (
	canvasElement: HTMLElement,
	writtenLook: Pick<CSSStyleDeclaration, "backgroundColor" | "color">,
) => {
	const held = heldRunIn(canvasElement)
	await expect(held).toBeDefined()
	await expect(getComputedStyle(held as HTMLElement)).toMatchObject(writtenLook)
}

const atlasWriting = createWritersStore()

export const AgentRunHeldThenFades = meta.story({
	args: HELD_RUN_ARGS,
	beforeEach: atlasWriting.reset,
	render: (args) => <FinishingWriterEditor {...args} writing={atlasWriting} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing. Check that his run keeps its written look for 3 seconds after he leaves, then its highlight fades out over a second while the text stays fully opaque, and that it is gone after that. With reduced motion the run leaves at 3 seconds without a fade.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			atlasWriting,
		)
		await atSinceStop(2000)
		await expectWrittenLook(canvasElement, writtenLook)

		await waitFor(() => expect(heldRunIn(canvasElement)).toBeUndefined(), {
			timeout: 2500,
		})
	},
})

const typedDuringHold = createWritersStore()

export const HeldRunKeptWhileTyping = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: typedDuringHold.reset,
	render: (args) => (
		<FinishingWriterEditor {...args} writing={typedDuringHold} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing and the person types inside his run one second later. Check that the run takes the typed text and keeps its written look two seconds after the stop.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			typedDuringHold,
		)
		if (!isInBrowserRunner()) return
		await atSinceStop(1000)
		caretAfter(canvasElement, "and the agent")
		await keyboard(" truly")
		await expect(heldRunIn(canvasElement)?.textContent).toContain("truly")

		await atSinceStop(2000)
		await expectWrittenLook(canvasElement, writtenLook)
		await expect(heldRunIn(canvasElement)?.textContent).toContain("truly")
	},
})

const resumedDuringHold = createWritersStore()

export const HeldRunRestartedByAgent = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: resumedDuringHold.reset,
	render: (args) => (
		<FinishingWriterEditor {...args} writing={resumedDuringHold} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing, writes into his held run again two seconds later, then stops again. Check that the run starts a fresh hold and keeps its written look four seconds after the first stop.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			resumedDuringHold,
		)
		await atSinceStop(2000)
		resumedDuringHold.resume()
		await waitFor(() => expect(agentCaretIn(canvasElement)).not.toBe(null))
		resumedDuringHold.finish()
		await waitFor(() => expect(agentCaretIn(canvasElement)).toBe(null))

		await atSinceStop(4000)
		await expectWrittenLook(canvasElement, writtenLook)
	},
})

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const fadingRun = createWritersStore()

export const HeldRunFadesWithMotion = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: () => {
		fadingRun.reset()
		const matchMedia = window.matchMedia.bind(window)
		const motion = spyOn(window, "matchMedia").mockImplementation((query) =>
			matchMedia(query === REDUCED_MOTION_QUERY ? "not all" : query),
		)
		return () => motion.mockRestore()
	},
	render: (args) => <FinishingWriterEditor {...args} writing={fadingRun} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing while reduced motion is off. Check that his held run takes the fade class between three and four seconds after the stop, and that it is gone by four and a half seconds.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { sinceStop } = await stopWriting(canvasElement, fadingRun)
		await waitFor(
			() => expect(heldRunIn(canvasElement)).toHaveClass("animate-run-fade"),
			{ timeout: 4000 },
		)
		await expect(sinceStop()).toBeGreaterThanOrEqual(3000)
		await expect(sinceStop()).toBeLessThan(4000)

		await waitFor(() => expect(heldRunIn(canvasElement)).toBeUndefined(), {
			timeout: 4500 - sinceStop(),
		})
	},
})

const LEA = {
	id: "lea",
	name: "Léa Martin",
	caret: LIBRARY_AGENT_DOCUMENT.body.indexOf("Weekly active"),
}

export const PersonCaretBesideAgent = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: ATLAS_WRITERS,
		people: [LEA],
		onStopAll: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Léa has the document open beside the person while Atlas writes. Check that her named caret stands where her caret is, that it takes no width in the line, and that Atlas keeps his own caret at the end of his run.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const caret = await canvas.findByRole("img", { name: "Léa Martin" })
		await expect(caret).toHaveAttribute(
			"data-slot",
			"library-document-person-caret",
		)
		const line = caret.closest(".cm-line") as HTMLElement
		await expect(line.textContent).toContain("Weekly active Spaces")
		await expect(caret.getBoundingClientRect().left).toBeCloseTo(
			line.getBoundingClientRect().left,
			0,
		)
		await expect(slotsIn(canvasElement, "library-document-caret")).toHaveLength(
			1,
		)
		await expect(
			canvas.getByRole("button", { name: "Atlas is writing" }),
		).toBeVisible()
	},
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

const SELECTION_OPENING =
	"We met to agree the launch date and who signs off the copy before the screenshots land, so the press kit and the store listing go out together on the same morning."

const SELECTION_DOCUMENT = {
	title: LAUNCH_REVIEW.title,
	detail: LAUNCH_REVIEW.detail,
	template: undefined,
	body: [
		SELECTION_OPENING,
		"## Decisions",
		"- Ship on the **14th**\n- Copy is final on the 7th",
		"## Next steps",
		"Screenshots land on the 10th.",
	].join("\n\n"),
}

const SELECTION_ACTIONS = {
	onBold: fn(),
	onItalic: fn(),
	onStrikethrough: fn(),
	onCode: fn(),
	onLink: fn(),
	onHeading: fn(),
	onList: fn(),
}

const SELECTION_GAP = 8

const LAUNCH_DATE = "the launch date"

const toolbarIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector<HTMLElement>('[data-slot="selection-toolbar"]')

const selectionRectIn = (canvasElement: HTMLElement) => {
	const view = viewIn(canvasElement)
	const { from, to } = view.state.selection.main
	const start = view.domAtPos(from)
	const end = view.domAtPos(to)
	const range = document.createRange()
	range.setStart(start.node, start.offset)
	range.setEnd(end.node, end.offset)
	return range.getBoundingClientRect()
}

const expectToolbarAbove = async (canvasElement: HTMLElement) => {
	await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
	const selection = selectionRectIn(canvasElement)
	const toolbar = toolbarIn(canvasElement)?.getBoundingClientRect()
	if (!toolbar) throw new Error("No toolbar")
	await expect(
		Math.abs(
			(toolbar.left + toolbar.right) / 2 -
				(selection.left + selection.right) / 2,
		),
	).toBeLessThan(1)
	await expect(
		Math.abs(selection.top - toolbar.bottom - SELECTION_GAP),
	).toBeLessThan(1)
}

const selectionStory = (story: string) => ({
	args: { ...SELECTION_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: { docs: { description: { story } } },
})

export const A1ToolbarAboveSelection = meta.story({
	...selectionStory(
		"Artboard A1: a few words selected on one line of a paragraph. Check that the toolbar sits centred on the selection 8px above it, over every caret and flag, that a pointer press on Bold reports the selected range and keeps the text selected without touching the document, and that the toolbar leaves when the selection collapses or moves to the title.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const start = selectText(canvasElement, LAUNCH_DATE)
		await expectToolbarAbove(canvasElement)
		await expect(
			getComputedStyle(toolbarIn(canvasElement) as HTMLElement).zIndex,
		).toBe("10")

		const toolbar = canvas.getByRole("toolbar", { name: "Format" })
		await expect(
			within(toolbar)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual([
			"Bold",
			"Italic",
			"Strikethrough",
			"Code",
			"Link",
			"Heading",
			"List",
		])

		await userEvent.click(within(toolbar).getByRole("button", { name: "Bold" }))
		await expect(args.onBold).toHaveBeenCalledWith({
			start,
			end: start + LAUNCH_DATE.length,
		})
		await expect(document.activeElement).toBe(bodyIn(canvasElement))
		await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		selectRange(canvasElement, start)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))
		selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		const title = canvas.getByRole("textbox", {
			name: "Title",
		}) as HTMLTextAreaElement
		title.focus()
		title.setSelectionRange(0, 6)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))

		selectText(canvasElement, LAUNCH_DATE)
		await expectToolbarAbove(canvasElement)
	},
})

export const A2ToolbarOverTwoLines = meta.story({
	...selectionStory(
		"Artboard A2: a selection running from the first line of a paragraph onto the second. Check that the toolbar centres on the box holding both selected lines and sits 8px above its top.",
	),
	play: async ({ canvasElement }) => {
		selectText(
			canvasElement,
			"who signs off the copy before the screenshots land, so the press kit and the store",
		)
		await expect(selectionRectIn(canvasElement).height).toBeGreaterThan(40)
		await expectToolbarAbove(canvasElement)
	},
})

export const A3ToolbarButtonHover = meta.story({
	args: { ...SELECTION_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A3: the pointer rests on Bold. Check that Bold changes fill with no colour transition, and that its tooltip names it with its shortcut, with no arrow, 14px above the button.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		selectText(canvasElement, LAUNCH_DATE)
		const bold = await canvas.findByRole("button", { name: "Bold" })
		await expect(getComputedStyle(bold).transitionProperty).toBe("none")
		await userEvent.hover(bold)
		const tooltip = await screen.findByRole("tooltip")
		await expect(tooltip).toHaveTextContent("Bold⌘B")
		await expect(
			[...tooltip.children]
				.filter((child) => child.checkVisibility())
				.map((child) => child.tagName),
		).toEqual(["KBD"])
		await expect(
			bold.getBoundingClientRect().top - tooltip.getBoundingClientRect().bottom,
		).toBeCloseTo(14, 0)
	},
})

export const A4ToolbarFormatOn = meta.story({
	...selectionStory(
		"Artboard A4: a selection inside bold text in a list item. Check that Bold and List wear the Space colour and report themselves pressed, while every other button stays off.",
	),
	play: async ({ canvas, canvasElement }) => {
		selectText(canvasElement, "14th")
		const toolbar = await canvas.findByRole("toolbar", { name: "Format" })
		const pressed = within(toolbar)
			.getAllByRole("button")
			.filter((button) => button.getAttribute("aria-pressed") === "true")
			.map((button) => button.getAttribute("aria-label"))
		await expect(pressed).toEqual(["Bold", "List"])
		await expectToolbarAbove(canvasElement)
	},
})

export const A5ToolbarLinkField = meta.story({
	...selectionStory(
		"Artboard A5: Link pressed, the bar gives way to the link field at the same place. Check that the field takes focus, that Escape returns to the bar without reporting a link, and that Enter reports the typed url with the selected range and returns to the bar.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const start = selectText(canvasElement, LAUNCH_DATE)
		const openLinkField = async () => {
			await userEvent.click(await canvas.findByRole("button", { name: "Link" }))
			const field = canvas.getByRole("textbox", { name: "Link address" })
			await expect(document.activeElement).toBe(field)
			return field
		}

		await userEvent.type(await openLinkField(), "https://kiroshi.app/brief")
		await userEvent.keyboard("{Escape}")
		await expect(args.onLink).not.toHaveBeenCalled()
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()

		await userEvent.type(
			await openLinkField(),
			"https://kiroshi.app/brief{Enter}",
		)
		await expect(args.onLink).toHaveBeenCalledOnce()
		await expect(args.onLink).toHaveBeenCalledWith(
			"https://kiroshi.app/brief",
			{ start, end: start + LAUNCH_DATE.length },
		)
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		await userEvent.type(await openLinkField(), "https://kiroshi.app/brief")
		await expect(toolbarIn(canvasElement)?.getBoundingClientRect().width).toBe(
			340,
		)
		await expectToolbarAbove(canvasElement)
	},
})

const FLIPPED_DOCUMENT = {
	...SELECTION_DOCUMENT,
	body: [
		SELECTION_DOCUMENT.body,
		...Array.from(
			{ length: 40 },
			(_, index) =>
				`Week ${index + 1} brings the next round of screenshots and copy.`,
		),
	].join("\n\n"),
}

export const A6ToolbarFlippedBelow = meta.story({
	args: { ...FLIPPED_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A6: the document scrolled until the selected line sits just under the top of the column, with no room above it for the toolbar. Check that the toolbar flips under the selection, its top edge 8px below the selection bottom.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const column = slotIn(canvasElement, "library-document-column")
		const view = viewIn(canvasElement)
		const week = view.state.doc.lineAt(textIn(canvasElement).indexOf("Week 6 "))
		const weekRoom = () =>
			view.lineBlockAt(week.from).top +
			view.documentTop -
			column.getBoundingClientRect().top -
			16
		selectText(canvasElement, "screenshots", week.from)
		await waitFor(() => {
			column.scrollTop += weekRoom()
			expect(Math.abs(weekRoom())).toBeLessThan(1)
			expect(toolbarIn(canvasElement)).toHaveAttribute(
				"data-placement",
				"below",
			)
		})
		await waitFor(() => {
			const selection = selectionRectIn(canvasElement)
			const toolbar = toolbarIn(canvasElement)?.getBoundingClientRect()
			expect(toolbar?.top).toBeGreaterThan(selection.bottom)
			expect(
				Math.abs((toolbar?.top ?? 0) - selection.bottom - SELECTION_GAP),
			).toBeLessThan(1)
		})
	},
})

const pressIn = (field: HTMLElement, init: KeyboardEventInit) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	})
	field.dispatchEvent(event)
	return event
}

type ShortcutCheck = {
	canvasElement: HTMLElement
	keys: string
	callback: unknown
	onBodyChange: unknown
}

const expectShortcutReports = async ({
	canvasElement,
	keys,
	callback,
	onBodyChange,
}: ShortcutCheck) => {
	const start = selectText(canvasElement, LAUNCH_DATE)
	await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))

	await keyboard(keys)
	await expect(callback).toHaveBeenCalledOnce()
	await expect(callback).toHaveBeenCalledWith({
		start,
		end: start + LAUNCH_DATE.length,
	})
	await expect(document.activeElement).toBe(bodyIn(canvasElement))
	await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)
	await expect(onBodyChange).not.toHaveBeenCalled()
	return start
}

export const BoldShortcut = meta.story({
	...selectionStory(
		"Cmd+B on a selected range. Check that Bold is reported once with the range its toolbar button would pass, that Ctrl+B does the same with the browser default prevented, that the shortcut still works once Escape closed the toolbar, and that a collapsed selection or the title field reports nothing.",
	),
	play: async ({ args, canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const start = await expectShortcutReports({
			canvasElement,
			keys: `{${COMMAND}>}b{/${COMMAND}}`,
			callback: args.onBold,
			onBodyChange: args.onBodyChange,
		})

		const body = bodyIn(canvasElement)
		await expect(
			pressIn(body, { key: "b", ctrlKey: true }).defaultPrevented,
		).toBe(true)
		await expect(args.onBold).toHaveBeenCalledTimes(2)
		await expect(args.onBold).toHaveBeenLastCalledWith({
			start,
			end: start + LAUNCH_DATE.length,
		})

		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await pressWithCommand("b")
		await expect(args.onBold).toHaveBeenCalledTimes(3)

		selectRange(canvasElement, start)
		await expect(
			pressIn(body, { key: "b", metaKey: true }).defaultPrevented,
		).toBe(false)
		const title = canvas.getByRole("textbox", {
			name: "Title",
		}) as HTMLTextAreaElement
		title.focus()
		title.setSelectionRange(0, 6)
		await expect(
			pressIn(title, { key: "b", metaKey: true }).defaultPrevented,
		).toBe(false)
		await expect(args.onBold).toHaveBeenCalledTimes(3)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

const shortcutStory = (
	keys: string,
	action: "onItalic" | "onStrikethrough" | "onCode",
	story: string,
) => ({
	...selectionStory(story),
	play: async ({ args, canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		await expectShortcutReports({
			canvasElement,
			keys,
			callback: args[action],
			onBodyChange: args.onBodyChange,
		})
	},
})

export const ItalicShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}i{/${COMMAND}}`,
		"onItalic",
		"Cmd+I on a selected range. Check that Italic is reported once with the range its toolbar button would pass, and that the focus, the selection and the text stay as they were.",
	),
})

export const StrikethroughShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}{Shift>}s{/Shift}{/${COMMAND}}`,
		"onStrikethrough",
		"Cmd+Shift+S on a selected range. Check that Strikethrough is reported once with the range its toolbar button would pass, and that the focus, the selection and the text stay as they were.",
	),
})

export const CodeShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}e{/${COMMAND}}`,
		"onCode",
		"Cmd+E on a selected range. Check that Code is reported once with the range its toolbar button would pass, and that the focus, the selection and the text stay as they were.",
	),
})

export const LinkShortcut = meta.story({
	...selectionStory(
		"Cmd+K on a selected range, the toolbar showing then closed by Escape. Check that the toolbar opens on its link field, focused, that Escape there returns to the bar, and that Enter reports the typed url with the selected range.",
	),
	play: async ({ args, canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const start = selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		const linkField = () =>
			canvas.getByRole("textbox", { name: "Link address" })

		await pressWithCommand("k")
		await expect(document.activeElement).toBe(linkField())
		await keyboard("{Escape}")
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()
		await expect(args.onLink).not.toHaveBeenCalled()

		viewIn(canvasElement).focus()
		await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)
		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await pressWithCommand("k")
		await expect(document.activeElement).toBe(linkField())
		await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)

		await keyboard("https://kiroshi.app/brief{Enter}")
		await expect(args.onLink).toHaveBeenCalledOnce()
		await expect(args.onLink).toHaveBeenCalledWith(
			"https://kiroshi.app/brief",
			{ start, end: start + LAUNCH_DATE.length },
		)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const EscapeClosesToolbar = meta.story({
	...selectionStory(
		"Escape with the toolbar showing over a selected range. Check that the toolbar closes while the focus, the selection and the text stay, that selecting another range brings it back, and that a typed character still replaces the selection.",
	),
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))

		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await expect(document.activeElement).toBe(bodyIn(canvasElement))
		await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)
		await expect(textIn(canvasElement)).toBe(SELECTION_DOCUMENT.body)

		selectText(canvasElement, "the copy")
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		await keyboard("x")
		await expect(textIn(canvasElement)).toBe(
			SELECTION_DOCUMENT.body.replace("the copy", "x"),
		)
		await expect(args.onBodyChange).toHaveBeenCalled()
	},
})

export const ShortcutsWithoutCallbacks = meta.story({
	tags: ["test-only"],
	args: SELECTION_DOCUMENT,
	parameters: {
		docs: {
			description: {
				story:
					"No format callback passed. Check that the five shortcuts leave the key to the browser and that Cmd+K opens no link field.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))

		for (const init of [
			{ key: "b", metaKey: true },
			{ key: "i", metaKey: true },
			{ key: "S", metaKey: true, shiftKey: true },
			{ key: "e", metaKey: true },
			{ key: "k", metaKey: true },
		])
			await expect(pressIn(bodyIn(canvasElement), init).defaultPrevented).toBe(
				false,
			)
		await expect(canvas.queryByRole("textbox", { name: "Link address" })).toBe(
			null,
		)
	},
})

export const ToolbarAfterDrag = meta.story({
	...selectionStory(
		"A press in a paragraph, a selection grown with the button held, then the release. Check that no toolbar shows while the button is down, that the toolbar lands above the finished selection on the release, that a right-button press and release leaves it in place, and that a new primary press hides it before its release.",
	),
	play: async ({ canvasElement }) => {
		const body = bodyIn(canvasElement)
		const press = (type: string, button: number, buttons: number) =>
			body.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button, buttons }),
			)
		press("pointerdown", 0, 1)
		selectText(canvasElement, LAUNCH_DATE)
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).toBe(null)

		press("pointerup", 0, 0)
		await expectToolbarAbove(canvasElement)

		press("pointerdown", 2, 2)
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).not.toBe(null)
		press("pointerup", 2, 0)
		await expectToolbarAbove(canvasElement)

		press("pointerdown", 0, 1)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))
		await expect(selectedTextIn(canvasElement)).toBe(LAUNCH_DATE)
		press("pointerup", 0, 0)
		await expectToolbarAbove(canvasElement)
	},
})

export const ToolbarAfterKeyboardSelection = meta.story({
	...selectionStory(
		"A selection grown with Shift and the right arrow from the start of the launch date. Check that no toolbar shows while Shift is held, and that the toolbar lands above the selection once Shift is released.",
	),
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const start = selectText(canvasElement, LAUNCH_DATE)
		selectRange(canvasElement, start)

		await keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}")
		await expect(selectedTextIn(canvasElement)).toBe("the")
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).toBe(null)

		await keyboard("{/Shift}")
		await expectToolbarAbove(canvasElement)
	},
})
