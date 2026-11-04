import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

import { readLibraryFile } from "./library-reads"

export type LibraryImageSource = {
	name: string
	readContent: () => Promise<string>
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"

const pngNameOf = (name: string) => {
	const dot = name.lastIndexOf(".")
	return `${dot > 0 ? name.slice(0, dot) : name}.png`
}

const loadedImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image()
		image.crossOrigin = "anonymous"
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error("image unreadable"))
		image.src = src
	})

const pngContentOf = async (src: string) => {
	const image = await loadedImage(src)
	const canvas = document.createElement("canvas")
	canvas.width = image.naturalWidth
	canvas.height = image.naturalHeight
	const context = canvas.getContext("2d")
	if (!context) {
		throw new Error("image unencodable")
	}
	context.drawImage(image, 0, 0)
	return canvas.toDataURL("image/png").slice(PNG_DATA_URL_PREFIX.length)
}

export const shownImageSourceOf = ({
	name,
	src,
}: LibraryLightboxImage): LibraryImageSource => ({
	name: pngNameOf(name),
	readContent: () => pngContentOf(src),
})

export const storedImageSourceOf = (
	spaceId: string,
	name: string,
): LibraryImageSource => ({
	name,
	readContent: async () => (await readLibraryFile(spaceId, name)).content,
})
