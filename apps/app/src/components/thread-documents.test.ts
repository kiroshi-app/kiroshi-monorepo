// @vitest-environment happy-dom

import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	ThreadDocumentCards,
	ThreadDocumentsContext,
} from "@/components/thread-documents"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = { spaceId: string; name: string }

const libraryHost = vi.hoisted(() => ({
	answers: new Map<string, (call: LibraryCall) => unknown>(),
}))

vi.mock("@/lib/host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host")>()
	const invoke = (async <T>(...call: Parameters<typeof actual.invoke>) => {
		const [command, args] = call
		const answer = libraryHost.answers.get(command)
		if (!answer) {
			throw new Error(`no fake answer for ${command}`)
		}
		return answer(args as LibraryCall) as T
	}) as typeof actual.invoke
	return { ...actual, invoke }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(),
}))

const PLAN = "plan.md"
const SPACE_ID = "space-on-screen"

const DOCUMENTS = {
	spaceId: SPACE_ID,
	openedName: null,
	open: () => undefined,
	close: () => undefined,
}

const planItem = {
	name: PLAN,
	kind: "document",
	path: `/library/${PLAN}`,
	bytes: 10,
	modifiedAt: 0,
	createdAt: null,
}

const renderPlanCard = () =>
	render(
		createElement(
			ThreadDocumentsContext,
			{ value: DOCUMENTS },
			createElement(ThreadDocumentCards, { names: [PLAN] }),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

const planCard = () => screen.getByRole("article", { name: "plan" })

describe("the card of a document posted in a thread", () => {
	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [planItem])
		libraryHost.answers.set("library_read_document", ({ name }) => ({
			name,
			format: "markdown",
			content: "The plan opens here.",
		}))
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
	})

	it("shows the excerpt with Show and Open while the document is in the Library", async () => {
		renderPlanCard()

		expect(
			await within(planCard()).findByText("The plan opens here."),
		).toBeTruthy()
		expect(
			within(planCard()).getByRole("button", { name: "Show" }),
		).toBeTruthy()
		expect(
			within(planCard()).getByRole("button", { name: "Open" }),
		).toBeTruthy()
	})

	it("says the document was deleted once the Library no longer lists it", async () => {
		libraryHost.answers.set("library_list", () => [])
		renderPlanCard()

		expect(
			await screen.findByText("This document was deleted from the Library."),
		).toBeTruthy()
		expect(
			within(planCard()).queryByRole("button", { name: "Show" }),
		).toBeNull()
	})

	it("says the document can't be read when its read fails", async () => {
		libraryHost.answers.set("library_read_document", () => {
			throw { kind: "unreadable", detail: "disk gone" }
		})
		renderPlanCard()

		await waitFor(() =>
			expect(
				within(planCard()).getByText(
					"Couldn’t read this document. Open it again from the Library.",
				),
			).toBeTruthy(),
		)
		expect(
			within(planCard()).queryByRole("button", { name: "Open" }),
		).toBeNull()
	})

	it("says the document can't be read when the Library can't be listed", async () => {
		libraryHost.answers.set("library_list", () => {
			throw { kind: "unreadable", detail: "disk gone" }
		})
		renderPlanCard()

		expect(
			await screen.findByText(
				"Couldn’t read this document. Open it again from the Library.",
			),
		).toBeTruthy()
	})
})
