import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
	expect,
	fn,
	isInaccessible,
	screen,
	spyOn,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	expectHeadingFont,
	opaque,
	slotIn,
} from "@workspace/storybook/story-utils"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import {
	endNotice,
	type FailureReport,
	type FailureSpecs,
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
	type TransientNoticeType,
} from "@workspace/ui/components/notice-surface"
import { Button, buttonVariants } from "@workspace/ui/components/ui/button"
import {
	DialogDescription,
	Dialog as DialogRoot,
	DialogTitle,
	DialogTrigger as Trigger,
} from "@workspace/ui/components/ui/dialog"

const SAVED: NoticeMessage = {
	title: "Routine saved",
	description: "It runs every morning at nine.",
}

const FAILURE: NoticeMessage = {
	title: "Routine could not run",
	description:
		"The watched folder was not readable. Nothing was written, and the schedule is untouched.",
}

const LONG_FAILURE: NoticeMessage = {
	title: "ScheduledRoutineWatcherCouldNotReadTheWatchedDirectory",
	description:
		"The host refused the read while the routine was starting, so the run was abandoned before the first step. Nothing was written to the thread and the schedule is untouched. The next run is still due at nine tomorrow, and the folder can be repointed from the routine settings in the meantime.",
}

const STACK: NoticeMessage[] = [
	{ title: "First notice", description: "The oldest of the four." },
	{ title: "Second notice", description: "Raised after the first." },
	{ title: "Third notice", description: "Raised after the second." },
	{ title: "Fourth notice", description: "The newest of the four." },
]

const MARKED_TYPES: TransientNoticeType[] = ["info", "warning", "loading"]

const WORKING = "Indexing the watched folder"

const SHORT_DELAY = 700

const SWIPE_DISTANCE = 80

const RETRY_LABEL = "Try again"

const COPY_LABEL = "Copy"

const NARROW_WIDTH = 320

const NARROW_VIEWPORT = {
	narrow: {
		name: "Narrow",
		styles: { width: `${NARROW_WIDTH}px`, height: "844px" },
	},
}

const REPORT: FailureReport = {
	appVersion: "0.42.0",
	platform: "macos-aarch64",
	raisedAt: "2026-10-11T09:00:00.000Z",
	command: "run_routine",
	httpStatus: 503,
	side: "host",
}

const SPECS: FailureSpecs = {
	appVersion: "0.24.1",
	commit: "ad6778ca",
	installKind: "dmg",
	os: "Darwin 25.0.0",
	osBuild: "25A354",
	arch: "aarch64",
	ram: "16 GB",
	agentVersion: "2.1.4",
	provider: "subscription",
	side: "host",
	plan: "Pro",
}

const LOG_PATH = "/Users/ada/Library/Logs/Kiroshi/kiroshi.log"

const LOG_LINE_COUNT = 200

const LONG_LOG = Array.from({ length: LOG_LINE_COUNT }, (_, index) => {
	const at = `2026-10-11T09:00:${String(index % 60).padStart(2, "0")}Z`
	return index % 50 === 49
		? `${at} ERROR run_routine  refused: /Users/ada/Projects/a-folder-with-an-unbreakable-name-that-runs-on-and-on/watched`
		: `${at} INFO  routine step ${index + 1} of ${LOG_LINE_COUNT}`
})

const FULL_REPORT: FailureReport = {
	specs: SPECS,
	context: {
		raisedAt: "2026-10-11T09:00:00.000Z",
		raisedIn: "use-routine-run",
		space: "Studio",
		botId: "bot_01J9ZK",
		botName: "Ada",
		conversation: "conv_01J9ZM",
		session: "sess_01J9ZN",
		turn: "turn_7",
		command: "run_routine",
		httpStatus: 503,
	},
	log: { lines: LONG_LOG, path: LOG_PATH, lineCount: LOG_LINE_COUNT },
}

const REPORT_WARNING =
	"Review before sharing: may contain file names and local paths."

const REPORT_TEXT = [
	"Kiroshi failure report",
	FAILURE.description,
	"App version: 0.42.0",
	"Platform: macos-aarch64",
	"Time: 2026-10-11T09:00:00.000Z",
	"Command: run_routine",
	"HTTP status: 503",
	"Side: host",
].join("\n")

type NoticeDemoProps = NoticeSurfaceProps & {
	label: string
	raise: () => void
}

const NoticeDemo = ({ label, raise, ...surface }: NoticeDemoProps) => (
	<>
		<Button onClick={raise} variant="outline">
			{label}
		</Button>
		<NoticeSurface {...surface} />
	</>
)

const viewport = () => {
	const surface = document.querySelector<HTMLElement>(
		"[data-slot=toast-viewport]",
	)
	if (!surface) throw new window.Error("The notice surface is not mounted")

	return surface
}

type SwipeOffset = {
	x?: number
	y?: number
}

const swipe = async (
	notice: HTMLElement,
	pointer: UserEventObject,
	offset: SwipeOffset,
) => {
	const box = notice.getBoundingClientRect()
	const from = {
		clientX: box.left + box.width / 2,
		clientY: box.top + box.height / 2,
	}

	const steps = [0.25, 0.5, 0.75, 1].map((ratio) => ({
		target: notice,
		coords: {
			clientX: from.clientX + (offset.x ?? 0) * ratio,
			clientY: from.clientY + (offset.y ?? 0) * ratio,
		},
	}))

	await pointer.pointer([
		{ keys: "[MouseLeft>]", target: notice, coords: from },
		...steps,
		{ keys: "[/MouseLeft]" },
	])
}

const failureNotice = async () => {
	const notice = await within(viewport()).findByRole("alertdialog", {
		hidden: true,
	})

	return opaque(notice)
}

const closeControl = () => {
	const close = viewport().querySelector<HTMLElement>("[data-slot=toast-close]")
	if (!close) throw new window.Error("The notice carries no close control")

	return close
}

const actionControl = () =>
	viewport().querySelector<HTMLElement>("[data-slot=toast-action]")

const destructiveRole = () =>
	getComputedStyle(document.documentElement)
		.getPropertyValue("--destructive")
		.trim()

