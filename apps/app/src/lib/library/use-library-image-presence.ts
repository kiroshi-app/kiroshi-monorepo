import { useEffect, useMemo, useState } from "react"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import {
	clearLibraryPresence,
	shareLibraryImageSeat,
} from "./library-document-writes"
import {
	useIsOwnSeat,
	useListenWhileWatched,
} from "./use-library-document-writers"

import type { LibraryDocumentPresence, LibraryWriter } from "../bindings"

type WatchedImage = {
	spaceId: string
	name: string
}

type ImagePerson = {
	id: string
	name: string
}

type HeldPeople = {
	watched: WatchedImage | null
	people: ImagePerson[]
}

type LibraryImagePresenceInput = {
	spaceId: string
	name: string | undefined
	isJoined: boolean
}

export const IMAGE_PRESENCE_RENEWAL_MS = 20_000

const NOBODY_ELSE: HeldPeople = { watched: null, people: [] }

const logShareFailure = (reason: unknown) =>
	console.error("library: the open image presence could not be shared", reason)

const isLookingAtImage = (writer: LibraryWriter) =>
	writer.kind !== "agent" && writer.at.kind === "image"

const personOf = ({ id, name }: LibraryWriter): ImagePerson => ({
	id,
	name: name ?? "",
})

const useShareImagePresence = (spaceId: string, name: string | undefined) => {
	useEffect(() => {
		if (name === undefined) {
			return
		}
		const share = () => {
			shareLibraryImageSeat(spaceId, name).catch(logShareFailure)
		}
		share()
		const renewal = setInterval(share, IMAGE_PRESENCE_RENEWAL_MS)
		return () => {
			clearInterval(renewal)
			clearLibraryPresence(spaceId, name).catch(logShareFailure)
		}
	}, [spaceId, name])
}

export const useLibraryImagePresence = ({
	spaceId,
	name,
	isJoined,
}: LibraryImagePresenceInput) => {
	const watched = useMemo(
		() => (name === undefined ? null : { spaceId, name }),
		[spaceId, name],
	)
	const [held, setHeld] = useState<HeldPeople>(NOBODY_ELSE)
	const isOwnSeat = useIsOwnSeat(isJoined)

	useListenWhileWatched<LibraryDocumentPresence>(
		watched,
		LIBRARY_DOCUMENT_PRESENCE_EVENT,
		(image, { writers }) =>
			setHeld({
				watched: image,
				people: writers
					.filter((writer) => isLookingAtImage(writer) && !isOwnSeat(writer))
					.map(personOf),
			}),
	)
	useShareImagePresence(spaceId, name)

	return held.watched === watched ? held.people : NOBODY_ELSE.people
}
