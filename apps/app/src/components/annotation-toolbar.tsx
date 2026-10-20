import { Agentation } from "agentation"

import { useAnnotationMode } from "@/lib/annotation/use-annotation-mode"
import { useTopmostOpenPopup } from "@/lib/annotation/use-topmost-open-popup"

const IDENTIFYING_ATTRIBUTES = ["data-slot"]

export const AnnotationToolbar = () => {
	const isAnnotating = useAnnotationMode()
	const topmostOpenPopup = useTopmostOpenPopup()

	return (
		<Agentation
			appName="Kiroshi Dev"
			copyFormat="markdown"
			enableKeyboardShortcuts
			identifyingAttributes={IDENTIFYING_ATTRIBUTES}
			className={isAnnotating ? undefined : "hidden"}
			portalContainer={topmostOpenPopup}
		/>
	)
}
