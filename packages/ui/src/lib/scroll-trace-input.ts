import {
	now,
	round,
	type ViewportTrace,
} from "@workspace/ui/lib/scroll-trace-model"
import { closeSession } from "@workspace/ui/lib/scroll-trace-record"

const INPUT_QUIET_MS = 600

export const observeAutoscrollingToggles = ({
	viewport,
	active,
}: ViewportTrace) => {
	const toggleObserver = new active.natives.MutationObserver(() => {
		active.toggles.push({
			t: round(now()),
			isOn: viewport.hasAttribute("data-autoscrolling"),
		})
	})
	toggleObserver.observe(viewport, {
		attributeFilter: ["data-autoscrolling"],
		attributes: true,
	})
	return () => toggleObserver.disconnect()
}

export const listenToInput = (trace: ViewportTrace) => {
	const { viewport, content, active } = trace
	const onInput = () => {
		active.inputUntil = now() + INPUT_QUIET_MS
		active.isAwaitingStop = true
		closeSession(trace)
	}
	const onWheel = (event: WheelEvent) => {
		active.pendingWheel += event.deltaY
		onInput()
	}
	const onPointerDown = () => {
		active.isPointerDown = true
		onInput()
	}
	const onPointerUp = () => {
		if (!active.isPointerDown) return
		active.isPointerDown = false
		onInput()
	}
	const onVisibilityState = (event: Event) => {
		if (event.target instanceof Element) {
			active.cvEventFrames.set(event.target, active.frame)
		}
	}

	viewport.addEventListener("wheel", onWheel, { passive: true })
	viewport.addEventListener("touchmove", onInput, { passive: true })
	viewport.addEventListener("keydown", onInput)
	viewport.addEventListener("pointerdown", onPointerDown)
	window.addEventListener("pointerup", onPointerUp)
	window.addEventListener("pointercancel", onPointerUp)
	content?.addEventListener(
		"contentvisibilityautostatechange",
		onVisibilityState,
		true,
	)

	return () => {
		viewport.removeEventListener("wheel", onWheel)
		viewport.removeEventListener("touchmove", onInput)
		viewport.removeEventListener("keydown", onInput)
		viewport.removeEventListener("pointerdown", onPointerDown)
		window.removeEventListener("pointerup", onPointerUp)
		window.removeEventListener("pointercancel", onPointerUp)
		content?.removeEventListener(
			"contentvisibilityautostatechange",
			onVisibilityState,
			true,
		)
	}
}
