import type { ReactNode } from "react"

export const DownloadMark = () => (
	<svg
		aria-hidden="true"
		className="size-[15px] shrink-0"
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={1.5}
		viewBox="0 0 16 16"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M8 2v8m0 0 3.2-3.2M8 10 4.8 6.8M2.6 12.4h10.8" />
	</svg>
)

export const MailMark = () => (
	<svg
		aria-hidden="true"
		className="size-5 shrink-0"
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={1.8}
		viewBox="0 0 20 20"
		xmlns="http://www.w3.org/2000/svg"
	>
		<rect height={14} rx={2} width={18} x={1} y={3} />
		<path d="m1.5 5.5 8.5 6 8.5-6" />
	</svg>
)

export const GoogleMark = () => (
	<svg
		aria-hidden="true"
		className="size-4 shrink-0"
		viewBox="0 0 18 18"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
			fill="#4285F4"
		/>
		<path
			d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
			fill="#34A853"
		/>
		<path
			d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
			fill="#FBBC05"
		/>
		<path
			d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
			fill="#EA4335"
		/>
	</svg>
)

export const AppleMark = () => (
	<svg
		aria-hidden="true"
		className="size-4 shrink-0"
		fill="currentColor"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09ZM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
	</svg>
)

type StrokeMarkProps = {
	className: string
	strokeWidth: number
	children: ReactNode
}

const StrokeMark = ({ className, strokeWidth, children }: StrokeMarkProps) => (
	<svg
		aria-hidden="true"
		className={`${className} shrink-0`}
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={strokeWidth}
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		{children}
	</svg>
)

export const DeviceMark = () => (
	<StrokeMark className="size-5" strokeWidth={1.8}>
		<rect height={12} rx={1.5} width={18} x={3} y={4} />
		<path d="M9 20h6M12 16v4" />
	</StrokeMark>
)

export const DesktopMark = () => (
	<StrokeMark className="size-[18px]" strokeWidth={1.8}>
		<rect height={12} rx={1.5} width={18} x={3} y={4} />
		<path d="M9 20h6M12 16v4" />
	</StrokeMark>
)

export const LaptopMark = () => (
	<StrokeMark className="size-[18px]" strokeWidth={1.8}>
		<rect height={11} rx={1.5} width={16} x={4} y={5} />
		<path d="M2 19h20" />
	</StrokeMark>
)

export const PhoneMark = () => (
	<StrokeMark className="size-[18px]" strokeWidth={1.8}>
		<rect height={18} rx={2.5} width={11} x={6.5} y={3} />
		<path d="M11 18h2" />
	</StrokeMark>
)

export const BenefitMark = () => (
	<StrokeMark className="size-4" strokeWidth={2}>
		<path d="M5 12l5 5 9-10" />
	</StrokeMark>
)

export const SignedInMark = () => (
	<StrokeMark className="size-5" strokeWidth={2.2}>
		<path d="M5 12l5 5 9-10" />
	</StrokeMark>
)

export const ExpiredMark = () => (
	<StrokeMark className="size-5" strokeWidth={2}>
		<circle cx={12} cy={12} r={9} />
		<path d="M12 7.5v5.5M12 16.5v.01" />
	</StrokeMark>
)

export const CancelledMark = () => (
	<StrokeMark className="size-5" strokeWidth={2}>
		<circle cx={12} cy={12} r={9} />
		<path d="m9 9 6 6M15 9l-6 6" />
	</StrokeMark>
)
