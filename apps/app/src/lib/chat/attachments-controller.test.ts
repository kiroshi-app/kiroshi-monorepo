import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
	AttachmentsOwner,
	SubmittedAttachment,
} from "./attachments-contract"
import {
	type AttachmentsPort,
	createAttachmentsController,
	ownerKey,
} from "./attachments-controller"

const fileNamed = (name: string, type = "text/markdown") =>
	new File([new Uint8Array([1, 2, 3])], name, { type })

type Sent = { owner: string; text: string }

const bot = (id: string): AttachmentsOwner => ({ kind: "bot", id })

const room = (id: string): AttachmentsOwner => ({ kind: "conversation", id })

const heldPort = (unreachable: string[] = []) => {
	const stored: { owner: string; names: string[] }[] = []
	const sent: Sent[] = []
	let answer: ((paths: string[]) => void) | null = null
	let refuse: ((reason: unknown) => void) | null = null
	let reached: (() => void) | null = null

	const port: AttachmentsPort = {
		store: (owner: AttachmentsOwner, attachments: SubmittedAttachment[]) => {
			stored.push({
				owner: ownerKey(owner),
				names: attachments.map((attachment) => attachment.name),
			})
			reached?.()
			return new Promise<string[]>((resolve, reject) => {
				answer = resolve
				refuse = reject
			})
		},
		send: (owner: AttachmentsOwner, text: string) => {
			if (unreachable.includes(ownerKey(owner))) {
				return false
			}
			sent.push({ owner: ownerKey(owner), text })
			return true
		},
	}

	return {
		port,
		stored,
		sent,
		whenStored: () =>
			new Promise<void>((resolve) => {
				if (stored.length > 0) {
					resolve()
					return
				}
				reached = resolve
			}),
		answerWith: (paths: string[]) => answer?.(paths),
		refuseWith: (reason: unknown) => refuse?.(reason),
	}
}

const SENT_WITH_NOTES =
	"look\nAttached to this message, sent 2026-09-18T10:15:30.000Z, 1 file:\n1/1 /data/a/1.md"

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(new Date("2026-09-18T10:15:30Z"))
})

afterEach(() => {
	vi.useRealTimers()
})

describe("a submission in flight", () => {
	it("dates the block at the moment of submission, not when the store answers", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submit(bot("a"), "look")
		await host.whenStored()
		vi.setSystemTime(new Date("2026-09-18T10:16:00Z"))
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(true)
		expect(host.sent).toEqual([{ owner: "bot:a", text: SENT_WITH_NOTES }])
	})

	it("refuses a second one and stores nothing twice", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const first = controller.submit(bot("a"), "look")
		const second = await controller.submit(bot("a"), "look")
		await host.whenStored()
		host.answerWith(["/data/a/1.md"])

		expect(second).toBe(false)
		expect(await first).toBe(true)
		expect(host.stored).toHaveLength(1)
		expect(host.sent).toEqual([{ owner: "bot:a", text: SENT_WITH_NOTES }])
	})

	it("delivers to the companion it started on, whoever is read meanwhile", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submit(bot("a"), "look")
		await host.whenStored()
		controller.stage(bot("b"), [fileNamed("other.md")])
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(true)
		expect(host.stored).toEqual([{ owner: "bot:a", names: ["notes.md"] }])
		expect(host.sent).toEqual([{ owner: "bot:a", text: SENT_WITH_NOTES }])
		expect(
			controller.getState().staged["bot:b"]?.map((item) => item.name),
		).toEqual(["other.md"])
	})

	it("clears the files it sent and keeps the ones staged meanwhile", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submit(bot("a"), "look")
		await host.whenStored()
		controller.stage(bot("a"), [fileNamed("late.md")])
		host.answerWith(["/data/a/1.md"])
		await submission

		expect(
			controller.getState().staged["bot:a"]?.map((item) => item.name),
		).toEqual(["late.md"])
		expect(host.stored).toEqual([{ owner: "bot:a", names: ["notes.md"] }])
	})
})

