import { afterEach, describe, expect, it, vi } from "vitest"

import {
	createSharedSpacesController,
	type SharedSpacesTransport,
} from "./shared-spaces-controller"

import type {
	Member,
	MembersChanged,
	MembersError,
	SpaceInvitation,
} from "../bindings"

vi.mock("./index", () => ({ listen: vi.fn(async () => () => undefined) }))

const HOST: Member = {
	userId: "steve",
	name: "Steve Puget",
	email: "steve@example.com",
	status: "host",
}

const PENDING: Member = {
	userId: "sam",
	name: null,
	email: "sam@example.com",
	status: "pending",
}

const invitationTo = (
	email: string,
	state: SpaceInvitation["state"],
): SpaceInvitation => ({
	id: `invitation-${email}`,
	email,
	sentAt: "2026-10-01T00:00:00.000Z",
	expiresAt: "2026-10-08T00:00:00.000Z",
	state,
})

const SAM_INVITED = invitationTo("sam@example.com", "invited")

const ok = (data: Member[]) => ({ status: "ok" as const, data })

const refused = (error: MembersError) => ({ status: "error" as const, error })

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

type Answer = Awaited<ReturnType<SharedSpacesTransport["list"]>>

const createFakeTransport = (
	answers: Record<string, () => Promise<Answer>>,
) => {
	const events = { announce: (_changed: MembersChanged) => undefined }
	const transport: SharedSpacesTransport = {
		list: vi.fn((spaceId: string) => answers[spaceId]()),
		onChanged: vi.fn(async (listener) => {
			events.announce = listener
			return () => undefined
		}),
	}
	return { transport, events }
}

const watched = async (answers: Record<string, () => Promise<Answer>>) => {
	const fake = createFakeTransport(answers)
	const controller = createSharedSpacesController(fake.transport)
	controller.watch(Object.keys(answers))
	await settle()
	return { ...fake, controller }
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe("the shared state of own spaces", () => {
	it("leaves a space whose only member is its host not shared", async () => {
		const { controller } = await watched({ home: async () => ok([HOST]) })

		expect(controller.getState().sharedBySpaceId).toEqual({ home: false })
	})

	it("marks a space shared once a pending member sits beside its host", async () => {
		const { controller } = await watched({
			home: async () => ok([HOST, PENDING]),
		})

		expect(controller.getState().sharedBySpaceId).toEqual({ home: true })
	})

	it("leaves a space this Mac never hosted not shared without logging", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const { controller } = await watched({
			home: async () => refused({ kind: "notHosting" }),
		})

		expect(controller.getState().sharedBySpaceId).toEqual({ home: false })
		expect(logged).not.toHaveBeenCalled()
	})

	it("flips only the space a members change names, without reading the others again", async () => {
		const { controller, events, transport } = await watched({
			home: async () => ok([HOST]),
			work: async () => ok([HOST]),
		})

		events.announce({
			spaceId: "work",
			members: [HOST],
			invitations: [SAM_INVITED],
		})

		expect(controller.getState().sharedBySpaceId).toEqual({
			home: false,
			work: true,
		})
		expect(transport.list).toHaveBeenCalledTimes(2)
	})

	it("logs a failed read and leaves that space not shared while the others still show", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const { controller } = await watched({
			home: async () => refused({ kind: "needsSignIn" }),
			work: async () => ok([HOST, PENDING]),
			attic: () => Promise.reject(new Error("bridge gone")),
		})

		expect(controller.getState().sharedBySpaceId).toEqual({
			home: false,
			work: true,
			attic: false,
		})
		expect(logged).toHaveBeenCalledTimes(2)
	})

	it("reads a space whose invitations all expired or were withdrawn as not shared", async () => {
		const { controller, events } = await watched({
			home: async () => ok([HOST, PENDING]),
		})

		events.announce({
			spaceId: "home",
			members: [HOST],
			invitations: [
				invitationTo("sam@example.com", "expired"),
				invitationTo("ana@example.com", "withdrawn"),
			],
		})

		expect(controller.getState().sharedBySpaceId).toEqual({ home: false })
	})

	it("ignores a members change for a space it does not watch", async () => {
		const { controller, events } = await watched({
			home: async () => ok([HOST]),
		})

		events.announce({
			spaceId: "elsewhere",
			members: [HOST],
			invitations: [SAM_INVITED],
		})

		expect(controller.getState().sharedBySpaceId).toEqual({ home: false })
	})
})
