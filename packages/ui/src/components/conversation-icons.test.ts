import { describe, expect, it } from "vitest"

import conversationIcons from "@workspace/shared/conversation-icons.json"
import { ConversationIcons } from "@workspace/ui/components/icons"

describe("ConversationIcons", () => {
	it("draws every curated name, in the shared list's order", () => {
		expect(Object.keys(ConversationIcons)).toEqual(conversationIcons)
	})
})
