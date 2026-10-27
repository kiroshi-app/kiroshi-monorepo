import { useReducedMotion } from "motion/react"
import {
	type ReactNode,
	type UIEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import type { Space } from "@workspace/ui/components/space"
import { SidebarContent } from "@workspace/ui/components/ui/sidebar"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

const CLIPPED_SIDEWAYS = { overflow: { x: "hidden" } } as const

const CAROUSEL_CONTENT = "overflow-y-hidden p-0"

const CONTENT_INSET = "left-column-inset py-0"

const CAROUSEL =
	"flex min-h-0 flex-1 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

const CAROUSEL_SWIPEABLE = "overflow-x-auto"

const CAROUSEL_HELD = "overflow-x-hidden"

const CAROUSEL_PANEL =
	"flex w-full flex-none snap-start snap-always flex-col gap-1 overflow-y-auto overscroll-y-contain left-column-inset py-0"

const NEIGHBOURING = 1

const CROSSING = 0.55

const SETTLING = 150

const isFlushWithPanel = (row: HTMLDivElement) => {
	const under = row.children[Math.round(row.scrollLeft / row.clientWidth)]
	if (!under) return false
	const drift =
		under.getBoundingClientRect().left - row.getBoundingClientRect().left
	return Math.abs(drift) <= 1
}

interface SpacePanelProps {
	scrollKey: string
	isInView: boolean
	scrolls: Map<string, number>
	children: ReactNode
}

const SpacePanel = ({
	scrollKey,
	isInView,
	scrolls,
	children,
}: SpacePanelProps) => {
	const panel = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(panel, { options: CLIPPED_SIDEWAYS })

	return (
		<div
			className={CAROUSEL_PANEL}
			data-slot="space-panel"
			inert={!isInView}
			onScroll={(event) => {
				scrolls.set(scrollKey, event.currentTarget.scrollTop)
			}}
			ref={(node) => {
				panel.current = node
				if (node) node.scrollTop = scrolls.get(scrollKey) ?? 0
			}}
		>
			{children}
		</div>
	)
}

interface SpaceCarouselProps {
	list: AppRailPanel
	spaces: Space[]
	selectedSpaceId?: string
	isSwipeEnabled: boolean
	onSelectSpace?: (id: string) => void
	renderSpace: (space: Space) => ReactNode
}

const SpaceCarousel = ({
	list,
	spaces,
	selectedSpaceId,
	isSwipeEnabled,
	onSelectSpace,
	renderSpace,
}: SpaceCarouselProps) => {
	const viewport = useRef<HTMLDivElement>(null)
	const scrolls = useRef(new Map<string, number>()).current
	const isCut = useReducedMotion() ?? false
	const chosen = Math.max(
		spaces.findIndex((space) => space.id === selectedSpaceId),
		0,
	)
	const [restingOn, setRestingOn] = useState(chosen)
	const covering = useRef(chosen)
	const settling = useRef<ReturnType<typeof setTimeout>>(undefined)

	const restsOn = Math.min(restingOn, spaces.length - 1)
	const firstDrawn = Math.max(restsOn - NEIGHBOURING, 0)
	const nearby = spaces.slice(firstDrawn, restsOn + NEIGHBOURING + 1)
	const chosenSlot = chosen - firstDrawn
	const isBeside = chosenSlot >= 0 && chosenSlot < nearby.length

	useLayoutEffect(() => {
		const node = viewport.current
		if (!node) return
		const restingSlot = restsOn - firstDrawn
		node.scrollLeft = restingSlot * node.clientWidth
	}, [restsOn, firstDrawn])

	useEffect(() => {
		const node = viewport.current
		if (!node || chosen === covering.current) return
		if (!isBeside || isCut) {
			covering.current = chosen
			setRestingOn(chosen)
			return
		}
		node.scrollTo({ behavior: "smooth", left: chosenSlot * node.clientWidth })
	}, [chosen, chosenSlot, isBeside, isCut])

	const spaceCrossed = (node: HTMLDivElement) => {
		const drifted =
			firstDrawn + node.scrollLeft / node.clientWidth - covering.current
		if (Math.abs(drifted) < CROSSING) return covering.current
		return covering.current + Math.round(drifted)
	}

	const settle = () => {
		const node = viewport.current
		if (!node || !isFlushWithPanel(node)) return
		setRestingOn(covering.current)
	}

	const follow = (event: UIEvent<HTMLDivElement>) => {
		clearTimeout(settling.current)
		settling.current = setTimeout(settle, SETTLING)
		const crossed = spaceCrossed(event.currentTarget)
		if (crossed === covering.current) return
		covering.current = crossed
		const space = spaces[crossed]
		if (space && space.id !== selectedSpaceId) onSelectSpace?.(space.id)
	}

	return (
		<div
			className={cn(
				CAROUSEL,
				isSwipeEnabled ? CAROUSEL_SWIPEABLE : CAROUSEL_HELD,
			)}
			data-slot="space-carousel"
			onScroll={follow}
			ref={viewport}
		>
			{nearby.map((space) => {
				const scrollKey = `${list}:${space.id}`
				return (
					<SpacePanel
						isInView={space.id === selectedSpaceId}
						key={scrollKey}
						scrollKey={scrollKey}
						scrolls={scrolls}
					>
						{renderSpace(space)}
					</SpacePanel>
				)
			})}
		</div>
	)
}

interface AppSidebarListProps extends SpaceCarouselProps {
	isPerSpace: boolean
	children: ReactNode
}

const AppSidebarList = ({
	isPerSpace,
	children,
	...carousel
}: AppSidebarListProps) =>
	isPerSpace ? (
		<SidebarContent className={CAROUSEL_CONTENT}>
			<SpaceCarousel {...carousel} />
		</SidebarContent>
	) : (
		<SidebarContent className={CONTENT_INSET}>{children}</SidebarContent>
	)

export { AppSidebarList }
