import { describe, expect, it, vi } from "vitest"

import {
	askForMentionedThread,
	openMentionedThreadsOn,
} from "./mentioned-comment-thread"

const PLAN = { spaceId: "space-on-screen", itemName: "plan.md" }
const NOTES = { spaceId: "space-on-screen", itemName: "notes.md" }

describe("openMentionedThreadsOn", () => {
	it("opens the thread asked for before the item was on screen", () => {
		const open = vi.fn()
		askForMentionedThread({ ...PLAN, threadId: "thread-intro" })

		const stop = openMentionedThreadsOn(PLAN, open)

		expect(open).toHaveBeenCalledExactlyOnceWith("thread-intro")
		stop()
	})

	it("opens the thread asked for while the item is on screen", () => {
		const open = vi.fn()
		const stop = openMentionedThreadsOn(PLAN, open)

		askForMentionedThread({ ...PLAN, threadId: "thread-budget" })

		expect(open).toHaveBeenCalledExactlyOnceWith("thread-budget")
		stop()
	})

	it("opens an asked thread once, whoever shows the item next", () => {
		const open = vi.fn()
		askForMentionedThread({ ...PLAN, threadId: "thread-intro" })
		openMentionedThreadsOn(PLAN, vi.fn())()

		const stop = openMentionedThreadsOn(PLAN, open)

		expect(open).not.toHaveBeenCalled()
		stop()
	})

	it("keeps a thread asked on another item for that item", () => {
		const openOnNotes = vi.fn()
		const openOnPlan = vi.fn()
		const stopNotes = openMentionedThreadsOn(NOTES, openOnNotes)

		askForMentionedThread({ ...PLAN, threadId: "thread-intro" })
		const stopPlan = openMentionedThreadsOn(PLAN, openOnPlan)

		expect(openOnNotes).not.toHaveBeenCalled()
		expect(openOnPlan).toHaveBeenCalledExactlyOnceWith("thread-intro")
		stopNotes()
		stopPlan()
	})

	it("stops opening threads once stopped", () => {
		const open = vi.fn()
		openMentionedThreadsOn(PLAN, open)()

		askForMentionedThread({ ...PLAN, threadId: "thread-intro" })
		openMentionedThreadsOn(PLAN, vi.fn())()

		expect(open).not.toHaveBeenCalled()
	})
})
