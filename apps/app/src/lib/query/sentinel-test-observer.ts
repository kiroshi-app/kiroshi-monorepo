import { act } from "@testing-library/react"
import { vi } from "vitest"

type SentinelWatch = {
	onReport: IntersectionObserverCallback
	options?: IntersectionObserverInit
	sentinels: Set<Element>
}

export type SentinelScroll = {
	scrollInto: (sentinel: Element) => Promise<void>
	scrollAway: (sentinel: Element) => Promise<void>
	watchesOf: (sentinel: Element) => IntersectionObserverInit[]
}

export const stubSentinelObserver = (): SentinelScroll => {
	const watches = new Set<SentinelWatch>()

	class SentinelObserver {
		private readonly watch: SentinelWatch

		constructor(
			onReport: IntersectionObserverCallback,
			options?: IntersectionObserverInit,
		) {
			this.watch = { onReport, options, sentinels: new Set() }
		}

		observe(sentinel: Element) {
			this.watch.sentinels.add(sentinel)
			watches.add(this.watch)
		}

		disconnect() {
			watches.delete(this.watch)
		}
	}

	vi.stubGlobal("IntersectionObserver", SentinelObserver)

	const watchingOf = (sentinel: Element) =>
		[...watches].filter(({ sentinels }) => sentinels.has(sentinel))

	const report = (sentinel: Element, isIntersecting: boolean) =>
		act(async () => {
			for (const { onReport } of watchingOf(sentinel)) {
				onReport(
					[{ isIntersecting, target: sentinel } as IntersectionObserverEntry],
					{} as IntersectionObserver,
				)
			}
		})

	return {
		scrollInto: (sentinel) => report(sentinel, true),
		scrollAway: (sentinel) => report(sentinel, false),
		watchesOf: (sentinel) =>
			watchingOf(sentinel).map(({ options }) => options ?? {}),
	}
}
