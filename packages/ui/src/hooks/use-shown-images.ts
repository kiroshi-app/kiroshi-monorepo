import { useEffect, useRef, useState } from "react"

import type { GalleryImageStatus } from "@workspace/ui/components/answer-blocks/gallery"

export type ResolveImage = (src: string) => Promise<string>

type ShownImage = {
	src: string
	status?: GalleryImageStatus
}

export const useShownImages = (
	sources: readonly string[],
	resolveImage: ResolveImage | undefined,
) => {
	const [settled, setSettled] = useState<ReadonlyMap<string, ShownImage>>(
		() => new Map(),
	)
	const requested = useRef(new Set<string>())
	const present = useRef(new Set<string>())

	useEffect(() => {
		present.current = new Set(sources)
		const leave = () => {
			present.current = new Set()
		}
		if (!resolveImage) return leave
		const settle = (source: string, shown: ShownImage) => {
			if (!present.current.has(source)) {
				requested.current.delete(source)
				return
			}
			setSettled((current) => new Map(current).set(source, shown))
		}
		for (const source of present.current) {
			if (requested.current.has(source)) continue
			requested.current.add(source)
			resolveImage(source).then(
				(src) => settle(source, { src }),
				() => settle(source, { src: source, status: "broken" }),
			)
		}
		return leave
	})

	return (source: string): ShownImage =>
		resolveImage
			? (settled.get(source) ?? { src: source, status: "resolving" })
			: { src: source }
}