const markOf = (notice: HTMLElement) => {
	const mark = notice.querySelector<SVGElement>("svg")
	if (!mark) throw new window.Error("The notice carries no status mark")

	return mark
}

const noticesOnScreen = () =>
	Array.from(
		viewport().querySelectorAll<HTMLElement>("[data-slot=toast]"),
	).filter((notice) => !notice.hasAttribute("data-limited"))

const atTopCentre = async (notice: HTMLElement) => {
	await waitFor(async () => {
		const box = notice.getBoundingClientRect()

		await expect(box.top).toBeLessThanOrEqual(24)
		await expect(
			Math.abs(box.left - (window.innerWidth - box.right)),
		).toBeLessThanOrEqual(1)
	})
}

const meta = preview.meta({
	title: "Overlays/NoticeSurface",
	component: NoticeSurface,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The window's notice surface: one viewport mounted once in the shell, anchored to the top edge of the window and centred on it, and two ways to raise something into it. `raiseTransientNotice` reports what went right on the `success` mark, or on the `info`, `warning` or `loading` mark when it is handed a type, and leaves on its own once `TRANSIENT_NOTICE_DELAY` has passed - except on `loading`, which holds until its caller ends it, because the work it reports has no deadline; `raiseFailureNotice` reports what went wrong on the `error` mark, the one mark on the destructive colour role, and stays until the reader closes it - a failure that dismisses itself is close to silence. Both are module-level calls, so a controller, a driver or a scheduler raises a notice without a hook and without a component in scope, and both take an optional action drawn between the text and the close control. Both return the identifier of the notice they raised, and `endNotice` takes that identifier and takes the notice off screen; an identifier no notice on screen carries leaves the surface as it was. Notices land against the top edge, newest nearest it, three at most, with the ones beyond the limit marked `data-limited` rather than removed. Enter and leave travel through the top edge over 500ms, and drop to a fade with no movement under `prefers-reduced-motion` - see `ReducedMotion`. `transientDelay` on the viewport overrides the delay for the whole surface; a failure ignores it.",
			},
		},
	},
})

export const Default = meta.story({
	tags: ["test-only"],
	render: () => (
		<NoticeDemo
			label="Save the routine"
			raise={() => raiseTransientNotice(SAVED)}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The notice an action that succeeded reaches for, raised with no type and drawn on the success mark. Check that it lands against the top edge, centred on the window, on the surface tokens the other floating surfaces use, is announced politely through the viewport's live region rather than interrupting, carries no action control when the caller passed none, and leaves on its own once `TRANSIENT_NOTICE_DELAY` has passed without anyone touching it. Pick `Error` for the notice that stays.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Save the routine" }),
		)

		const notice = await screen.findByRole("dialog")
		await expect(notice).toHaveAccessibleName(SAVED.title)
		await expect(notice).toHaveAccessibleDescription(SAVED.description)
		await expectHeadingFont(within(notice).getByRole("heading", { level: 2 }))

		await opaque(notice)
		await atTopCentre(notice)
		await expect(markOf(notice)).toBeVisible()
		await expect(actionControl()).toBe(null)

		await expect(viewport()).toHaveAttribute("aria-live", "polite")
		await expect(viewport()).toHaveAccessibleName("Notices")
		await expect(screen.queryByRole("alert")).toBe(null)

		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null), {
			timeout: TRANSIENT_NOTICE_DELAY + 4000,
		})
	},
})

const closedFailure = fn()

export const Error = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice({ ...FAILURE, onClose: closedFailure })}
			transientDelay={SHORT_DELAY}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The failure a background job raises when nobody opened anything. The story raises it from the trigger and a transient notice straight from the module, outside any component, then waits for the transient to leave: the failure is still there after a delay that already emptied its neighbour, because it holds until the reader closes it. Check that the error mark alone carries the destructive colour role, on a notice surface drawn no louder than any other. While nobody has focused the surface, the urgent announcement is the library's hidden mirror and the drawn notice stays out of the accessibility tree, so the title is announced once rather than twice; a Tab to the close control puts the notice back in the tree, with a visible ring, and Enter takes it off screen and runs the `onClose` the raise was handed. Pick `Default` for the notice that leaves on its own, `Dismissing` for the gesture, `LongContent` for a failure whose strings run past the notice width. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const announcement = await screen.findByRole("alert")
		await expect(announcement).toHaveTextContent(FAILURE.title)

		const notice = await failureNotice()
		await atTopCentre(notice)

		const mark = markOf(notice)
		await expect(getComputedStyle(mark).color).toBe(destructiveRole())
		await expect(getComputedStyle(mark).color).not.toBe(
			getComputedStyle(notice).backgroundColor,
		)

		const announced = screen.getAllByText(FAILURE.title, {
			ignore: '[aria-hidden="true"], [aria-hidden="true"] *',
		})
		await expect(announced).toHaveLength(1)
		await expect(announcement).toContainElement(announced[0])

		raiseTransientNotice(SAVED)
		await within(viewport()).findByText(SAVED.title)
		await waitFor(
			() => expect(within(viewport()).queryByText(SAVED.title)).toBe(null),
			{ timeout: SHORT_DELAY + 4000 },
		)

		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		const close = closeControl()
		await waitFor(async () => {
			await userEvent.tab()
			await expect(close).toHaveFocus()
		})
		await expect(close.matches(":focus-visible")).toBe(true)
		await expect(close).toHaveAccessibleName("Close notice")
		await expect(await screen.findByRole("alertdialog")).toHaveAccessibleName(
			FAILURE.title,
		)
		await expect(screen.queryByRole("alert")).toBe(null)

		await userEvent.keyboard("{Enter}")
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
		await expect(closedFailure).toHaveBeenCalled()
	},
})

const OTHER_FAILURE: NoticeMessage = {
	title: "Routine could not save",
	description: "The disk was full. Nothing was written.",
}

const closedRepeatedFailure = fn()

const cardsOnSurface = () =>
	viewport().querySelectorAll<HTMLElement>("[data-slot=toast]")

const cardCarrying = (title: string) => {
	const card = within(viewport())
		.getByText(title)
		.closest<HTMLElement>("[data-slot=toast]")
	if (!card) throw new window.Error(`No notice carries ${title}`)

	return card
}

