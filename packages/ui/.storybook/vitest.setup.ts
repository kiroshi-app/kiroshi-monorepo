import { getProjectAnnotations } from "virtual:/@storybook/builder-vite/project-annotations.js"

import { composeStory, setProjectAnnotations } from "storybook/preview-api"
import { afterAll } from "vitest"

setProjectAnnotations(getProjectAnnotations())

const EMPTY_STORY = composeStory({}, {})

const unmountTheLastStory = () => EMPTY_STORY.load()

afterAll(unmountTheLastStory)

const RESIZE_OBSERVER_LOOP = "ResizeObserver loop"

const swallowResizeObserverLoop = (event: ErrorEvent) => {
	if (!event.message.includes(RESIZE_OBSERVER_LOOP)) return
	event.stopImmediatePropagation()
	event.preventDefault()
}

window.addEventListener("error", swallowResizeObserverLoop, true)
