// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { HTMLAttributes } from "react"
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

const pressKey = (init: KeyboardEventInit, target: Element = document.body) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	})
	act(() => {
		target.dispatchEvent(event)
	})
	return event
}

const digitKey = (digit: number) => ({
	key: String(digit),
	code: `Digit${digit}`,
})

const checkedLabels = () =>
	screen
		.queryAllByRole("radio")
		.filter((row) => row.getAttribute("aria-checked") === "true")
		.map((row) => row.textContent)

describe("ToolQuestion digit keys", () => {
	afterEach(cleanup)

	it("picks the radio of the bare digit and prevents its default", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		const event = pressKey(digitKey(2))

		expect(event.defaultPrevented).toBe(true)
		expect(
			screen.getByRole("radio", { name: "Team" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("keeps the held radio when its digit is pressed again", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		pressKey(digitKey(2))
		pressKey(digitKey(2))

		expect(
			screen.getByRole("radio", { name: "Team" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("moves a single-select pick on to the next waiting question", () => {
		renderPanel({ questions: [PLAN, CHANNELS], hasDigitKeys: true })

		pressKey(digitKey(1))

		expect(screen.getByText(CHANNELS.question)).toBeTruthy()
	})

	it("toggles a checkbox on and off with the same digit", () => {
		renderPanel({ questions: [CHANNELS], hasDigitKeys: true })
		const blog = screen.getByRole("checkbox", { name: "Blog" })

		pressKey(digitKey(2))
		expect(blog.getAttribute("aria-checked")).toBe("true")

		pressKey(digitKey(2))
		expect(blog.getAttribute("aria-checked")).toBe("false")
	})

	it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }])(
		"leaves the digit alone with %o held",
		(modifier) => {
			renderPanel({ questions: [PLAN], hasDigitKeys: true })

			const event = pressKey({ ...digitKey(1), ...modifier })

			expect(event.defaultPrevented).toBe(false)
			expect(checkedLabels()).toEqual([])
		},
	)

	it("leaves a digit above the option count and every other key alone", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		for (const code of [
			"Digit4",
			"Digit9",
			"Digit0",
			"Numpad0",
			"KeyA",
			"Enter",
		])
			expect(pressKey({ key: code, code }).defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it.each([
		{ layout: "AZERTY top row", key: "&", code: "Digit1" },
		{ layout: "Shift on AZERTY", key: "1", code: "Digit1", shiftKey: true },
		{ layout: "Shift on QWERTY", key: "!", code: "Digit1", shiftKey: true },
		{ layout: "numeric keypad", key: "1", code: "Numpad1" },
	])("picks by the physical key on the $layout", ({ layout: _, ...init }) => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		expect(pressKey(init).defaultPrevented).toBe(true)
		expect(checkedLabels()).toEqual([expect.stringContaining("Starter")])
	})

	it("leaves a repeated digit untouched", () => {
		renderPanel({ questions: [CHANNELS], hasDigitKeys: true })

		const event = pressKey({ ...digitKey(2), repeat: true })

		expect(event.defaultPrevented).toBe(false)
		expect(
			screen
				.getByRole("checkbox", { name: "Blog" })
				.getAttribute("aria-checked"),
		).toBe("false")
	})

	it.each<HTMLAttributes<HTMLDivElement>>([
		{ "aria-modal": true, role: "dialog" },
		{ role: "menu" },
	])("leaves the digit to an overlay above the panel, %o", (overlay) => {
		render(
			<I18nProvider>
				<div {...overlay}>
					<span data-testid="in-overlay" />
				</div>
				<ToolQuestion hasDigitKeys questions={[PLAN]} />
			</I18nProvider>,
		)

		const event = pressKey(digitKey(1), screen.getByTestId("in-overlay"))

		expect(event.defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it("still picks inside a modal that holds the panel", () => {
		render(
			<I18nProvider>
				<div aria-modal="true" role="dialog">
					<ToolQuestion hasDigitKeys questions={[PLAN]} />
				</div>
			</I18nProvider>,
		)

		pressKey(digitKey(2), screen.getByRole("radio", { name: "Starter" }))

		expect(
			screen.getByRole("radio", { name: "Team" }).getAttribute("aria-checked"),
		).toBe("true")
	})

	it("binds and names no more than nine digits", () => {
		const wide: ToolQuestionItem = {
			...PLAN,
			options: Array.from({ length: 12 }, (_, index) => ({
				label: `Plan ${index + 1}`,
				description: "A seat count.",
			})),
		}
		renderPanel({ questions: [wide], hasDigitKeys: true })

		expect(
			screen.getByText("Press 1\u20139 to choose, Return to send"),
		).toBeTruthy()
		pressKey(digitKey(9))
		expect(checkedLabels()).toEqual([expect.stringContaining("Plan 9")])
	})

	it("binds no digit on a notice", () => {
		renderPanel({ questions: [NOTICE, PLAN], hasDigitKeys: true })

		expect(pressKey(digitKey(1)).defaultPrevented).toBe(false)
	})

	it("lets the digit type into the own-answer field", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })
		const field = screen.getByLabelText(chat.toolQuestion.freeText)

		const event = pressKey(digitKey(2), field)

		expect(event.defaultPrevented).toBe(false)
		expect(checkedLabels()).toEqual([])
	})

	it.each([{ hasDigitKeys: false }, { hasDigitKeys: true, minimised: true }])(
		"binds no digit with %o",
		(props) => {
			renderPanel({ questions: [PLAN], ...props })

			expect(pressKey(digitKey(1)).defaultPrevented).toBe(false)
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
		expect(pressKey(digitKey(1)).defaultPrevented).toBe(false)
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
