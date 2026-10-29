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
	onBack: () => void
	onAction: () => void
}

const OnboardingWelcomeFooter = ({
	step,
	total,
	actionLabel,
	onSkip,
	onBack,
	onAction,
}: OnboardingWelcomeFooterProps) => {
	const { t } = useTranslation("chat")
	const isFirstStep = step === 1
	const isLastStep = step === total

	return (
		<div
			className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
			data-slot="onboarding-welcome-footer"
		>
			<div
				className={cn("flex", isLastStep && "invisible")}
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
			<div className="flex items-center gap-3">
				<div
					className={cn("flex", isFirstStep && "invisible")}
					data-slot="onboarding-welcome-back"
				>
					<OnboardingButton onClick={onBack} variant="outline">
						{t("onboarding.intro.back")}
					</OnboardingButton>
				</div>
				<OnboardingButton onClick={onAction}>{actionLabel}</OnboardingButton>
			</div>
		</div>
	)
}

export { OnboardingWelcomeFooter, type OnboardingWelcomeFooterProps }
