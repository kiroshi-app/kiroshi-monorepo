"use client"

import { useTranslation } from "react-i18next"

import {
	OnboardingButton,
	OnboardingLink,
} from "@workspace/ui/components/onboarding-shell"
import { cn } from "@workspace/ui/lib/utils"

type OnboardingWelcomeFooterProps = {
	step: number
	total: number
	actionLabel: string
	onSkip: () => void
	onAction: () => void
}

const OnboardingWelcomeFooter = ({
	step,
	total,
	actionLabel,
	onSkip,
	onAction,
}: OnboardingWelcomeFooterProps) => {
	const { t } = useTranslation("chat")
	const isLastStep = step === total

	return (
		<div
			className="flex h-22 w-full shrink-0 items-center justify-between gap-3 px-6 sm:px-8"
			data-slot="onboarding-welcome-footer"
		>
			<div
				className={cn("flex w-40 min-w-0", isLastStep && "invisible")}
				data-slot="onboarding-welcome-skip"
			>
				<OnboardingLink onClick={onSkip}>
					{t("onboarding.intro.skip")}
				</OnboardingLink>
			</div>
			<div className="flex items-center gap-3">
				<div aria-hidden="true" className="flex items-center gap-1.5">
					{Array.from({ length: total }, (_, index) => index + 1).map((dot) => (
						<span
							className={cn(
								"h-1.5 rounded-full",
								dot === step
									? "w-4.5 bg-foreground"
									: "w-1.5 bg-muted-foreground/30",
							)}
							data-current={dot === step}
							data-slot="onboarding-step-dot"
							key={dot}
						/>
					))}
				</div>
				<p className="whitespace-nowrap text-compact text-muted-foreground tabular-nums leading-4.5">
					{t("onboarding.step", { step, total })}
				</p>
			</div>
			<div className="flex w-40 min-w-0 justify-end">
				<OnboardingButton onClick={onAction}>{actionLabel}</OnboardingButton>
			</div>
		</div>
	)
}

export { OnboardingWelcomeFooter, type OnboardingWelcomeFooterProps }
