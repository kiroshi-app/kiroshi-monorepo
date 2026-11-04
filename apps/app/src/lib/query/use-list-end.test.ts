// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ListEndSlot } from "@workspace/ui/components/list-skeleton"

import {
	type SentinelScroll,
	stubSentinelObserver,
} from "./sentinel-test-observer"
import { type ListEndRead, useListEnd } from "./use-list-end"

const PRELOAD_MARGIN = "300px 0px 0px 0px"

const ListEndProbe = (read: ListEndRead) =>
	createElement(ListEndSlot, { listEnd: useListEnd(read), row: null })

type Deferred = {
	promise: Promise<boolean>
	settle: (hasLanded: boolean) => void
	reject: (reason: Error) => void
}

const deferredPage = (): Deferred => {
	let settle: (hasLanded: boolean) => void = () => undefined
	let reject: (reason: Error) => void = () => undefined
	const promise = new Promise<boolean>((resolve, refuse) => {
		settle = resolve
		reject = refuse
	})
	return { promise, settle, reject }
}

const settlePage = (page: Deferred, hasLanded: boolean) =>
	act(async () => page.settle(hasLanded))

const pagesInOrder = (pages: Deferred[]) => {
	let next = 0
	return vi.fn(() => {
		const page = pages[next] ?? deferredPage()
		next += 1
		return page.promise
	})
}

const sentinel = () => {
	const found = document.querySelector('[data-slot="list-end-sentinel"]')
	if (!found) {
		throw new Error("no list end sentinel")
	}
	return found
}

const scrollContainer = () => {
	const scroller = document.createElement("div")
	scroller.style.overflowY = "auto"
	return document.body.appendChild(scroller)
}

const mount = (read: ListEndRead, container = scrollContainer()) => {
	const view = render(createElement(ListEndProbe, read), { container })
	return (next: Partial<ListEndRead>) =>
		view.rerender(createElement(ListEndProbe, { ...read, ...next }))
}

let scroll: SentinelScroll

beforeEach(() => {
	scroll = stubSentinelObserver()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("useListEnd", () => {
	it("watches the sentinel from its scroll container with the preload margin and loads once it comes within reach", async () => {
		const loadMore = pagesInOrder([])
		const scroller = scrollContainer()
		mount(
			{ hasMore: true, isLoading: false, loadMore, rootMargin: PRELOAD_MARGIN },
			scroller,
		)

		expect(scroll.watchesOf(sentinel())).toEqual([
			{ root: scroller, rootMargin: PRELOAD_MARGIN },
		])
		expect(loadMore).not.toHaveBeenCalled()

		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(1)
	})

	it("issues no second request while a page loads", async () => {
		const loadMore = pagesInOrder([deferredPage()])
		const rerender = mount({ hasMore: true, isLoading: false, loadMore })

		await scroll.scrollInto(sentinel())
		rerender({ isLoading: true })
		await scroll.scrollAway(sentinel())
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(1)
	})

	it("requests nothing after a failed page until the person scrolls again", async () => {
		const failed = deferredPage()
		const loadMore = pagesInOrder([failed])
		const rerender = mount({ hasMore: true, isLoading: false, loadMore })

		await scroll.scrollInto(sentinel())
		rerender({ isLoading: true })
		rerender({ isLoading: false })
		await scroll.scrollInto(sentinel())
		await settlePage(failed, false)
		await scroll.scrollInto(sentinel())
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(1)

		await scroll.scrollAway(sentinel())
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(2)
	})

	it("requests again after a rejected page only once the person scrolls away and back", async () => {
		const rejected = deferredPage()
		const loadMore = pagesInOrder([rejected])
		mount({ hasMore: true, isLoading: false, loadMore })

		await scroll.scrollInto(sentinel())
		await act(async () => rejected.reject(new Error("read refused")))
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(1)

		await scroll.scrollAway(sentinel())
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(2)
	})

	it("loads exactly one further page per landed page while the sentinel stays within reach", async () => {
		const first = deferredPage()
		const second = deferredPage()
		const loadMore = pagesInOrder([first, second])
		const rerender = mount({ hasMore: true, isLoading: false, loadMore })

		await scroll.scrollInto(sentinel())
		rerender({ isLoading: true })
		await settlePage(first, true)
		rerender({ isLoading: false })
		await scroll.scrollInto(sentinel())
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(2)

		rerender({ isLoading: true })
		await settlePage(second, true)
		rerender({ isLoading: false })
		await scroll.scrollInto(sentinel())

		expect(loadMore).toHaveBeenCalledTimes(3)
	})

	it("requests nothing once there is no more to load", async () => {
		const loadMore = pagesInOrder([])
		const rerender = mount({ hasMore: true, isLoading: false, loadMore })

		rerender({ hasMore: false })

		expect(document.querySelector('[data-slot="list-end-sentinel"]')).toBeNull()
		expect(loadMore).not.toHaveBeenCalled()
	})
})