const closeCardCarrying = (title: string) => {
	const close = cardCarrying(title).querySelector<HTMLElement>(
		"[data-slot=toast-close]",
	)
	if (!close) throw new window.Error(`The ${title} notice has no close control`)

	return close
}

export const RepeatedFailure = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() =>
				raiseFailureNotice({ ...FAILURE, onClose: closedRepeatedFailure })
			}
			transientDelay={SHORT_DELAY}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same failure raised again while its card is still on the surface. The story clicks the trigger five times and keeps one card, its repeats handing back the identifier of that card; a failure differing in its text adds a second card; closing the first runs the `onClose` of the first raise once, and raising it again brings the card back. A failure is only matched against failures: two identical transients still add two cards, and a failure carrying the same text as a transient adds its own card.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Run the routine" })
		for (const _ of [1, 2, 3, 4, 5]) await userEvent.click(trigger)

		await opaque(cardCarrying(FAILURE.title))
		await expect(cardsOnSurface()).toHaveLength(1)

		const kept = raiseFailureNotice(FAILURE)
		await expect(raiseFailureNotice(FAILURE)).toBe(kept)
		await expect(cardsOnSurface()).toHaveLength(1)

		raiseFailureNotice(OTHER_FAILURE)
		await within(viewport()).findByText(OTHER_FAILURE.title)
		await expect(cardsOnSurface()).toHaveLength(2)

		await userEvent.click(closeCardCarrying(FAILURE.title))
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(1))
		await expect(closedRepeatedFailure).toHaveBeenCalledOnce()

		await userEvent.click(trigger)
		await within(viewport()).findByText(FAILURE.title)
		await expect(cardsOnSurface()).toHaveLength(2)

		await userEvent.click(closeCardCarrying(FAILURE.title))
		await userEvent.click(closeCardCarrying(OTHER_FAILURE.title))
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(0))

		raiseTransientNotice(SAVED)
		raiseTransientNotice(SAVED)
		raiseFailureNotice(SAVED)
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(3))
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(1), {
			timeout: SHORT_DELAY + 4000,
		})
		await expect(cardCarrying(SAVED.title)).toHaveAttribute(
			"data-type",
			"error",
		)

		await userEvent.click(closeCardCarrying(SAVED.title))
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(0))
	},
})

export const FailuresOfTwoCauses = meta.story({
	tags: ["test-only"],
	render: () => <NoticeDemo label="Run the routine" raise={() => undefined} />,
	play: async () => {
		const kept = raiseFailureNotice({ ...FAILURE, cause: "folder-unreadable" })
		await expect(
			raiseFailureNotice({ ...FAILURE, cause: "folder-unreadable" }),
		).toBe(kept)
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(1))

		raiseFailureNotice({ ...FAILURE, cause: "disk-full" })
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(2))

		for (const card of cardsOnSurface()) {
			const close = card.querySelector<HTMLElement>("[data-slot=toast-close]")
			close?.click()
		}
		await waitFor(() => expect(cardsOnSurface()).toHaveLength(0))
	},
})

const retry = fn()

export const WithAction = meta.story({
	tags: ["test-only"],
	render: () => (
		<NoticeDemo
			label="Sync the folder"
			raise={() =>
				raiseTransientNotice({
					...SAVED,
					action: { label: RETRY_LABEL, onPress: retry },
					type: "warning",
				})
			}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A notice carrying an action, the one shape a caller adds when the reader can answer the report. Check that the control wears the caller's label, sits between the text and the close control so the close stays the last stop on the way out, and that pressing it runs the caller's handler and takes the notice off screen - the library performs the action and leaves the notice standing on its own. Pick `Default` for the same notice without an action.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		retry.mockClear()

		await userEvent.click(
			canvas.getByRole("button", { name: "Sync the folder" }),
		)

		const notice = await screen.findByRole("dialog")
		await opaque(notice)

		const action = within(notice).getByRole("button", { name: RETRY_LABEL })
		const close = closeControl()
		await expect(
			action.compareDocumentPosition(close) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			within(notice).getByText(SAVED.title).compareDocumentPosition(action) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()

		await userEvent.click(action)
		await expect(retry).toHaveBeenCalledOnce()
		await waitFor(() =>
			expect(within(viewport()).queryByText(SAVED.title)).toBe(null),
		)
	},
})

const copyControl = (notice: HTMLElement) =>
	within(notice).queryByRole("button", { name: COPY_LABEL, hidden: true })

const pressedCopy = async (
	canvas: HTMLElement,
	userEvent: UserEventObject,
	title = FAILURE.title,
) => {
	await userEvent.click(
		within(canvas).getByRole("button", { name: "Run the routine" }),
	)
	await within(viewport()).findByText(title)
	const notice = await opaque(cardCarrying(title))
	const copy = copyControl(notice)
	if (!copy) throw new window.Error("The notice carries no Copy control")
	await userEvent.click(copy)

	return { copy, notice }
}

const ReportedFailureDemo = () => (
	<NoticeDemo
		label="Run the routine"
		raise={() => raiseFailureNotice({ ...FAILURE, report: REPORT })}
	/>
)

export const WithReport = meta.story({
	render: () => <ReportedFailureDemo />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure carrying a debug report, which draws a Copy control between the text and the close control. Pressing it puts the report on the clipboard as plain text a coding agent can read: a heading line, the notice description, then one `Label: value` line per field the report holds, in a fixed order, the absent ones left out. The notice title stays on screen but never enters the copy, since it can carry a companion name. The notice stays open after the copy. This report carries none of the Specs, Context and Log groups, so it holds no warning line and no section header. A failure raised without a report draws no Copy control at all. Pick `WithReportAndAction` for the same report beside a Retry, `ReportCopied` for the label the control wears right after a copy.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		raiseFailureNotice(OTHER_FAILURE)
		await within(viewport()).findByText(OTHER_FAILURE.title)
		await opaque(cardCarrying(OTHER_FAILURE.title))
		await expect(copyControl(cardCarrying(OTHER_FAILURE.title))).toBe(null)

		const { copy, notice } = await pressedCopy(canvasElement, userEvent)

		await expect(writeText).toHaveBeenCalledOnce()
		await expect(writeText).toHaveBeenCalledWith(REPORT_TEXT)

		await expect(notice.querySelector("[data-slot=toast-action]")).toBe(null)
		await expect(
			within(notice).getByText(FAILURE.title).compareDocumentPosition(copy) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			copy.compareDocumentPosition(closeCardCarrying(FAILURE.title)) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		writeText.mockRestore()
	},
})

export const WithFullReport = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice({ ...FAILURE, report: FULL_REPORT })}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure carrying all three groups and the last 200 lines of the log. The notice looks exactly like `WithReport`; only the copy grows. Check that it opens with the heading, then the warning to review it before sharing, then the description, then `-- Specs`, `-- Context` and `-- Log (last 200 lines of <path>)` in that order, each log line kept verbatim on its own line. Pick `WithSpecsOnlyReport` for a report holding one group, `WithReport` for one holding none.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await pressedCopy(canvasElement, userEvent)

		await expect(writeText).toHaveBeenCalledOnce()
		const lines = (writeText.mock.calls[0]?.[0] ?? "").split("\n")
		const order = [
			REPORT_WARNING,
			"-- Specs",
			"-- Context",
			`-- Log (last ${LOG_LINE_COUNT} lines of ${LOG_PATH})`,
		].map((line) => lines.indexOf(line))
		await expect(order).not.toContain(-1)
		await expect(order).toEqual([...order].sort((a, b) => a - b))
		await expect(lines.slice(-LOG_LINE_COUNT)).toEqual(LONG_LOG)

		writeText.mockRestore()
	},
})

