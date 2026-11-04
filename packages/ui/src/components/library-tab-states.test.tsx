// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import {
	LibraryItemUnavailable,
	type LibraryItemUnavailableReason,
} from "@workspace/ui/components/library-tab-states"

const unavailableFor = (reason: LibraryItemUnavailableReason) => (
	<I18nProvider>
		<LibraryItemUnavailable
			name="Spring launch brief"
			onAction={vi.fn()}
			reason={reason}
		/>
	</I18nProvider>
)

describe("LibraryItemUnavailable", () => {
	afterEach(cleanup)

	it("announces the new title line once in the alert already mounted when the reason changes", () => {
		const { rerender } = render(unavailableFor("unreadable"))
		const alert = screen.getByRole("alert")
		expect(alert.textContent).toContain("Couldn’t open Spring launch brief")

		rerender(unavailableFor("missing"))

		expect(screen.getAllByRole("alert")).toEqual([alert])
		expect(alert.textContent).toContain(
			"This item isn’t in the Library anymore.",
		)
		expect(
			screen.getAllByText("This item isn’t in the Library anymore."),
		).toHaveLength(1)
	})
})
