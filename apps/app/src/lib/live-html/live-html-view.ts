import type {
	LiveHtmlPlacement,
	LiveHtmlRect,
} from "@workspace/ui/components/live-html-slot"

import { commands, type LiveHtmlError } from "@/lib/bindings"

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
	radius: number
	isHidden: boolean
}

type Step = () => Promise<void>

const UNMOUNTED: DrawnView = {
	isMounted: false,
	placement: null,
	radius: 0,
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

const largestRadiusOf = ({ radius }: LiveHtmlPlacement) =>
	radius &&
	Math.max(
		radius.topLeft,
		radius.topRight,
		radius.bottomRight,
		radius.bottomLeft,
	)

const answered = async <Data>(answer: CommandAnswer<Data>) => {
	const result = await answer
	if (result.status === "error") throw result.error
	return result.data
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
	drawStill,
	dropStill,
}: LiveHtmlViewOptions) => {
	let wantedPlacement: LiveHtmlPlacement | null = null
	let isCovered = false
	let coverChanges = 0
	let isStillDue = false
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
				isStillDue = false
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
		(radius: number): Step =>
		() =>
			attempt(commands.liveHtmlRound(id, radius), () => {
				drawn = { ...drawn, radius }
			})

	const hide: Step = () =>
		attempt(commands.liveHtmlHide(id), () => {
			drawn = { ...drawn, isHidden: true }
		})

	const show: Step = () =>
		attempt(commands.liveHtmlShow(id), () => {
			drawn = { ...drawn, isHidden: false }
		})

	const takeStill: Step = async () => {
		isStillDue = false
		const coverChangesWhenAsked = coverChanges
		try {
			const still = await answered(commands.liveHtmlStill(id))
			if (coverChangesWhenAsked !== coverChanges) return
			isStillDrawn = true
			await drawStill(still)
		} catch (reason) {
			console.error(`live html: the view ${id} hides without a still`, reason)
		}
	}

	const eraseStill: Step = async () => {
		isStillDrawn = false
		dropStill()
	}

	const drawTowards = (placement: LiveHtmlPlacement): Step | null => {
		if (isInSight(placement) && !isSamePlacement(drawn.placement, placement)) {
			return place(placement)
		}
		const radius = largestRadiusOf(placement)
		if (radius !== undefined && radius !== drawn.radius) return round(radius)
		return null
	}

	const hidingStep = (placement: LiveHtmlPlacement): Step =>
		isStillDue && isInSight(placement) ? takeStill : hide

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
		isStillDue = covered
		coverChanges += 1
		void settle()
	}

	const isUnder = (surface: LiveHtmlRect) =>
		wantedPlacement !== null && overlaps(wantedPlacement.clip, surface)

	return { id, follow, cover, fail, isUnder }
}
