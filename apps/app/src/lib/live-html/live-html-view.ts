import type {
	LiveHtmlPlacement,
	LiveHtmlRect,
} from "@workspace/ui/components/live-html-slot"

import {
	commands,
	type LiveHtmlCorners,
	type LiveHtmlError,
} from "@/lib/bindings"

type CommandAnswer<Data = null> = Promise<
	{ status: "ok"; data: Data } | { status: "error"; error: LiveHtmlError }
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
	drawStill: (still: string) => Promise<void>
	dropStill: () => void
}

type DrawnView = {
	isMounted: boolean
	placement: LiveHtmlPlacement | null
	corners: LiveHtmlCorners
	isHidden: boolean
}

type Step = () => Promise<void>

const SQUARE: LiveHtmlCorners = {
	topLeft: 0,
	topRight: 0,
	bottomRight: 0,
	bottomLeft: 0,
}

const UNMOUNTED: DrawnView = {
	isMounted: false,
	placement: null,
	corners: SQUARE,
	isHidden: false,
}

const isSameRect = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isSamePlacement = (a: LiveHtmlPlacement | null, b: LiveHtmlPlacement) =>
	a !== null && isSameRect(a.rect, b.rect) && isSameRect(a.clip, b.clip)

const isInSight = ({ clip }: LiveHtmlPlacement) =>
	clip.width > 0 && clip.height > 0

const overlaps = (a: LiveHtmlRect, b: LiveHtmlRect) =>
	a.x < b.x + b.width &&
	b.x < a.x + a.width &&
	a.y < b.y + b.height &&
	b.y < a.y + a.height

const isSameCorners = (a: LiveHtmlCorners, b: LiveHtmlCorners) =>
	a.topLeft === b.topLeft &&
	a.topRight === b.topRight &&
	a.bottomRight === b.bottomRight &&
	a.bottomLeft === b.bottomLeft

const STILL_BOUND_MS = 500

const drawnBy = (deadline: number, drawing: Promise<void>) => {
	let timeout: ReturnType<typeof setTimeout> | undefined
	const late = new Promise<never>((_, reject) => {
		timeout = setTimeout(
			() => reject(new Error(`no still drawn within ${STILL_BOUND_MS} ms`)),
			deadline - Date.now(),
		)
	})
	return Promise.race([drawing, late]).finally(() => clearTimeout(timeout))
}

const answered = async <Data>(answer: CommandAnswer<Data>) => {
	const result = await answer
	if (result.status === "error") throw result.error
	return result.data
}

export const mountingHtml =
	(html: string): MountLiveHtml =>
	(id, rectangle) =>
		commands.liveHtmlMount(id, html, rectangle, null)

export const mountingAttachment =
	(path: string): MountLiveHtml =>
	(id, rectangle) =>
		commands.liveHtmlMountAttachment(id, path, rectangle, null)

export const createLiveHtmlView = ({
	id,
	mountAt,
	onLive,
	onFailure,
	drawStill,
	dropStill,
}: LiveHtmlViewOptions) => {
	let wantedPlacement: LiveHtmlPlacement | null = null
	let isCovered = false
	let stillDueBy: number | null = null
	let awaitedStill = 0
	let isStillDrawn = false
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
				drawn = { ...UNMOUNTED, isMounted: true }
				stillDueBy = null
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

	const round =
		(corners: LiveHtmlCorners): Step =>
		() =>
			attempt(commands.liveHtmlRound(id, corners), () => {
				drawn = { ...drawn, corners }
			})

	const hide: Step = () =>
		attempt(commands.liveHtmlHide(id), () => {
			drawn = { ...drawn, isHidden: true }
		})

	const show: Step = () =>
		attempt(commands.liveHtmlShow(id), () => {
			drawn = { ...drawn, isHidden: false }
		})

	const eraseStill: Step = async () => {
		isStillDrawn = false
		dropStill()
	}

	const drawAwaitedStill = async (asked: number) => {
		const still = await answered(commands.liveHtmlStill(id))
		if (asked !== awaitedStill) return
		isStillDrawn = true
		await drawStill(still)
	}

	const takeStill =
		(deadline: number): Step =>
		async () => {
			stillDueBy = null
			awaitedStill += 1
			try {
				await drawnBy(deadline, drawAwaitedStill(awaitedStill))
			} catch (reason) {
				awaitedStill += 1
				if (isStillDrawn) await eraseStill()
				console.error(`live html: the view ${id} hides without a still`, reason)
			}
		}

	const drawTowards = (placement: LiveHtmlPlacement): Step | null => {
		if (isInSight(placement) && !isSamePlacement(drawn.placement, placement)) {
			return place(placement)
		}
		const { radius } = placement
		if (radius && !isSameCorners(radius, drawn.corners)) return round(radius)
		return null
	}

	const hidingStep = (placement: LiveHtmlPlacement): Step =>
		stillDueBy !== null && isInSight(placement) ? takeStill(stillDueBy) : hide

	const uncoveringStep = (placement: LiveHtmlPlacement): Step | null => {
		if (isCovered) return null
		if (isInSight(placement) && drawn.isHidden) return show
		return isStillDrawn ? eraseStill : null
	}

	const stepTowards = (placement: LiveHtmlPlacement): Step | null => {
		const isSeen = isInSight(placement)
		if (!drawn.isMounted) return isSeen ? mount(placement) : null
		if ((isCovered || !isSeen) && !drawn.isHidden) return hidingStep(placement)
		return drawTowards(placement) ?? uncoveringStep(placement)
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
		if (covered === isCovered) return
		isCovered = covered
		stillDueBy = covered ? Date.now() + STILL_BOUND_MS : null
		awaitedStill += 1
		void settle()
	}

	const isUnder = (surface: LiveHtmlRect) =>
		wantedPlacement !== null && overlaps(wantedPlacement.clip, surface)

	return { id, follow, cover, fail, isUnder }
}
