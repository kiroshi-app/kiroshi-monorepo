import { Agentation } from "agentation"

import { useAnnotationMode } from "@/lib/annotation/use-annotation-mode"

const IDENTIFYING_ATTRIBUTES = ["data-slot"]

export const AnnotationToolbar = () => {
	const isAnnotating = useAnnotationMode()

	return (
		<Agentation
			appName="Kiroshi Dev"
			copyFormat="markdown"
			enableKeyboardShortcuts
			identifyingAttributes={IDENTIFYING_ATTRIBUTES}
			className={isAnnotating ? undefined : "hidden"}
		/>
	)
}
