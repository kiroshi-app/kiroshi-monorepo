import { describe, expect, it } from "vitest"

import type { DocumentCardProps } from "@workspace/ui/components/document-card"

const title = "Brief"
const onOpen = () => {}
const children = "Body"

describe("DocumentCardProps", () => {
	it("rejects a failed card given what only a live card renders", () => {
		// @ts-expect-error a failed card has nothing to open
		const opens: DocumentCardProps = { failure: "deleted", onOpen, title }
		// @ts-expect-error a failed card has no body to unfold
		const unfolds: DocumentCardProps = {
			failure: "unreadable",
			children,
			title,
		}

		expect([opens, unfolds]).toHaveLength(2)
	})
})
