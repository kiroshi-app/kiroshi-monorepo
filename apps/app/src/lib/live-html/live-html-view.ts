import type {
	LiveHtmlPlacement,
	LiveHtmlRect,
} from "@workspace/ui/components/live-html-slot"

import { commands, type LiveHtmlError } from "@/lib/bindings"

type CommandAnswer = Promise<
	{ status: "ok"; data: null } | { status: "error"; error: LiveHtmlError }
>

export type MountLiveHtml = (
	id: string,
	rectangle: LiveHtmlRect,
) => CommandAnswer

type LiveHtmlViewOptions = {
	id: string
	mountAt: MountLiveHtml
	onLive: () => void
	onFailure: (reason: unknown) => void
}

type DrawnView = {
	isMounted: boolean
	placement: LiveHtmlPlacement | null
	isHidden: boolean
}

type Step = () => Promise<void>

const UNMOUNTED: DrawnView = {
	isMounted: false,
	placement: null,
	isHidden: false,
}

const isSameRect = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isSamePlacement = (a: LiveHtmlPlacement | null, b: LiveHtmlPlacement) =>
	a !== null && isSameRect(a.rect, b.rect) && isSameRect(a.clip, b.clip)

const isInSight = ({ clip }: LiveHtmlPlacement) =>
	clip.width > 0 && clip.height > 0

const answered = async (answer: CommandAnswer) => {
	const result = await answer
	if (result.status === "error") throw result.error
}

export const mountingHtml =
	(html: string): MountLiveHtml =>
	(id, rectangle) =>
		commands.liveHtmlMount(id, html, rectangle)

export const mountingAttachment =
	(path: string): MountLiveHtml =>
	(id, rectangle) =>
		commands.liveHtmlMountAttachment(id, path, rectangle)

export const createLiveHtmlView = ({
	id,
	mountAt,
	onLive,
	onFailure,
}: LiveHtmlViewOptions) => {
	let wantedPlacement: LiveHtmlPlacement | null = null
	let isCovered = false
	let drawn = UNMOUNTED
	let hasFailed = false
	let isSettling = false

	const fail = (reason: unknown) => {
		if (!hasFailed) onFailure(reason)
		hasFailed = true
		void settle()
	}

	const attempt = async (answer: CommandAnswer, onDone: () => void) => {
		try {
			await answered(answer)
			onDone()
		} catch (reason) {
			fail(reason)
		}
	}

	const remove: Step = async () => {
		drawn = UNMOUNTED
		await attempt(commands.liveHtmlRemove(id), () => undefined)
	}

	const mount =
		(placement: LiveHtmlPlacement): Step =>
		() =>
			attempt(mountAt(id, placement.rect), () => {
				drawn = { isMounted: true, placement: null, isHidden: false }
				onLive()
			})

	const place =
		(placement: LiveHtmlPlacement): Step =>
		() =>
			attempt(
				commands.liveHtmlPlace(id, placement.rect, placement.clip),
				() => {
					drawn = { ...drawn, placement }
				},
			)

	const hide: Step = () =>
		attempt(commands.liveHtmlHide(id), () => {
			drawn = { ...drawn, isHidden: true }
		})

	const show: Step = () =>
		attempt(commands.liveHtmlShow(id), () => {
			drawn = { ...drawn, isHidden: false }
		})

	const stepTowards = (placement: LiveHtmlPlacement): Step | null => {
		const isSeen = isInSight(placement)
		const shouldHide = isCovered || !isSeen
		if (!drawn.isMounted) return isSeen ? mount(placement) : null
		if (shouldHide && !drawn.isHidden) return hide
		if (isSeen && !isSamePlacement(drawn.placement, placement)) {
			return place(placement)
		}
		return !shouldHide && drawn.isHidden ? show : null
	}

	const nextStep = (): Step | null => {
		if (hasFailed || wantedPlacement === null) {
			return drawn.isMounted ? remove : null
		}
		return stepTowards(wantedPlacement)
	}

	const settle = async () => {
		if (isSettling) return
		isSettling = true
		for (let step = nextStep(); step; step = nextStep()) await step()
		isSettling = false
	}

	const follow = (placement: LiveHtmlPlacement | null) => {
		wantedPlacement = placement
		void settle()
	}

	const cover = (covered: boolean) => {
		isCovered = covered
		void settle()
	}

	return { id, follow, cover, fail }
}