export const WithSpecsOnlyReport = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice({ ...FAILURE, report: { specs: SPECS } })}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure whose report holds the Specs group and nothing else. Check that the copy still carries the warning, then the Specs block, and that neither a Context nor a Log header is written for a group that is absent. Pick `WithFullReport` for all three groups.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await pressedCopy(canvasElement, userEvent)

		await expect(writeText).toHaveBeenCalledOnce()
		const text = writeText.mock.calls[0]?.[0] ?? ""
		await expect(text).toContain(
			`${REPORT_WARNING}\n${FAILURE.description}\n-- Specs\n`,
		)
		await expect(text).not.toContain("-- Context")
		await expect(text).not.toContain("-- Log")

		writeText.mockRestore()
	},
})

const retryReported = fn()

const settledRing = async (control: HTMLElement) => {
	await Promise.all(control.getAnimations().map(({ finished }) => finished))

	return getComputedStyle(control).boxShadow
}

const LongReportedFailureDemo = () => (
	<NoticeDemo
		label="Run the routine"
		raise={() =>
			raiseFailureNotice({
				...LONG_FAILURE,
				action: { label: RETRY_LABEL, onPress: retryReported },
				report: REPORT,
			})
		}
	/>
)

export const WithReportAndAction = meta.story({
	globals: { viewport: { value: "narrow" } },
	render: () => <LongReportedFailureDemo />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"A failure carrying both a report and a Retry, on a 320px window with an unbreakable title and a several-sentence description. Check that the order runs Retry, Copy, close, that all three stay inside the notice and the window, that Copy wears the same outline button, height and focus ring as Retry and is reached by Tab between them, that Copy leaves the notice open, and that Retry still runs its handler and ends the notice. Pick `WithReport` for the report alone.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		retryReported.mockClear()
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await expect(window.innerWidth).toBe(NARROW_WIDTH)
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const notice = await failureNotice()
		const action = actionControl()
		const copy = copyControl(notice)
		const close = closeControl()
		if (!action || !copy) throw new window.Error("A control is missing")

		await expect(
			action.compareDocumentPosition(copy) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			copy.compareDocumentPosition(close) &
				window.Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()

		const noticeBox = notice.getBoundingClientRect()
		for (const control of [action, copy, close]) {
			const box = control.getBoundingClientRect()
			await expect(box.left).toBeGreaterThanOrEqual(noticeBox.left)
			await expect(box.right).toBeLessThanOrEqual(noticeBox.right)
			await expect(box.right).toBeLessThanOrEqual(window.innerWidth)
			await expect(box.width).toBeGreaterThanOrEqual(24)
			await expect(box.height).toBeGreaterThanOrEqual(24)
		}

		await expect(copy).toHaveAttribute("data-slot", "button")
		await expect(copy.offsetHeight).toBe(action.offsetHeight)
		await expect(getComputedStyle(copy).fontSize).toBe(
			getComputedStyle(action).fontSize,
		)
		await expect(getComputedStyle(copy).borderTopWidth).toBe(
			getComputedStyle(action).borderTopWidth,
		)

		await waitFor(async () => {
			await userEvent.tab()
			await expect(action).toHaveFocus()
		})
		const actionRing = await settledRing(action)
		await userEvent.tab()
		await expect(copy).toHaveFocus()
		await expect(copy.matches(":focus-visible")).toBe(true)
		await expect(await settledRing(copy)).toBe(actionRing)

		await userEvent.keyboard("{Enter}")
		await expect(writeText).toHaveBeenCalledOnce()
		await expect(within(viewport()).getByText(LONG_FAILURE.title)).toBeVisible()

		await userEvent.click(action)
		await expect(retryReported).toHaveBeenCalledOnce()
		await waitFor(() =>
			expect(within(viewport()).queryByText(LONG_FAILURE.title)).toBe(null),
		)

		writeText.mockRestore()
	},
})

const copyLayout = (copy: HTMLElement, notice: HTMLElement) => ({
	control: copy.getBoundingClientRect().width,
	text:
		within(notice)
			.getByText(LONG_FAILURE.title)
			.parentElement?.getBoundingClientRect().width ?? 0,
	notice: notice.getBoundingClientRect().height,
})

