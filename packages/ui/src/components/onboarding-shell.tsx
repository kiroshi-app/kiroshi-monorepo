import type { ComponentProps } from "react"

import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const OnboardingDragStrip = () => (
	<div
		aria-hidden="true"
		className="sticky top-0 -mb-12 h-12 shrink-0"
		data-slot="onboarding-drag-strip"
		data-tauri-drag-region="deep"
	/>
)

type OnboardingShellProps = ComponentProps<"div">

const OnboardingShell = ({ className, ...props }: OnboardingShellProps) => (
	<FullWindowLayout data-slot="onboarding-shell">
		<OnboardingDragStrip />
		<FullWindowContent className={cn("w-full px-6", className)} {...props} />
	</FullWindowLayout>
)

type OnboardingHeadingProps = {
	variant: "welcome" | "connect"
	title: string
	body: string
	bodyId?: string
}

const OnboardingHeading = ({
	variant,
	title,
	body,
	bodyId,
}: OnboardingHeadingProps) => (
	<div
		className={cn(
			"flex w-105 max-w-full flex-col text-center",
			variant === "welcome" ? "gap-2.5" : "gap-2",
		)}
	>
		<h1 className="font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]">
			{title}
		</h1>
		<p className="text-muted-foreground text-sm" id={bodyId}>
			{body}
		</p>
	</div>
)

type OnboardingLinkProps = Omit<ComponentProps<"button">, "type">

const OnboardingLink = ({ className, ...props }: OnboardingLinkProps) => (
	<button
		className={cn(
			"relative rounded-xs font-medium text-compact text-foreground leading-4.5 underline decoration-1 underline-offset-2 outline-none after:absolute focus-visible:ring-3 focus-visible:ring-ring/30 after:-inset-1",
			className,
		)}
		type="button"
		{...props}
	/>
)

type OnboardingButtonProps = Omit<
	ComponentProps<typeof Button>,
	"variant" | "size"
> & {
	variant?: "default" | "outline"
}

const OnboardingButton = ({ className, ...props }: OnboardingButtonProps) => (
	<Button
		className={cn(
			"rounded-full bg-clip-border px-5 leading-4.5 transition-none data-disabled:pointer-events-none data-disabled:opacity-50",
			className,
		)}
		focusableWhenDisabled
		size="lg"
		{...props}
	/>
)

export {
	OnboardingButton,
	type OnboardingButtonProps,
	OnboardingDragStrip,
	OnboardingHeading,
	type OnboardingHeadingProps,
	OnboardingLink,
	type OnboardingLinkProps,
	OnboardingShell,
	type OnboardingShellProps,
}
