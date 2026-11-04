import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

import { readLibraryFile } from "./library-reads"

import { commands } from "../bindings"

export type LibraryImageContent = {
	name: string
	content: string
}

export type LibraryImageSource = {
	name: string
	read: () => Promise<LibraryImageContent>
}

type EncodedImage = {
	mediaType: string
	base64: string
}

export class LibraryImageUnreadable extends Error {
	readonly kind = "imageUnreadable"

	constructor(cause: unknown) {
		super("image unreadable", { cause })
	}
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"

const BASE64_DATA_URL = /^data:(image\/[^;,]+)(?:;[^;,]*)*;base64,(.*)$/s

const REMOTE_PROTOCOLS = new Set(["http:", "https:"])

const ASSET_HOST = "asset.localhost"

const baseNameOf = (name: string) => {
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(0, dot) : name
}

const extensionOf = (mediaType: string) =>
	mediaType
		.split(";")[0]
		?.trim()
		.toLowerCase()
		.slice("image/".length)
		.split("+")[0]

const contentNamed = (
	name: string,
	{ mediaType, base64 }: EncodedImage,
): LibraryImageContent => ({
	name: `${baseNameOf(name)}.${extensionOf(mediaType)}`,
	content: base64,
})

const loadedImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image()
		image.crossOrigin = "anonymous"
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error("image unreadable"))
		image.src = src
	})

const pngImageOf = async (src: string): Promise<EncodedImage> => {
	const image = await loadedImage(src)
	const canvas = document.createElement("canvas")
	canvas.width = image.naturalWidth
	canvas.height = image.naturalHeight
	const context = canvas.getContext("2d")
	if (!context) {
		throw new Error("image unencodable")
	}
	context.drawImage(image, 0, 0)
	return {
		mediaType: "image/png",
		base64: canvas.toDataURL("image/png").slice(PNG_DATA_URL_PREFIX.length),
	}
}

const decodedDataUrlOf = (src: string): EncodedImage => {
	const [, mediaType, payload] = BASE64_DATA_URL.exec(src) ?? []
	if (mediaType === undefined || payload === undefined) {
		throw new Error("not a base64 image data url")
	}
	return { mediaType, base64: btoa(atob(payload)) }
}

const remoteImageOf = async (src: string): Promise<EncodedImage> => {
	const result = await commands.remoteImageRead(src)
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

const isRemote = ({ protocol, hostname }: URL) =>
	REMOTE_PROTOCOLS.has(protocol) && hostname !== ASSET_HOST

const encodedImageOf = (src: string) => {
	const url = new URL(src)
	if (url.protocol === "data:") {
		return decodedDataUrlOf(src)
	}
	return isRemote(url) ? remoteImageOf(src) : pngImageOf(src)
}

const readShownImage = async ({ name, src }: LibraryLightboxImage) => {
	try {
		return contentNamed(name, await encodedImageOf(src))
	} catch (cause) {
		throw new LibraryImageUnreadable(cause)
	}
}

export const shownImageSourceOf = (
	image: LibraryLightboxImage,
): LibraryImageSource => ({
	name: image.name,
	read: () => readShownImage(image),
})

export const storedImageSourceOf = (
	spaceId: string,
	name: string,
): LibraryImageSource => ({
	name,
	read: async () => ({
		name,
		content: (await readLibraryFile(spaceId, name)).content,
	}),
})
