// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { QuestionPrompt } from "@/components/thread-prompt"
import type { QuestionRequest, QuestionSubject } from "@/lib/agent/contract"
import type { Application } from "@/lib/applications/application-port"
import { createFakeApplicationPort } from "@/lib/applications/fake-application-port"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import type { PromptResponder } from "@/lib/chat/use-prompt-responder"

afterEach(cleanup)

const SENTRY_LOGO = "https://logo.test/sentry.png"

const SENTRY: Application = {
	name: "sentry",
	title: "Sentry",
	description: "Pulls the errors behind a release.",
	config: {},
	tools: [],
	logo: SENTRY_LOGO,
	install: {
		kind: "key",
		fields: [{ name: "token", secret: "SENTRY_AUTH_TOKEN", concealed: true }],
	},
}

const RESPONDER: PromptResponder = {
	answer: async () => undefined,
	respond: async () => undefined,
}

const scopeQuestion = (subject?: QuestionSubject): QuestionRequest => ({
	id: "q-1",
	questions: [
		{
			header: "Scope",
			question: "Where should Sentry go?",
			options: [
				{ label: "Everywhere", description: null, preview: null },
				{ label: "This companion", description: null, preview: null },
			],
			multiSelect: false,
		},
	],
	subject,
})

const wallQuestion = (): QuestionRequest => ({
	id: "q-2",
	questions: [
		{
			header: "Wall",
			question: "Which wall holds?",
			options: [
				{ label: "North", description: null, preview: null },
				{ label: "South", description: null, preview: null },
				{ label: "East", description: null, preview: null },
			],
			multiSelect: false,
		},
	],
})

const renderPrompt = (
	request: QuestionRequest,
	responder: PromptResponder = RESPONDER,
) =>
	render(
		createElement(
			ConversationApplicationsContext.Provider,
			{
				value: {
					port: createFakeApplicationPort(),
					curated: [SENTRY],
					spaces: [],
					onOpen: () => undefined,
				},
			},
			createElement(QuestionPrompt, { request, responder }),
		),
	)

const pressDigit = (digit: number, target: Element = document.body) => {
	const event = new KeyboardEvent("keydown", {
		key: String(digit),
		code: `Digit${digit}`,
		bubbles: true,
		cancelable: true,
	})
	act(() => {
		target.dispatchEvent(event)
	})
	return event
}

const checkedOptions = () => screen.queryAllByRole("radio", { checked: true })

const drawnMark = () => document.querySelector(`img[src="${SENTRY_LOGO}"]`)

describe("QuestionPrompt", () => {
	it("draws the mark of the application a scope question is about", () => {
		renderPrompt(
			scopeQuestion({ kind: "applicationScope", application: "sentry" }),
		)

		expect(drawnMark()).not.toBeNull()
		expect(screen.getByText("Where should Sentry go?")).toBeTruthy()
	})

	it("asks a scope question about an application the catalogue does not name as an ordinary question", () => {
		renderPrompt(
			scopeQuestion({ kind: "applicationScope", application: "ledger" }),
		)

		expect(drawnMark()).toBeNull()
		expect(screen.getByText("Everywhere")).toBeTruthy()
		expect(screen.getByText("This companion")).toBeTruthy()
	})

	it("draws no mark on a question with no subject", () => {
		renderPrompt(scopeQuestion())

		expect(drawnMark()).toBeNull()
	})

	it("picks only the second option on the 2 key and sends it on Return", async () => {
		const answer = vi.fn(async () => undefined)
		renderPrompt(wallQuestion(), { ...RESPONDER, answer })

		const form = screen.getByRole("form", { name: "Which wall holds?" })
		await waitFor(() => {
			expect(form.contains(document.activeElement)).toBe(true)
		})

		const event = pressDigit(2)

		expect(event.defaultPrevented).toBe(true)
		expect(checkedOptions()).toEqual([
			screen.getByRole("radio", { name: "South" }),
		])

		await act(async () => {
			fireEvent.keyDown(document.activeElement as Element, { key: "Enter" })
		})

		expect(answer).toHaveBeenCalledOnce()
		expect(answer).toHaveBeenCalledWith("q-2", { "Which wall holds?": "South" })
	})

	it("lets a digit typed in the own-answer field stay text", () => {
		renderPrompt(wallQuestion())
		const field = screen.getByLabelText("Other answer")

		const event = pressDigit(2, field)

		expect(event.defaultPrevented).toBe(false)
		expect(checkedOptions()).toEqual([])
	})

	it("ignores the digit keys while the panel is minimised", () => {
		renderPrompt(wallQuestion())
		fireEvent.click(screen.getByRole("button", { name: "Minimize" }))

		const event = pressDigit(2)

		expect(event.defaultPrevented).toBe(false)
		expect(screen.queryAllByRole("radio")).toEqual([])
	})
})
