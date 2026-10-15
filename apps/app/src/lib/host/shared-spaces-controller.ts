import type { SpaceHost } from "@workspace/ui/components/host-pill"

import { type MembersTransport, membersTransport } from "./members-transport"

import type { Member, MembersChanged } from "../bindings"
import { createStore } from "../store"

export type SharedSpacesTransport = Pick<MembersTransport, "list" | "onChanged">

type SharedSpacesState = {
	sharedBySpaceId: Record<string, boolean>
}

type SharedSpacesController = {
	getState: () => SharedSpacesState
	subscribe: (listener: () => void) => () => void
	watch: (spaceIds: string[]) => () => void
}

const EMPTY_STATE: SharedSpacesState = { sharedBySpaceId: {} }

const isShared = (members: Member[]) =>
	members.some((member) => member.status !== "host")

export const createSharedSpacesController = (
	transport: SharedSpacesTransport = membersTransport,
): SharedSpacesController => {
	const stateStore = createStore(EMPTY_STATE)
	let watched = new Set<string>()

	const record = (spaceId: string, isSpaceShared: boolean) => {
		if (!watched.has(spaceId)) return
		const { sharedBySpaceId } = stateStore.getState()
		if (sharedBySpaceId[spaceId] === isSpaceShared) return
		stateStore.setState({
			sharedBySpaceId: { ...sharedBySpaceId, [spaceId]: isSpaceShared },
		})
	}

	const recordFailure = (spaceId: string, failure: unknown) => {
		console.error(`the members of space ${spaceId} were not read`, failure)
		record(spaceId, false)
	}

	const read = (spaceId: string) =>
		transport.list(spaceId).then(
			(answer) => {
				if (answer.status === "ok") {
					record(spaceId, isShared(answer.data))
				} else if (answer.error.kind === "notHosting") {
					record(spaceId, false)
				} else {
					recordFailure(spaceId, answer.error)
				}
			},
			(failure: unknown) => recordFailure(spaceId, failure),
		)

	const onChanged = ({ spaceId, members }: MembersChanged) =>
		record(spaceId, isShared(members))

	const watch = (spaceIds: string[]) => {
		const session = new Set(spaceIds)
		watched = session
		const detach = transport.onChanged(onChanged).catch((failure: unknown) => {
			console.error(
				"the members of this computer's spaces are not followed",
				failure,
			)
			return undefined
		})
		for (const spaceId of spaceIds) void read(spaceId)
		return () => {
			if (watched === session) watched = new Set()
			void detach.then((unlisten) => unlisten?.())
		}
	}

	return {
		getState: stateStore.getState,
		subscribe: stateStore.subscribe,
		watch,
	}
}

export const sharedMarksOf = (
	sharedBySpaceId: Record<string, boolean>,
): Record<string, SpaceHost> =>
	Object.fromEntries(
		Object.keys(sharedBySpaceId)
			.filter((spaceId) => sharedBySpaceId[spaceId])
			.map((spaceId) => [spaceId, "shared"]),
	)
