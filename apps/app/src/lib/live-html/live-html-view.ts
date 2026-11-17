import type { LiveHtmlRect } from "@workspace/ui/components/live-html-slot"

import { commands, type LiveHtmlError } from "@/lib/bindings"
import type { LiveHtmlGeometry } from "@/lib/live-html/live-html-ui-shapes"

type CommandAnswer = Promise<
	{ status: "ok"; data: null } | { status: "error"; error: LiveHtmlError }
>

type LiveHtmlViewOptions = {
	id: string
	html: string
	onLive: () => void
	onFailure: (reason: unknown) => void
}

type DrawnView = {
	isMounted: boolean
	geometry: LiveHtmlGeometry | null
	isHidden: boolean
}

type Step = () => Promise<void>

const UNMOUNTED: DrawnView = {
	isMounted: false,
	geometry: null,
	isHidden: false,
}

const isSameRect = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isSameGeometry = (a: LiveHtmlGeometry | null, b: LiveHtmlGeometry) =>
	a !== null && isSameRect(a.rect, b.rect) && isSameRect(a.clip, b.clip)

const isOnScreen = ({ clip }: LiveHtmlGeometry) =>
	clip.width > 0 && clip.height > 0

const answered = async (answer: CommandAnswer) => {
	const result = await answer
	if (result.status === "error") throw result.error
}

export const createLiveHtmlView = ({
	id,
	html,
	onLive,
	onFailure,
}: LiveHtmlViewOptions) => {
	let wantedGeometry: LiveHtmlGeometry | null = null
	let isCovered = false
	let drawn = UNMOUNTED
	let hasFailed = false
	let isSettling = false

	const attempt = async (answer: CommandAnswer, onDone: () => void) => {
		try {
			await answered(answer)
			onDone()
		} catch (reason) {
			hasFailed = true
			onFailure(reason)
		}
	}

	const remove: Step = async () => {
		drawn = UNMOUNTED
		await attempt(commands.liveHtmlRemove(id), () => undefined)
	}

	const mount =
		(geometry: LiveHtmlGeometry): Step =>
		() =>
			attempt(commands.liveHtmlMount(id, html, geometry.rect), () => {
				drawn = { isMounted: true, geometry: null, isHidden: false }
				onLive()
			})

	const place =
		(geometry: LiveHtmlGeometry): Step =>
		() =>
			attempt(commands.liveHtmlPlace(id, geometry.rect, geometry.clip), () => {
				drawn = { ...drawn, geometry }
			})

	const hide: Step = () =>
		attempt(commands.liveHtmlHide(id), () => {
			drawn = { ...drawn, isHidden: true }
		})

	const show: Step = () =>
		attempt(commands.liveHtmlShow(id), () => {
			drawn = { ...drawn, isHidden: false }
		})

	const stepTowards = (geometry: LiveHtmlGeometry): Step | null => {
		if (!drawn.isMounted) return mount(geometry)
		if (isCovered && !drawn.isHidden) return hide
		if (!isSameGeometry(drawn.geometry, geometry)) return place(geometry)
		return !isCovered && drawn.isHidden ? show : null
	}

	const nextStep = (): Step | null => {
		if (hasFailed || wantedGeometry === null) {
			return drawn.isMounted ? remove : null
		}
		return stepTowards(wantedGeometry)
	}

	const settle = async () => {
		if (isSettling) return
		isSettling = true
		for (let step = nextStep(); step; step = nextStep()) await step()
		isSettling = false
	}

	const follow = (geometry: LiveHtmlGeometry | null) => {
		wantedGeometry = geometry && isOnScreen(geometry) ? geometry : null
		void settle()
	}

	const cover = (covered: boolean) => {
		isCovered = covered
		void settle()
	}

	return { follow, cover }
}