export const ReportCopied = meta.story({
	globals: { viewport: { value: "narrow" } },
	render: () => <LongReportedFailureDemo />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"The Copy control right after a copy landed, on the 320px window of `WithReportAndAction`: it reads Copied for as long as the copy hook reports it, then goes back to Copy on its own, the notice open throughout. Both labels share one cell, so the control keeps the width of the longer one, and neither the text column nor the notice moves when it switches; the label not shown is hidden from assistive technology, so the control is named Copied and nothing else. Pick `WithReport` for the control at rest.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await expect(window.innerWidth).toBe(NARROW_WIDTH)
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)
		const notice = await failureNotice()
		const copy = copyControl(notice)
		if (!copy) throw new window.Error("The notice carries no Copy control")

		const before = copyLayout(copy, notice)
		await userEvent.click(copy)

		await expect(copy).toHaveAccessibleName("Copied")
		await expect(copyLayout(copy, notice)).toEqual(before)

		await waitFor(() => expect(copy).toHaveAccessibleName(COPY_LABEL), {
			timeout: 4000,
		})
		await expect(copyLayout(copy, notice)).toEqual(before)
		await expect(within(viewport()).getByText(LONG_FAILURE.title)).toBeVisible()

		writeText.mockRestore()
	},
})

export const ReportCopyRejected = meta.story({
	tags: ["test-only"],
	render: () => <ReportedFailureDemo />,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The clipboard refuses the write. Check that the reported notice stays open, that its control still reads Copy, and that the refusal surfaces as its own failure notice rather than vanishing.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new window.Error("Clipboard write denied"),
		)

		const { copy } = await pressedCopy(canvasElement, userEvent)

		const refusal = "Couldn’t copy the report. Press Copy again."
		await within(viewport()).findByText(refusal)
		await opaque(cardCarrying(refusal))
		await expect(copy).toHaveAccessibleName(COPY_LABEL)
		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		writeText.mockRestore()
	},
})

export const ReportFromLocalSide = meta.story({
	tags: ["test-only"],
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() =>
				raiseFailureNotice({ ...FAILURE, report: { ...REPORT, side: "local" } })
			}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure raised on this machine rather than on a Space host or member. Check that the copied report reads `Side: local` on the line where the other side values land.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await pressedCopy(canvasElement, userEvent)

		await expect(writeText).toHaveBeenCalledOnce()
		await expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining("Side: local"),
		)

		writeText.mockRestore()
	},
})

const COMPANION_NAME = "Ada"

const COMPANION_FAILURE: NoticeMessage = {
	title: `Couldn’t reopen ${COMPANION_NAME}’s session`,
	description: "The session file was not readable. Nothing was changed.",
}

export const ReportWithoutCompanionName = meta.story({
	tags: ["test-only"],
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice({ ...COMPANION_FAILURE, report: REPORT })}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure whose title names a companion. Check that the title still reads in full on screen and that the copied report holds no occurrence of the companion name.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await pressedCopy(canvasElement, userEvent, COMPANION_FAILURE.title)

		await expect(writeText).toHaveBeenCalledOnce()
		await expect(writeText).not.toHaveBeenCalledWith(
			expect.stringContaining(COMPANION_NAME),
		)
		await expect(
			within(viewport()).getByText(COMPANION_FAILURE.title),
		).toBeVisible()

		writeText.mockRestore()
	},
})

export const Stacked = meta.story({
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Four failures raised in a row from the module itself, three drawn. Reach for this when several jobs fail at once: check that the surface draws no more than three notices, that the one that no longer fits is the oldest, and that the newest sits nearest the top edge with the older ones peeking below it, so a reader's eye lands on what just happened rather than on what they already read. The `aria-hidden-focus` audit is left to review here for the same reason as in `LongContent`: three urgent notices sit unfocused, hidden from the accessibility tree by the library while their mirrors do the announcing. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async () => {
		for (const notice of STACK) {
			raiseFailureNotice(notice)
			await within(viewport()).findByText(notice.title)
		}

		await waitFor(() => expect(noticesOnScreen()).toHaveLength(3))
		await Promise.all(noticesOnScreen().map(opaque))

		const onScreen = noticesOnScreen()
		await expect(onScreen[0]).toHaveTextContent(STACK[3].title)
		await expect(onScreen[1]).toHaveTextContent(STACK[2].title)
		await expect(onScreen[2]).toHaveTextContent(STACK[1].title)
		const dropped = within(viewport())
			.getByText(STACK[0].title)
			.closest("[data-slot=toast]")
		await expect(dropped).toHaveAttribute("data-limited")

		await atTopCentre(onScreen[0])

		const tops = onScreen.map((notice) => notice.getBoundingClientRect().top)
		await expect(tops[0]).toBeLessThan(tops[1])
		await expect(tops[1]).toBeLessThan(tops[2])
	},
})

export const Marks = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"One notice per remaining type, raised from the module: `info`, `warning` and `loading`. Check that each carries its own mark from the icon registry rather than a shared glyph, and that the loading mark turns while the work it reports is still running, unless the reader asked the system to stop moving things, in which case it stands still. `Default` carries the `success` mark and `Error` the `error` one, which completes the vendored set of five.",
			},
		},
	},
	play: async () => {
		for (const type of MARKED_TYPES) {
			raiseTransientNotice({ title: `A ${type} notice`, type })
			await within(viewport()).findByText(`A ${type} notice`)
		}

		await waitFor(() => expect(noticesOnScreen()).toHaveLength(3))
		await Promise.all(noticesOnScreen().map(opaque))

		const marks = noticesOnScreen().map(markOf)
		const glyphs = new window.Set(marks.map((mark) => mark.innerHTML))
		await expect(glyphs.size).toBe(MARKED_TYPES.length)

		const loading = markOf(noticesOnScreen()[0])
		const asksForStillness = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches
		await expect(getComputedStyle(loading).animationName).toBe(
			asksForStillness ? "none" : "spin",
		)
	},
})

