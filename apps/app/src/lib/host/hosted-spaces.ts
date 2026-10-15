import { listen } from "./tauri"

import {
	commands,
	HOSTING_CHANGED_EVENT,
	type HostingChanged,
	type HostingState,
} from "../bindings"

export type HostedSpacesTransport = {
	spaceIds: () => Promise<string[]>
	read: (spaceId: string) => Promise<HostingState>
	onChanged: (
		listener: (changed: HostingChanged) => void,
	) => Promise<() => void>
}

type HostedSpaces = {
	isNoneHosted: () => boolean
}

const spaceIdsOnThisMac = async (): Promise<string[]> => {
	const listed = await commands.spaceList()
	if (listed.status === "error") {
		throw new Error(listed.error.kind)
	}
	return listed.data.map((space) => space.id)
}

const localHosting: HostedSpacesTransport = {
	spaceIds: spaceIdsOnThisMac,
	read: commands.hostingState,
	onChanged: (listener) =>
		listen<HostingChanged>(HOSTING_CHANGED_EVENT, (event) =>
			listener(event.payload),
		),
}

const isHosted = (state: HostingState): boolean => state.kind !== "off"

export const createHostedSpaces = (
	transport: HostedSpacesTransport = localHosting,
): HostedSpaces => {
	const states = new Map<string, HostingState>()
	let isRead = false

	const record = ({ spaceId, state }: HostingChanged) => {
		states.set(spaceId, state)
	}

	const recordUnlessChanged = (read: HostingChanged) => {
		if (!states.has(read.spaceId)) record(read)
	}

	const readOne = async (spaceId: string): Promise<HostingChanged> => ({
		spaceId,
		state: await transport.read(spaceId),
	})

	const readAll = async () => {
		await transport.onChanged(record)
		const spaceIds = await transport.spaceIds()
		const read = await Promise.all(spaceIds.map(readOne))
		read.forEach(recordUnlessChanged)
		isRead = true
	}

	readAll().catch((failure) =>
		console.error("the hosted spaces of this computer were not read", failure),
	)

	return {
		isNoneHosted: () => isRead && ![...states.values()].some(isHosted),
	}
}
