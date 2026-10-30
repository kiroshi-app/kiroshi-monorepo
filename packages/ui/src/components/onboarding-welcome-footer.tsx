"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { OnboardingButton } from "@workspace/ui/components/onboarding-shell"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const CHEVRON_STROKE = 1.6

const ARROW_CLASS =
	"size-8 rounded-full bg-clip-border transition-none data-disabled:pointer-events-none data-disabled:text-muted-foreground data-disabled:opacity-35"

const ACTION_CLASS = "h-10 px-6"

type OnboardingWelcomeFooterProps = {
	step: number
	total: number
	onSkip: () => void
	onBack: () => void
	onNext: () => void
}

const OnboardingWelcomeFooter = ({
	step,
	total,
	onSkip,
	onBack,
	onNext,
}: OnboardingWelcomeFooterProps) => {
	const { t } = useTranslation("chat")
	const isFirstStep = step === 1
	const isLastStep = step === total

	return (
		<div
			className="flex flex-col items-center [--color-primary:var(--hue-blue-accent)] [--primary:var(--hue-blue-accent)]"
			data-slot="onboarding-welcome-footer"
		>
			<div
				className="flex items-center gap-4 pt-3 pb-6"
				data-slot="onboarding-welcome-stepper"
			>
				<Button
					aria-label={t("onboarding.intro.back")}
					className={cn(
						ARROW_CLASS,
						"bg-transparent text-foreground data-disabled:border-transparent dark:bg-transparent",
					)}
					disabled={isFirstStep}
					focusableWhenDisabled
					onClick={onBack}
					size="icon"
					variant="outline"
				>
					<Icons.Previous aria-hidden="true" strokeWidth={CHEVRON_STROKE} />
				</Button>
				<div
					aria-label={t("onboarding.intro.progress")}
					aria-valuemax={total}
					aria-valuemin={1}
					aria-valuenow={step}
					aria-valuetext={t("onboarding.intro.position", { step, total })}
					className="flex items-center gap-1.5"
					role="progressbar"
				>
					{Array.from({ length: total }, (_, index) => index + 1).map(
						(segment) => (
							<span
								className={cn(
									"h-1 w-11 rounded-full",
									segment <= step ? "bg-primary" : "bg-border",
								)}
								data-filled={segment <= step}
								data-slot="onboarding-step-segment"
								key={segment}
							/>
						),
					)}
				</div>
				<Button
					aria-label={t("onboarding.intro.next")}
					className={cn(ARROW_CLASS, "data-disabled:bg-muted")}
					disabled={isLastStep}
					focusableWhenDisabled
					onClick={onNext}
					size="icon"
				>
					<Icons.Next aria-hidden="true" strokeWidth={CHEVRON_STROKE} />
				</Button>
			</div>
			{isLastStep ? (
				<OnboardingButton className={ACTION_CLASS} onClick={onNext}>
					{t("onboarding.intro.getStarted")}
				</OnboardingButton>
			) : (
				<OnboardingButton
					className={cn(
						ACTION_CLASS,
						"text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent",
					)}
					onClick={onSkip}
					variant="ghost"
				>
					{t("onboarding.intro.skip")}
				</OnboardingButton>
			)}
		</div>
	)
}

export { OnboardingWelcomeFooter, type OnboardingWelcomeFooterProps }