export const Loading = meta.story({
	tags: ["test-only"],
	render: () => <NoticeSurface transientDelay={SHORT_DELAY} />,
	parameters: {
		docs: {
			description: {
				story:
					"The one transient notice that does not leave on its own: the library never schedules a dismissal for a `loading` type, so the work it reports decides when the notice ends. The story raises it from the module, keeps the identifier the raise handed back, then raises and outlives a second transient to show the delay passing without touching it, calls `endNotice` with an identifier nothing carries to show the surface untouched, and finally ends the notice it owns.",
			},
		},
	},
	play: async () => {
		const id = raiseTransientNotice({ title: WORKING, type: "loading" })
		await within(viewport()).findByText(WORKING)

		raiseTransientNotice(SAVED)
		await within(viewport()).findByText(SAVED.title)
		await waitFor(
			() => expect(within(viewport()).queryByText(SAVED.title)).toBe(null),
			{ timeout: SHORT_DELAY + 4000 },
		)
		await expect(within(viewport()).getByText(WORKING)).toBeVisible()

		endNotice("notice-that-was-never-raised")
		await expect(within(viewport()).getByText(WORKING)).toBeVisible()

		endNotice(id)
		await waitFor(() =>
			expect(within(viewport()).queryByText(WORKING)).toBe(null),
		)
	},
})

export const LongContent = meta.story({
	render: () => (
		<NoticeDemo
			label="Report the long failure"
			raise={() =>
				raiseFailureNotice({
					...LONG_FAILURE,
					action: { label: RETRY_LABEL, onPress: fn() },
				})
			}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A failure whose title is one unbreakable word and whose description runs several sentences, carrying an action on top. Check that both strings wrap inside the notice instead of pushing it wider than the window, and that the mark, the action control and the close control keep their own columns, still fully inside the notice and still 24 CSS pixels of hit area. The `aria-hidden-focus` audit is left to review here: the library keeps an urgent notice out of the accessibility tree until the surface is focused, so that its hidden mirror announces it once, and the close control stays in the tab order meanwhile. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Report the long failure" }),
		)

		const notice = await failureNotice()
		const close = closeControl()
		const action = actionControl()
		const mark = markOf(notice)

		await expect(close).toHaveAttribute("aria-label", "Close notice")

		const noticeBox = notice.getBoundingClientRect()
		const closeBox = close.getBoundingClientRect()

		await expect(noticeBox.right).toBeLessThanOrEqual(window.innerWidth)
		await expect(noticeBox.left).toBeGreaterThanOrEqual(0)
		await expect(closeBox.right).toBeLessThanOrEqual(noticeBox.right)
		await expect(closeBox.width).toBeGreaterThanOrEqual(24)
		await expect(closeBox.height).toBeGreaterThanOrEqual(24)
		await expect(mark.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			noticeBox.left,
		)
		await expect(action?.getBoundingClientRect().right).toBeLessThanOrEqual(
			closeBox.left,
		)
		await expect(
			within(viewport()).getByText(LONG_FAILURE.title).scrollWidth,
		).toBeLessThanOrEqual(Math.ceil(noticeBox.width))
	},
})

export const Dismissing = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice(FAILURE)}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The pointer way out. Notices are anchored to the top edge, so they leave through it: a drag toward the top of the window dismisses, a drag back toward the middle snaps the notice into place and keeps it. Reach for this when checking that the gesture points at the nearest edge rather than dragging the notice across the surface. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const notice = await failureNotice()

		await swipe(notice, userEvent, { y: SWIPE_DISTANCE })
		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		await swipe(notice, userEvent, { y: -SWIPE_DISTANCE })
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
	},
})

export const WithDialog = meta.story({
	render: () => (
		<>
			<DialogRoot>
				<Trigger className={buttonVariants({ variant: "outline" })}>
					Companion settings
				</Trigger>
				<DialogSurface>
					<DialogTitle>Companion settings</DialogTitle>
					<DialogDescription>
						Name the companion, point it at a folder and tell it how to behave.
					</DialogDescription>
				</DialogSurface>
			</DialogRoot>
			<NoticeSurface />
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A background failure raised while a modal dialog holds the window - the moment the surface exists for. The dialog dims the page and takes pointer interaction away from everything behind it, so the notice viewport draws above it and takes its own pointer events back: check that the notice is the topmost element under its own centre, that its close control dismisses it, and that the dialog is still open and untouched afterwards. Focus stays trapped in the dialog while it is open, so the notice is reachable here by pointer, not by Tab. The dialog hides the rest of the document from the accessibility tree and spares only what carries a live region: the viewport carries one and stays in the tree, but the library's hidden urgent announcement is a separate element beside it and does not, so a failure whose announcement was already on screen when the dialog opened is never read to a screen reader while the dialog stays open. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Companion settings" }),
		)
		const dialog = await screen.findByRole("dialog")
		await waitFor(() => expect(dialog).toBeVisible())

		raiseFailureNotice(FAILURE)
		const notice = await failureNotice()

		await waitFor(async () => {
			const box = notice.getBoundingClientRect()
			const topmost = document.elementFromPoint(
				box.left + box.width / 2,
				box.top + box.height / 2,
			)

			await expect(notice.contains(topmost)).toBe(true)
		})
		await expect(isInaccessible(viewport())).toBe(false)

		await userEvent.click(closeControl())
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
		await expect(dialog).toBeVisible()
	},
})

export const DarkTheme = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() =>
				raiseFailureNotice({
					...FAILURE,
					action: { label: RETRY_LABEL, onPress: fn() },
				})
			}
		/>
	),
	globals: { theme: "dark" },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The same failure under the dark theme, where the notice surface is the lightest thing on screen rather than the darkest. Check that the error mark still resolves to the destructive role and that neither it nor the close control falls back to the notice's own background colour. The `aria-hidden-focus` audit is left to review here for the reason given in `LongContent`. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const notice = await failureNotice()
		const surface = getComputedStyle(notice).backgroundColor
		const mark = markOf(notice)

		await expect(getComputedStyle(mark).color).toBe(destructiveRole())
		await expect(getComputedStyle(mark).color).not.toBe(surface)
		await expect(getComputedStyle(closeControl()).color).not.toBe(surface)
	},
})

export const ReducedMotion = meta.story({
	render: () => (
		<NoticeDemo
			label="Report the reduced-motion failure"
			raise={() => raiseFailureNotice(FAILURE)}
		/>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The same failure raised for a reader who asked the system to stop moving things. The registry toast travels a notice in through the top edge and scales the ones stacked behind it; the surface drops both under `prefers-reduced-motion` and fades instead, keeping the opacity transition so the library still hears the end event it unmounts on. Check the notice transitions opacity and nothing else, and that it is already at its resting place and its resting height on the frame it appears - a notice that travels is the one thing a reader who asked for stillness cannot look away from. The app assembles it at `apps/app/src/App.tsx:1240`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", {
				name: "Report the reduced-motion failure",
			}),
		)

		const notice = await screen.findByRole("alertdialog", { hidden: true })
		const raised = notice.getBoundingClientRect()

		await expect(getComputedStyle(notice).transitionProperty).toBe("opacity")

		await opaque(notice)
		const rested = notice.getBoundingClientRect()

		await expect(rested.top).toBe(raised.top)
		await expect(rested.height).toBe(raised.height)
	},
})

