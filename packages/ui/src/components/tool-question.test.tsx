// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Icons } from "@workspace/ui/components/icons"
import {
	ToolQuestion,
	type ToolQuestionItem,
	type ToolQuestionNotice,
	type ToolQuestionProps,
} from "@workspace/ui/components/tool-question"
import { chat } from "@workspace/ui/lib/i18n-en/chat"

const PLAN: ToolQuestionItem = {
	question: "Which plan should Northwind start on?",
	header: "Plan",
	options: [
		{ label: "Starter", description: "One seat." },
		{ label: "Team", description: "Ten seats." },
		{ label: "Enterprise", description: "Every seat." },
	],
}

const CHANNELS: ToolQuestionItem = {
	question: "Where should the launch be announced?",
	header: "Channels",
	multiSelect: true,
	options: [
		{ label: "Newsletter", description: "The monthly email." },
		{ label: "Blog", description: "A post." },
	],
	exit: { label: "Ask me later", onSelect: vi.fn() },
}

const NOTICE: ToolQuestionNotice = {
	isNotice: true,
	header: "Sentry",
	failure: { title: "Sentry refused the key" },
	action: { label: "Open Settings", icon: Icons.Settings, onSelect: vi.fn() },
}

const renderPanel = (props: ToolQuestionProps) =>
	render(
		<I18nProvider>
			<ToolQuestion {...props} />
		</I18nProvider>,
	)

const pressReturn = async (element: HTMLElement) => {
	await act(async () => {
		fireEvent.keyDown(element, { key: "Enter" })
	})
}

describe("ToolQuestion hint", () => {
	afterEach(cleanup)

	it("reads only the Return part while no digit keys are wired", () => {
		renderPanel({ questions: [PLAN] })

		expect(screen.getByText("Return to send")).toBeTruthy()
		expect(screen.queryByText(/^Press /)).toBeNull()
	})

	it("names the digit range once the digit keys are wired", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		expect(
			screen.getByText("Press 1\u20133 to choose, Return to send"),
		).toBeTruthy()
	})
})

const pressKey = (init: KeyboardEventInit) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	})
	act(() => {
		document.body.dispatchEvent(event)
	})
	return event
}

const checkedLabels = () =>
	screen
		.queryAllByRole("radio")
		.filter((row) => row.getAttribute("aria-checked") === "true")
		.map((row) => row.textContent)

