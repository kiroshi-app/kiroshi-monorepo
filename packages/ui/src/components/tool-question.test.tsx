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

		expect(screen.getByText(chat.toolQuestion.hint.send)).toBeTruthy()
		expect(screen.queryByText(/^Press /)).toBeNull()
	})

	it("names the digit range once the digit keys are wired", () => {
		renderPanel({ questions: [PLAN], hasDigitKeys: true })

		expect(
			screen.getByText("Press 1-3 to choose, Return to send."),
		).toBeTruthy()
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
