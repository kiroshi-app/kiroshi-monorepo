import { describe, expect, it, vi } from "vitest"

import {
	createLibraryCommentMentionOpening,
	type MentionedSpace,
} from "./library-comment-mention-opening"

import type {
	LibraryCommentMentionOpened,
	LibraryCommentThread,
} from "../bindings"
import { HostRefused } from "../host/host-refused"

const JOINED_SPACE: MentionedSpace = {
	rowId: "joined:host-lena",
	hostId: "host-lena",
	hostSpaceId: "space-of-lena",
}

const MENTION: LibraryCommentMentionOpened = {
	spaceId: "host-lena",
	itemName: "plan.md",
	itemKind: "document",
	threadId: "thread-intro",
}

const threadOf = (id: string): LibraryCommentThread => ({
	id,
	spaceId: JOINED_SPACE.hostSpaceId,
	itemName: MENTION.itemName,
	anchor: { kind: "block", blockId: "intro1" },
	state: "open",
	comments: [],
	targetMissing: false,
	resolvedBy: null,
	resolvedAt: null,
	lastBoardPoint: null,
})

const BOTH_THERE = () =>
	Promise.resolve([threadOf("thread-budget"), threadOf("thread-intro")])

const windowRaisedAtOnce = () => Promise.resolve()

const threadsRead = () => new Promise((flush) => setTimeout(flush, 0))

const mentionOpeningOn = (
	readThreads: () => Promise<LibraryCommentThread[]>,
	raiseWindow: () => Promise<void> = windowRaisedAtOnce,
) => {
	const seams = {
		spaceOf: vi.fn(() => JOINED_SPACE),
		readThreads: vi.fn(readThreads),
		showItem: vi.fn(),
		askForThread: vi.fn(),
		raiseWindow: vi.fn(raiseWindow),
		raiseFailure: vi.fn(),
	}
	return { ...seams, openMention: createLibraryCommentMentionOpening(seams) }
}

const noticeTitlesOf = (raiseFailure: ReturnType<typeof vi.fn>) =>
	raiseFailure.mock.calls.map(([notice]) => notice.title)

describe("createLibraryCommentMentionOpening", () => {
	it("shows the item in its Space and asks for the thread when both are there", async () => {
		const opening = mentionOpeningOn(BOTH_THERE)

		await opening.openMention(MENTION)

		expect(opening.spaceOf).toHaveBeenCalledWith("host-lena")
		expect(opening.readThreads).toHaveBeenCalledWith(JOINED_SPACE, "plan.md")
		expect(opening.askForThread).toHaveBeenCalledExactlyOnceWith({
			spaceId: "space-of-lena",
			itemName: "plan.md",
			threadId: "thread-intro",
		})
		expect(opening.showItem).toHaveBeenCalledExactlyOnceWith(
			"joined:host-lena",
			{ kind: "document", name: "plan.md" },
		)
		expect(opening.raiseFailure).not.toHaveBeenCalled()
	})

	it("brings the window forward before it shows the item on its thread", async () => {
		let raise = () => {}
		const opening = mentionOpeningOn(
			BOTH_THERE,
			() =>
				new Promise<void>((raised) => {
					raise = raised
				}),
		)

		const opened = opening.openMention(MENTION)
		await threadsRead()

		expect(opening.raiseWindow).toHaveBeenCalledTimes(1)
		expect(opening.showItem).not.toHaveBeenCalled()
		expect(opening.askForThread).not.toHaveBeenCalled()

		raise()
		await opened

		expect(opening.askForThread).toHaveBeenCalledTimes(1)
		expect(opening.showItem).toHaveBeenCalledTimes(1)
	})

	it("still shows the item and reports it when the window cannot be brought forward", async () => {
		const opening = mentionOpeningOn(BOTH_THERE, () =>
			Promise.reject(new Error("no window to reveal")),
		)

		await opening.openMention(MENTION)

		expect(opening.raiseFailure.mock.calls).toEqual([
			[
				{
					title: "Couldn’t bring Kiroshi to the front. Switch to it yourself.",
					description: "no window to reveal",
				},
			],
		])
		expect(opening.askForThread).toHaveBeenCalledTimes(1)
		expect(opening.showItem).toHaveBeenCalledExactlyOnceWith(
			"joined:host-lena",
			{ kind: "document", name: "plan.md" },
		)
	})

	it("names the item as gone and leaves the screen when the item is gone", async () => {
		const opening = mentionOpeningOn(() =>
			Promise.reject({ kind: "missing", name: "plan.md" }),
		)

		await opening.openMention(MENTION)

		expect(noticeTitlesOf(opening.raiseFailure)).toEqual([
			"This item isn’t in the Library anymore.",
		])
		expect(opening.raiseWindow).toHaveBeenCalledTimes(1)
		expect(opening.showItem).not.toHaveBeenCalled()
		expect(opening.askForThread).not.toHaveBeenCalled()
	})

	it("names the item as gone when a joined host refuses it as missing", async () => {
		const opening = mentionOpeningOn(() =>
			Promise.reject(
				new HostRefused(
					"missing",
					{ kind: "missing", name: "plan.md" },
					"other",
				),
			),
		)

		await opening.openMention(MENTION)

		expect(noticeTitlesOf(opening.raiseFailure)).toEqual([
			"This item isn’t in the Library anymore.",
		])
		expect(opening.showItem).not.toHaveBeenCalled()
	})

	it("names the comment as gone and leaves the screen when the thread is gone", async () => {
		const opening = mentionOpeningOn(() =>
			Promise.resolve([threadOf("thread-budget")]),
		)

		await opening.openMention(MENTION)

		expect(noticeTitlesOf(opening.raiseFailure)).toEqual([
			"The comment you were mentioned in isn’t on plan anymore.",
		])
		expect(opening.raiseWindow).toHaveBeenCalledTimes(1)
		expect(opening.showItem).not.toHaveBeenCalled()
		expect(opening.askForThread).not.toHaveBeenCalled()
	})

	it("says the comments could not be shown when the read fails otherwise", async () => {
		const opening = mentionOpeningOn(() =>
			Promise.reject({ kind: "unknownSpace", id: "space-of-lena" }),
		)

		await opening.openMention(MENTION)

		expect(noticeTitlesOf(opening.raiseFailure)).toEqual([
			"Couldn’t show the comments. Open the item again from the Library.",
		])
		expect(opening.showItem).not.toHaveBeenCalled()
	})
})
