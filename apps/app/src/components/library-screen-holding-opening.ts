import { createElement, useState } from "react"

import {
	LibraryScreen,
	type LibraryScreenProps,
} from "@/components/library-screen"
import type { LibraryOpening } from "@/lib/navigation/library-search"

type LibraryScreenHoldingOpeningProps = Omit<
	LibraryScreenProps,
	"opening" | "onOpeningChange"
> & { openedFirst?: LibraryOpening }

export const LibraryScreenHoldingOpening = ({
	openedFirst,
	...props
}: LibraryScreenHoldingOpeningProps) => {
	const [opening, setOpening] = useState(openedFirst)
	return createElement(LibraryScreen, {
		...props,
		opening,
		onOpeningChange: setOpening,
	})
}