describe("ToolQuestion digit keys", () => {
	afterEach(cleanup)

	it("picks the radio of the bare digit and prevents its default", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		const event = pressKey({ key: "2" })

		expect(event.defaultPrevented).toBe(true)
		expect(
			screen.getByRole("radio", { name: "Team" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("keeps the held radio when its digit is pressed again", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		pressKey({ key: "2" })
		pressKey({ key: "2" })

		expect(
			screen.getByRole("radio", { name: "Team" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("moves a single-select pick on to the next waiting question", () => {
		renderPanel({ questions: [PLAN, CHANNELS], hasDigitKeys: true })

		pressKey({ key: "1" })

		expect(screen.getByText(CHANNELS.question)).toBeTruthy()
	})

	it("toggles a checkbox on and off with the same digit", () => {
		renderPanel({ questions: [CHANNELS], hasDigitKeys: true })
		const blog = screen.getByRole("checkbox", { name: "Blog" })

		pressKey({ key: "2" })
		expect(blog.getAttribute("aria-checked")).toBe("true")

		pressKey({ key: "2" })
		expect(blog.getAttribute("aria-checked")).toBe("false")
	})

	it.each([
		{ metaKey: true },
		{ ctrlKey: true },
		{ altKey: true },
		{ shiftKey: true },
	])("leaves the digit alone with %o held", (modifier) => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		const event = pressKey({ key: "1", ...modifier })

		expect(event.defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it("leaves a digit above the option count and every other key alone", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		for (const key of ["4", "9", "0", "a", "Enter"])
			expect(pressKey({ key }).defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it("binds no digit on a notice", () => {
		renderPanel({ questions: [NOTICE, PLAN], hasDigitKeys: true })

		expect(pressKey({ key: "1" }).defaultPrevented).toBe(false)
	})

	it("lets the digit type into the own-answer field", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })
		const field = screen.getByLabelText(chat.toolQuestion.freeText)

		const event = new KeyboardEvent("keydown", {
			key: "2",
			bubbles: true,
			cancelable: true,
		})
		act(() => {
			field.dispatchEvent(event)
		})

		expect(event.defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it.each([{ hasDigitKeys: false }, { hasDigitKeys: true, minimised: true }])(
		"binds no digit with %o",
		(props) => {
			renderPanel({ questions: [PLAN], ...props })

			expect(pressKey({ key: "1" }).defaultPrevented).toBe(false)
		},
	)

	it("removes its listener once minimised or unmounted", () => {
		const removed = vi.spyOn(window, "removeEventListener")
		const { rerender, unmount } = renderPanel({
			questions: [PLAN],
			hasDigitKeys: true,
		})

		rerender(
			<I18nProvider>
				<ToolQuestion hasDigitKeys minimised questions={[PLAN]} />
			</I18nProvider>,
		)
		expect(pressKey({ key: "1" }).defaultPrevented).toBe(false)
		expect(removed).toHaveBeenCalledWith("keydown", expect.any(Function), true)

		rerender(
			<I18nProvider>
				<ToolQuestion hasDigitKeys questions={[PLAN]} />
			</I18nProvider>,
		)
		removed.mockClear()
		unmount()
		expect(removed).toHaveBeenCalledWith("keydown", expect.any(Function), true)
		removed.mockRestore()
	})
})

describe("ToolQuestion Return on an option row", () => {
	afterEach(cleanup)

	it("sends from a chosen radio exactly as Return on the form does", async () => {
		const onAnswer = vi.fn()
		renderPanel({ questions: [PLAN], onAnswer })
		const team = screen.getByRole("radio", { name: "Team" })

		await act(async () => fireEvent.click(team))
		await pressReturn(team)

		expect(onAnswer).toHaveBeenCalledTimes(1)
		expect(onAnswer).toHaveBeenCalledWith({ [PLAN.question]: "Team" })
	})

	it("refuses an unanswered question from a radio as the form does", async () => {
		const onAnswer = vi.fn()
		renderPanel({ questions: [PLAN], onAnswer })

		await pressReturn(screen.getByRole("radio", { name: "Starter" }))

		expect(onAnswer).not.toHaveBeenCalled()
		expect(screen.getByRole("alert").textContent).toContain(
			chat.toolQuestion.blank,
		)
	})

	it("advances from a checkbox without toggling it, and sends once", async () => {
		const onAnswer = vi.fn()
		renderPanel({ questions: [CHANNELS, PLAN], onAnswer })
		const newsletter = screen.getByRole("checkbox", { name: "Newsletter" })

		await act(async () => fireEvent.click(newsletter))
		await pressReturn(newsletter)

		expect(screen.getByText(PLAN.question)).toBeTruthy()

		const team = screen.getByRole("radio", { name: "Team" })
		await act(async () => fireEvent.click(team))
		await pressReturn(team)

		expect(onAnswer).toHaveBeenCalledTimes(1)
		expect(onAnswer).toHaveBeenCalledWith({
			[CHANNELS.question]: "Newsletter",
			[PLAN.question]: "Team",
		})
	})
})

describe("ToolQuestion Return on the other controls", () => {
	afterEach(cleanup)

	it("leaves Skip, Minimize, an exit and the own-answer field to their own Return", async () => {
		const onAnswer = vi.fn()
		renderPanel({
			questions: [CHANNELS],
			onAnswer,
			onDeny: vi.fn(),
			onMinimise: vi.fn(),
		})
		await act(async () =>
			fireEvent.click(screen.getByRole("checkbox", { name: "Blog" })),
		)

		for (const control of [
			screen.getByRole("button", { name: chat.toolQuestion.skip }),
			screen.getByRole("button", { name: chat.toolQuestion.minimise }),
			screen.getByRole("button", { name: "Ask me later" }),
			screen.getByLabelText(chat.toolQuestion.freeText),
		])
			await pressReturn(control)

		expect(onAnswer).not.toHaveBeenCalled()
	})

	it("leaves the action of a notice to its own Return", async () => {
		const onAnswer = vi.fn()
		renderPanel({ questions: [NOTICE], onAnswer })

		await pressReturn(screen.getByRole("button", { name: "Open Settings" }))

		expect(onAnswer).not.toHaveBeenCalled()
	})
})
