import { describe, expect, it } from "vitest"

import {
	isSummonedIn,
	onboardingSummonsFor,
	withoutOnboardingSummons,
} from "./onboarding-summons"

import { initialChatState } from "../chat/chat-state"
import type { TranscriptRow } from "../chat/screen-model"
import { message } from "../conversations/transcript-fixtures"

const PREVIOUS_FIRST_COMPANION = onboardingSummonsFor("firstCompanion").replace(
	"their first agent.",
	"their first companion.",
)

const userRowOf = (text: string): TranscriptRow => ({
	messageId: "m-1",
	turnId: "t-1",
	blockIndex: 0,
	quotedMessageId: null,
	authorBotId: null,
	authorAccountId: null,
	authorName: null,
	role: "user",
	text,
	timestamp: 0,
	completion: "complete",
})

describe("the summons sent after the first agent", () => {
	it("asks for the first agent", () => {
		expect(onboardingSummonsFor("firstCompanion")).toMatch(
			/their first agent\.$/,
		)
	})

	it("hides a row holding its previous wording", () => {
		expect(
			withoutOnboardingSummons([userRowOf(PREVIOUS_FIRST_COMPANION)]),
		).toEqual([])
	})

	it("counts its previous wording as already sent", () => {
		const chat = {
			...initialChatState,
			messages: [message({ role: "user", content: PREVIOUS_FIRST_COMPANION })],
		}

		expect(isSummonedIn(chat, onboardingSummonsFor("firstCompanion"))).toBe(
			true,
		)
	})
})
