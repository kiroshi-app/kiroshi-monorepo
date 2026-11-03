// @vitest-environment happy-dom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import {
	LIBRARY_AGENTS,
	LIBRARY_FINISHED,
} from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentFinishedBar } from "@workspace/ui/components/library-document-agents"

const { atlas, mira, sol, ivo } = LIBRARY_AGENTS

const titleFor = (agents: (typeof atlas)[]) => {
	const view = render(
		<I18nProvider>
			<LibraryDocumentFinishedBar
				finished={{
					...LIBRARY_FINISHED,
					edits: agents.map((agent) => ({ agent, start: 0, end: 0 })),
				}}
			/>
		</I18nProvider>,
	)
	const title = view.container.querySelector("p")?.textContent
	view.unmount()
	return title
}

describe("finished bar title", () => {
	it("names one, two, then two and counts the others", () => {
		expect([
			titleFor([atlas]),
			titleFor([atlas, mira]),
			titleFor([atlas, mira, sol]),
			titleFor([atlas, mira, sol, ivo]),
		]).toEqual([
			"Atlas finished",
			"Atlas and Mira finished",
			"Atlas, Mira and 1 other finished",
			"Atlas, Mira and 2 others finished",
		])
	})
})