const INVITED_ARTBOARD =
	"Measured against the Paper page `Join an invited Space`, dark only."

const SPACES_ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only."

const BANNER_GAP =
	"The artboard draws an inline banner in place of the composer, where the app raises this toast on the notice surface."

const REMOVING_HOST = "Noa"

const REMOVED_SPACE = "Studio"

type HeldInfoNoticeProps = {
	title: string
	description?: string
}

const HeldInfoNotice = ({ title, description }: HeldInfoNoticeProps) => {
	useEffect(() => {
		const id = raiseTransientNotice({ type: "info", title, description })
		return () => endNotice(id)
	}, [description, title])

	return <NoticeSurface transientDelay={0} />
}

const RemovedFromSpaceNotice = () => {
	const { t } = useTranslation("bots")

	return (
		<HeldInfoNotice
			description={t("spaces.removed.memberNoticeDescription", {
				host: REMOVING_HOST,
			})}
			title={t("spaces.removed.memberNotice", { name: REMOVED_SPACE })}
		/>
	)
}

const SpaceDeletedNotice = () => {
	const { t } = useTranslation("bots")

	return (
		<HeldInfoNotice
			description={t("spaces.removed.deletedNoticeDescription")}
			title={t("spaces.removed.deletedNotice", {
				host: REMOVING_HOST,
				name: REMOVED_SPACE,
			})}
		/>
	)
}

const RemovedForAnUnknownReasonNotice = () => {
	const { t } = useTranslation("bots")

	return (
		<HeldInfoNotice
			description={t("spaces.removed.noticeDescription", {
				host: REMOVING_HOST,
			})}
			title={t("spaces.removed.notice", {
				host: REMOVING_HOST,
				name: REMOVED_SPACE,
			})}
		/>
	)
}

const SignedOutNotice = () => {
	const { t } = useTranslation("bots")

	return (
		<HeldInfoNotice
			title={t("spaces.signOut.notice", { name: "Studio Nord" })}
		/>
	)
}

const expectInfoNoticeClosing = async (
	title: string,
	userEvent: UserEventObject,
	description?: string,
) => {
	const notice = await within(viewport()).findByText(title)
	const toast = notice.closest<HTMLElement>("[data-slot=toast]")
	if (!toast) throw new window.Error("The notice is not on the surface")
	await opaque(toast)
	await expect(notice).toBeVisible()
	await expect(toast).toHaveAttribute("data-type", "info")
	if (description !== undefined) {
		await expect(toast).toHaveAccessibleDescription(description)
	}
	await expect(actionControl()).toBe(null)
	await userEvent.click(closeControl())
	await waitFor(() => expect(within(viewport()).queryByText(title)).toBe(null))
}

export const M8RemovedFromSpace = meta.story({
	name: "8 Removed from Space",
	globals: { theme: "dark" },
	render: () => <RemovedFromSpaceNotice />,
	parameters: {
		docs: {
			description: {
				story: `${SPACES_ARTBOARD} Row 8: the host removed the reader from a joined Space. ${BANNER_GAP} Check the info notice names the Space, says the conversations left this device, points to the host for a new invitation, and carries a close control and no action. Pick \`SpaceDeleted\` for a Space its host deleted.`,
			},
		},
	},
	play: async ({ userEvent }) => {
		await expectInfoNoticeClosing(
			"You’re no longer a member of Studio",
			userEvent,
			"Its conversations aren’t on this device anymore. Ask Noa for a new invitation.",
		)
	},
})

export const SpaceDeleted = meta.story({
	name: "8.1 Space deleted",
	globals: { theme: "dark" },
	render: () => <SpaceDeletedNotice />,
	parameters: {
		docs: {
			description: {
				story: `${SPACES_ARTBOARD} Row 8.1: the host deleted a Space the reader had joined. ${BANNER_GAP} Check the info notice names the host and the Space, says the conversations left this device, and carries a close control and no action. Pick \`M8RemovedFromSpace\` for a Space that still exists.`,
			},
		},
	},
	play: async ({ userEvent }) => {
		await expectInfoNoticeClosing(
			"Noa deleted Studio",
			userEvent,
			"Its conversations aren’t on this device anymore.",
		)
	},
})

export const RemovedReasonUnknown = meta.story({
	name: "Removed, reason unknown",
	globals: { theme: "dark" },
	render: () => <RemovedForAnUnknownReasonNotice />,
	parameters: {
		docs: {
			description: {
				story: `No artboard draws this reason; it reuses the data of rows 8 and 8.1 on the Paper page \`Mockup\` of \`Kiroshi, E2E Spaces v2\`, dark only. ${BANNER_GAP} The joined Space left this computer for a reason the host did not name. Check the info notice names the host and the Space, says the conversations stay with the host, and carries a close control and no action. Pick \`M8RemovedFromSpace\` or \`SpaceDeleted\` for a named reason.`,
			},
		},
	},
	play: async ({ userEvent }) => {
		await expectInfoNoticeClosing(
			"Noa removed you from Studio.",
			userEvent,
			"It’s gone from your spaces. Its conversations stay on Noa’s Kiroshi.",
		)
	},
})

export const M13SignedOut = meta.story({
	name: "M13 Signed out",
	globals: { theme: "dark" },
	render: () => <SignedOutNotice />,
	parameters: {
		docs: {
			description: {
				story: `${INVITED_ARTBOARD} M13: the info notice raised once signing out took a joined Space off this computer, drawn on this surface with its close control and no action.`,
			},
		},
	},
	play: async ({ userEvent }) => {
		await expectInfoNoticeClosing(
			"Signed out. Studio Nord left this computer.",
			userEvent,
		)
	},
})

