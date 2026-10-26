import { getProjectAnnotations } from "virtual:/@storybook/builder-vite/project-annotations.js"

import { setProjectAnnotations } from "storybook/preview-api"

setProjectAnnotations(getProjectAnnotations())

const RESIZE_OBSERVER_LOOP = "ResizeObserver loop"

const swallowResizeObserverLoop = (event: ErrorEvent) => {
	if (!event.message.includes(RESIZE_OBSERVER_LOOP)) return
	event.stopImmediatePropagation()
	event.preventDefault()
}

window.addEventListener("error", swallowResizeObserverLoop, true)
