import { useEffect, useState } from "react"

const isAnnotationChord = (event: KeyboardEvent) =>
	(event.metaKey || event.ctrlKey) &&
	event.shiftKey &&
	event.key.toLowerCase() === "f"

const isLeavingAnnotation = (event: KeyboardEvent) =>
	event.key === "Escape" && !event.defaultPrevented

export const useAnnotationMode = () => {
	const [isAnnotating, setIsAnnotating] = useState(false)

	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			if (event.isComposing || event.altKey) return

			if (isAnnotationChord(event)) {
				setIsAnnotating((wasAnnotating) => !wasAnnotating)
				return
			}

			if (isLeavingAnnotation(event)) {
				setIsAnnotating(false)
			}
		}

		window.addEventListener("keydown", press)
		return () => window.removeEventListener("keydown", press)
	}, [])

	return isAnnotating
}
