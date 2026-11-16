import {
	type ComponentProps,
	createContext,
	type ReactNode,
	useContext,
} from "react"

import { cn } from "@workspace/ui/lib/utils"

const AppHeaderContext = createContext(false)

const useIsInAppHeader = () => useContext(AppHeaderContext)

const APP_HEADER_TITLE =
	"truncate font-semibold text-foreground text-sm leading-4.5"

const APP_HEADER_CAPSULE_FILL = "bg-foreground/5 dark:bg-white/6"

const APP_HEADER_CONTROL =
	"relative flex shrink-0 items-center justify-center rounded-full text-soft-foreground outline-ring transition-none hover:bg-foreground/6 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-background active:bg-foreground/12 active:text-foreground aria-expanded:bg-foreground/6 aria-expanded:text-foreground in-data-content-card:focus-visible:ring-card dark:active:bg-white/16 dark:aria-expanded:bg-white/10 dark:hover:bg-white/10 [&_svg]:pointer-events-none [&_svg]:shrink-0"

const APP_HEADER_BUTTON_KIND = {
	capsule: "h-7 min-w-7 [&_svg]:size-4",
	subject: "size-7 text-muted-foreground [&_svg]:size-3.5",
	close: cn("size-8 [&_svg]:size-4", APP_HEADER_CAPSULE_FILL),
}

type AppHeaderButtonKind = keyof typeof APP_HEADER_BUTTON_KIND

interface AppHeaderButtonProps extends ComponentProps<"button"> {
	"aria-label": string
	kind?: AppHeaderButtonKind
}

const AppHeaderButton = ({
	kind = "capsule",
	className,
	...props
}: AppHeaderButtonProps) => (
	<button
		type="button"
		data-kind={kind}
		data-slot="app-header-button"
		className={cn(APP_HEADER_CONTROL, APP_HEADER_BUTTON_KIND[kind], className)}
		{...props}
	/>
)

const AppHeaderPathLink = ({
	className,
	...props
}: ComponentProps<"button">) => (
	<button
		type="button"
		data-slot="app-header-path-link"
		className={cn(
			"relative min-w-0 truncate rounded-[4px] text-muted-foreground decoration-1 outline-ring transition-none after:absolute after:inset-x-0 after:-inset-y-1 hover:text-foreground hover:underline focus-visible:outline-2 active:text-soft-foreground active:underline",
			className,
		)}
		{...props}
	/>
)

const AppHeaderPathSeparator = () => (
	<span
		aria-hidden="true"
		className="shrink-0 text-[#a3a3a3] dark:text-[#6b6b6b]"
		data-slot="app-header-path-separator"
	>
		/
	</span>
)

const AppHeaderCapsule = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		className={cn(
			"flex shrink-0 items-center gap-0.5 rounded-full p-0.5 empty:hidden",
			APP_HEADER_CAPSULE_FILL,
			className,
		)}
		data-slot="app-header-capsule"
		{...props}
	/>
)

type AppHeaderTextProps = {
	topLine?: ReactNode
	children: ReactNode
}

const AppHeaderText = ({ topLine, children }: AppHeaderTextProps) => (
	<div className="flex min-w-0 flex-col" data-slot="app-header-text">
		{topLine ? (
			<div
				className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs leading-4"
				data-slot="app-header-top-line"
			>
				{topLine}
			</div>
		) : null}
		{children}
	</div>
)

type AppHeaderProps = Omit<ComponentProps<"header">, "children"> & {
	leading?: ReactNode
	trailing?: ReactNode
	close?: ReactNode
	insetWindowControls?: boolean
	windowControls?: ReactNode
}

const AppHeader = ({
	leading,
	trailing,
	close,
	insetWindowControls = false,
	windowControls,
	className,
	...props
}: AppHeaderProps) => (
	<header
		data-slot="app-header"
		className={cn(
			"flex h-14 shrink-0 items-center gap-3 border-foreground/8 border-b px-3 pt-3 pb-[calc(--spacing(3)_-_1px)] dark:border-white/8",
			insetWindowControls && "pl-22",
			windowControls && "pr-0",
			className,
		)}
		{...props}
	>
		<AppHeaderContext.Provider value={true}>
			{leading ? (
				<div
					className="flex min-w-0 flex-1 items-center gap-2.5"
					data-slot="app-header-leading"
				>
					{leading}
				</div>
			) : null}
			{trailing ? (
				<AppHeaderCapsule className="ms-auto">{trailing}</AppHeaderCapsule>
			) : null}
			{close}
			{windowControls ? (
				<div
					className="-mt-3 -mb-[calc(--spacing(3)_-_1px)] ms-auto flex shrink-0 self-stretch"
					data-slot="app-header-window-controls"
				>
					{windowControls}
				</div>
			) : null}
		</AppHeaderContext.Provider>
	</header>
)

export {
	APP_HEADER_CAPSULE_FILL,
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderButton,
	AppHeaderCapsule,
	AppHeaderPathLink,
	AppHeaderPathSeparator,
	AppHeaderText,
	useIsInAppHeader,
}
