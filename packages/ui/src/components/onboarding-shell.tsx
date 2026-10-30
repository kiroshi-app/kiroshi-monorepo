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

type OnboardingContentProps = ComponentProps<"div">

const OnboardingContent = ({ className, ...props }: OnboardingContentProps) => (
	<div
		className={cn(
			"flex h-88 min-h-0 w-full shrink-0 flex-col items-center justify-end",
			className,
		)}
		data-slot="onboarding-content"
		{...props}
	/>
)

type OnboardingControlsProps = ComponentProps<"div">

const OnboardingControls = ({
	className,
	...props
}: OnboardingControlsProps) => (
	<div
		className={cn(
			"flex h-30 w-full shrink-0 flex-col items-center gap-3 pt-3",
			className,
		)}
		data-slot="onboarding-controls"
		{...props}
	/>
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
			"flex max-w-full shrink-0 flex-col gap-2.5 text-center",
			variant === "welcome" ? "w-105" : "w-120",
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
	variant?: "default" | "outline" | "ghost"
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

type OnboardingSecondaryButtonProps = Omit<
	OnboardingButtonProps,
	"variant" | "className"
>

const OnboardingSecondaryButton = (props: OnboardingSecondaryButtonProps) => (
	<OnboardingButton
		className="h-10 px-6 text-muted-foreground"
		variant="ghost"
		{...props}
	/>
)

export {
	OnboardingButton,
	type OnboardingButtonProps,
	OnboardingContent,
	type OnboardingContentProps,
	OnboardingControls,
	type OnboardingControlsProps,
	OnboardingDragStrip,
	OnboardingHeading,
	type OnboardingHeadingProps,
	OnboardingLink,
	type OnboardingLinkProps,
	OnboardingSecondaryButton,
	type OnboardingSecondaryButtonProps,
	OnboardingShell,
	type OnboardingShellProps,
}