describe("a refused store", () => {
	it("is held against the companion it happened on and shown on no other", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submit(bot("a"), "look")
		await host.whenStored()
		host.refuseWith({ kind: "tooMany", count: 21, limit: 20 })

		expect(await submission).toBe(false)
		expect(controller.getState().refusals["bot:a"]).toEqual({
			kind: "tooMany",
			count: 21,
			limit: 20,
		})
		expect(controller.getState().refusals["bot:b"] ?? null).toBeNull()
		expect(controller.getState().staged["bot:a"]).toHaveLength(1)
	})

	it("goes when the companion sends a prompt with nothing staged", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])
		const refused = controller.submit(bot("a"), "look")
		await host.whenStored()
		host.refuseWith({ kind: "unwritable", detail: "no space" })
		await refused
		controller.remove(
			bot("a"),
			controller.getState().staged["bot:a"]?.[0]?.id ?? "",
		)

		expect(await controller.submit(bot("a"), "never mind")).toBe(true)
		expect(controller.getState().refusals["bot:a"]).toBeNull()
		expect(host.sent).toEqual([{ owner: "bot:a", text: "never mind" }])
	})
})

describe("a submission carried to another owner", () => {
	it("stores the files for the target, sends there and empties the staging owner", async () => {
		const host = heldPort()
		const controller = createAttachmentsController(host.port)
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submitTo(bot("a"), room("r"), "look")
		await host.whenStored()
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(true)
		expect(host.stored).toEqual([
			{ owner: "conversation:r", names: ["notes.md"] },
		])
		expect(host.sent).toEqual([
			{ owner: "conversation:r", text: SENT_WITH_NOTES },
		])
		expect(controller.getState().staged["bot:a"]).toHaveLength(0)
	})

	it("waits for the target to take the message and keeps the files when it refuses", async () => {
		const host = heldPort()
		const controller = createAttachmentsController({
			...host.port,
			send: () => Promise.resolve(false),
		})
		controller.stage(bot("a"), [fileNamed("notes.md")])

		const submission = controller.submitTo(bot("a"), room("r"), "look")
		await host.whenStored()
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(false)
		expect(controller.getState().staged["bot:a"]).toHaveLength(1)
	})
})

describe("files that stop being reachable", () => {
	it("release their previews when the companion is forgotten", () => {
		const released = vi.spyOn(URL, "revokeObjectURL")
		const controller = createAttachmentsController(heldPort().port)
		controller.stage(bot("a"), [fileNamed("shot.png", "image/png")])
		const preview = controller.getState().staged["bot:a"]?.[0]?.previewUrl

		controller.forget(bot("a"))

		expect(released).toHaveBeenCalledWith(preview)
		expect(controller.getState().staged["bot:a"]).toHaveLength(0)
		released.mockRestore()
	})

	it("release their previews when the composer goes away", () => {
		const released = vi.spyOn(URL, "revokeObjectURL")
		const controller = createAttachmentsController(heldPort().port)
		controller.stage(bot("a"), [fileNamed("shot.png", "image/png")])
		controller.stage(bot("b"), [fileNamed("other.png", "image/png")])

		controller.release()

		expect(released).toHaveBeenCalledTimes(2)
		expect(controller.getState().staged).toEqual({})
		released.mockRestore()
	})
})

describe("two owners that share an id", () => {
	it("hold their staged files apart", () => {
		const controller = createAttachmentsController(heldPort().port)

		controller.stage(bot("a"), [fileNamed("notes.md")])
		controller.stage(room("a"), [fileNamed("minutes.md")])

		expect(
			controller.getState().staged["bot:a"]?.map((item) => item.name),
		).toEqual(["notes.md"])
		expect(
			controller.getState().staged["conversation:a"]?.map((item) => item.name),
		).toEqual(["minutes.md"])
	})
})

describe("a conversation with no runtime", () => {
	it("sends nothing and keeps what it staged", async () => {
		const host = heldPort(["conversation:a"])
		const controller = createAttachmentsController(host.port)
		controller.stage(room("a"), [fileNamed("minutes.md")])

		const submission = controller.submit(room("a"), "look")
		await host.whenStored()
		host.answerWith(["/data/a/1.md"])

		expect(await submission).toBe(false)
		expect(host.sent).toEqual([])
		expect(controller.getState().staged["conversation:a"]).toHaveLength(1)
	})
})
