import { useEffect, useState } from "react"

import { WindowControls } from "@workspace/ui/components/window-controls"
import { i18n } from "@workspace/ui/lib/i18n"

import type { MaximizeButtonState } from "@/lib/bindings"
import { raiseReportedFailure } from "@/lib/failure-report"
import {
	closeWindow,
	declareMaximizeButton,
	hasCaptionWindowControls,
	type MaximizeButtonBounds,
	minimizeWindow,
	toggleMaximizeWindow,
	watchMaximizeButton,
	watchWindowFocus,
	watchWindowMaximized,
} from "@/lib/host"

type WindowAction =
	| "minimize"
	| "maximize"
	| "close"
	| "state"
	| "snap"
	| "pointer"

const raiseWindowFailure = (action: WindowAction) => () => {
	raiseReportedFailure(
		{
			title: i18n.t(`common:windowControls.failure.${action}`),
		},
		{ raisedIn: "window-caption-controls" },
	)
}

const runWindowAction =
	(action: WindowAction, call: () => Promise<void>) => () => {
		call().catch(raiseWindowFailure(action))
	}

const boundsOf = (button: HTMLButtonElement): MaximizeButtonBounds => {
	const { x, y, width, height } = button.getBoundingClientRect()
	return { x, y, width, height }
}

const createSnapDeclaration = () => {
	let hasFailed = false
	const raiseOnce = () => {
		if (hasFailed) return
		hasFailed = true
		raiseWindowFailure("snap")()
	}
	return (bounds: MaximizeButtonBounds | null) => {
		declareMaximizeButton(bounds).catch(raiseOnce)
	}
}

const observeMaximizeButton = (button: HTMLButtonElement | null) => {
	if (!button) return
	const declare = createSnapDeclaration()
	const declareCurrentBounds = () => declare(boundsOf(button))
	const observer = new ResizeObserver(declareCurrentBounds)
	observer.observe(button)
	window.addEventListener("resize", declareCurrentBounds)
	return () => {
		observer.disconnect()
		window.removeEventListener("resize", declareCurrentBounds)
		declare(null)
	}
}

const useWindowMaximized = (): boolean => {
	const [isMaximized, setIsMaximized] = useState(false)

	useEffect(() => {
		const raiseStateFailure = raiseWindowFailure("state")
		const watch = watchWindowMaximized({
			report: setIsMaximized,
			onError: raiseStateFailure,
		}).catch(raiseStateFailure)
		return () => {
			watch.then((stop) => stop?.())
		}
	}, [])

	return isMaximized
}

const useMaximizeButtonState = (): MaximizeButtonState => {
	const [state, setState] = useState<MaximizeButtonState>("idle")

	useEffect(() => {
		let hasFailed = false
		const follow = (next: MaximizeButtonState) => {
			if (!hasFailed) setState(next)
		}
		const resetWhenBlurred = (isFocused: boolean) => {
			if (!isFocused) follow("idle")
		}
		const failOnce = () => {
			if (hasFailed) return
			hasFailed = true
			setState("idle")
			raiseWindowFailure("pointer")()
		}
		const watches = [
			watchMaximizeButton(follow),
			watchWindowFocus(resetWhenBlurred),
		].map((watch) => watch.catch(failOnce))
		return () => {
			for (const watch of watches) watch.then((stop) => stop?.())
		}
	}, [])

	return state
}

const WindowCaptionControls = () => {
	const isMaximized = useWindowMaximized()
	const maximizeState = useMaximizeButtonState()

	return (
		<WindowControls
			maximizeButtonRef={observeMaximizeButton}
			maximized={isMaximized}
			maximizeState={maximizeState}
			onClose={runWindowAction("close", closeWindow)}
			onMinimize={runWindowAction("minimize", minimizeWindow)}
			onToggleMaximize={runWindowAction("maximize", toggleMaximizeWindow)}
		/>
	)
}

export const titleBarWindowControls = () =>
	hasCaptionWindowControls() ? <WindowCaptionControls /> : undefined

export const titleBarDragRegion = (): "deep" | undefined =>
	hasCaptionWindowControls() ? "deep" : undefined
