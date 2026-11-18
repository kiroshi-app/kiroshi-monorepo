import {
	CODE_LANGUAGES,
	warmCodeLanguage,
} from "@workspace/ui/lib/code-highlight"

const IDLE_TIMEOUT_MS = 2000

type CancelTask = () => void

const afterNextPaint = (task: () => void): CancelTask => {
	let timer: ReturnType<typeof setTimeout> | undefined
	const frame = requestAnimationFrame(() => {
		timer = setTimeout(task)
	})
	return () => {
		cancelAnimationFrame(frame)
		clearTimeout(timer)
	}
}

const whenIdle = (task: () => void): CancelTask => {
	if (typeof requestIdleCallback === "function") {
		const idleCallback = requestIdleCallback(() => task(), {
			timeout: IDLE_TIMEOUT_MS,
		})
		return () => cancelIdleCallback(idleCallback)
	}
	return afterNextPaint(task)
}

export const warmCodeHighlighter = (): CancelTask => {
	let cancelPendingWarmUp: CancelTask = () => {}
	const warmInTurn = ([language, ...nextLanguages]: readonly string[]) => {
		if (language === undefined) return
		cancelPendingWarmUp = whenIdle(() => {
			warmCodeLanguage(language)
			warmInTurn(nextLanguages)
		})
	}
	warmInTurn(CODE_LANGUAGES)
	return () => cancelPendingWarmUp()
}
