import "@storybook/addon-vitest/internal/setup-file"

import { getProjectAnnotations } from "virtual:/@storybook/builder-vite/project-annotations.js"

import { composeStory, setProjectAnnotations } from "storybook/preview-api"
import { afterAll } from "vitest"
import { cdp } from "vitest/browser"

setProjectAnnotations(getProjectAnnotations())

const unmountTheLastStory = () => composeStory({}, {}).load()

const freeTheDocumentsOfTheStoryFilesAlreadyPlayed = () =>
	cdp().send("HeapProfiler.collectGarbage")

afterAll(freeTheDocumentsOfTheStoryFilesAlreadyPlayed)
afterAll(unmountTheLastStory)

const RESIZE_OBSERVER_LOOP = "ResizeObserver loop"

const swallowResizeObserverLoop = (event: Event) => {
	if (!(event instanceof ErrorEvent)) return
	if (!event.message.includes(RESIZE_OBSERVER_LOOP)) return
	event.stopImmediatePropagation()
	event.preventDefault()
}

window.addEventListener("error", swallowResizeObserverLoop, true)