const REMOVAL_TITLE = "Steve removed you from Studio."

const REMOVAL_DESCRIPTION =
	"It’s gone from your spaces. Its conversations stay on Steve’s Kiroshi."

const RemovalNotice = () => {
	const { t } = useTranslation("bots")
	const title = t("spaces.removed.notice", {
		host: "Steve",
		name: "Studio",
	})
	const description = t("spaces.removed.noticeDescription", { host: "Steve" })

	useEffect(() => {
		const id = raiseTransientNotice({
			description,
			spaceColour: "orange",
			title,
			type: "info",
		})
		return () => endNotice(id)
	}, [description, title])

	return <NoticeSurface transientDelay={0} />
}

export const RemovedWithSpaceMark = meta.story({
	name: "Removed with the space mark",
	globals: { theme: "dark" },
	render: () => <RemovalNotice />,
	parameters: {
		docs: {
			description: {
				story:
					"Measured against the Paper page `Iteration 5` of `Kiroshi, Invitations`, artboard 5.8, dark only. A host removed the reader from a joined space, so the notice carries that space's colour as a 10px square outline, 1.5px on a 3px radius, in place of the info glyph, over who removed them and where the conversations stay. Check the mark is decorative and drawn in the space's tint, and that the body sits in the muted foreground. Pick `M8RemovedFromSpace` for the title-only notice with the info glyph.",
			},
		},
	},
	play: async () => {
		const title = await within(viewport()).findByText(REMOVAL_TITLE)
		const notice = title.closest<HTMLElement>("[data-slot=toast]")
		if (!notice) throw new window.Error("The notice is not on the surface")
		await opaque(notice)
		await expect(notice).toHaveAccessibleDescription(REMOVAL_DESCRIPTION)

		const mark = notice.querySelector<HTMLElement>(
			"[data-slot=notice-space-mark]",
		)
		if (!mark) throw new window.Error("The notice carries no space mark")
		const style = getComputedStyle(mark)
		await expect(mark).toHaveAttribute("aria-hidden", "true")
		await expect(slotIn(notice, "toast-content").firstElementChild).toBe(mark)
		await expect(mark.getBoundingClientRect().width).toBe(10)
		await expect(mark.getBoundingClientRect().height).toBe(10)
		await expect(style.borderTopLeftRadius).toBe("3px")
		await expect(style.boxShadow).toContain("1.5px")
		await expect(style.boxShadow).toContain(style.color)
		await expect(mark.style.color).toBe("var(--bot-blot-orange)")
		await expect(
			getComputedStyle(within(notice).getByText(REMOVAL_DESCRIPTION)).color,
		).toBe("rgb(163, 163, 163)")
	},
})

const ASKING_DEVICE = "Noa’s iPhone 17"

type HeldDeviceNoticeProps = {
	title: string
	description: string
}

const HeldDeviceNotice = ({ title, description }: HeldDeviceNoticeProps) => {
	useEffect(() => {
		const id = raiseTransientNotice({ title, description })
		return () => endNotice(id)
	}, [description, title])

	return <NoticeSurface transientDelay={0} />
}

const ApprovedNotice = () => {
	const { t } = useTranslation("common")

	return (
		<HeldDeviceNotice
			description={t("devices.approval.approved.description")}
			title={t("devices.approval.approved.title", { device: ASKING_DEVICE })}
		/>
	)
}

const RejectedNotice = () => {
	const { t } = useTranslation("common")

	return (
		<HeldDeviceNotice
			description={t("devices.approval.rejected.description")}
			title={t("devices.approval.rejected.title", { device: ASKING_DEVICE })}
		/>
	)
}

const RemovedNotice = () => {
	const { t } = useTranslation("settings")

	return (
		<HeldDeviceNotice
			description={t("account.devices.removed.description")}
			title={t("account.devices.removed.title", { device: ASKING_DEVICE })}
		/>
	)
}

const expectDeviceNotice = async (title: string, description: string) => {
	const heading = await within(viewport()).findByText(title)
	const notice = heading.closest<HTMLElement>("[data-slot=toast]")
	if (!notice) throw new window.Error("The notice is not on the surface")
	await opaque(notice)
	await atTopCentre(notice)
	await expect(notice).toHaveAttribute("data-type", "success")
	await expect(notice).toHaveAccessibleDescription(description)
	await expect(actionControl()).toBe(null)
}

export const DeviceApproved = meta.story({
	name: "6.2 Device approved",
	globals: { theme: "dark" },
	render: () => <ApprovedNotice />,
	parameters: {
		docs: {
			description: {
				story: `${SPACES_ARTBOARD} Artboard 6.2: the reader approved another device and the dialog closed. Check the success notice lands at top centre naming the device, says where to remove it, and carries no action. Pick \`DeviceRejected\` for the device the reader turned down.`,
			},
		},
	},
	play: async () => {
		await expectDeviceNotice(
			"Noa’s iPhone 17 is approved",
			"It reads your spaces now. Remove it any time in Your devices.",
		)
	},
})

export const DeviceRejected = meta.story({
	name: "6.3 Device signed out",
	globals: { theme: "dark" },
	render: () => <RejectedNotice />,
	parameters: {
		docs: {
			description: {
				story: `${SPACES_ARTBOARD} Artboard 6.3: the reader answered Not me. Check the notice says the device was signed out and never read the spaces. Pick \`DeviceRemoved\` for a device removed after it had access.`,
			},
		},
	},
	play: async () => {
		await expectDeviceNotice(
			"Noa’s iPhone 17 was signed out",
			"It never read your spaces.",
		)
	},
})

export const DeviceRemoved = meta.story({
	name: "7.3 Device removed",
	globals: { theme: "dark" },
	render: () => <RemovedNotice />,
	parameters: {
		docs: {
			description: {
				story: `${SPACES_ARTBOARD} Artboard 7.3: the reader removed a device from Your devices. Check the notice says it was signed out and no longer reads the spaces. Pick \`DeviceRejected\` for a device that never had access.`,
			},
		},
	},
	play: async () => {
		await expectDeviceNotice(
			"Noa’s iPhone 17 was signed out",
			"It doesn’t read your spaces anymore.",
		)
	},
})
