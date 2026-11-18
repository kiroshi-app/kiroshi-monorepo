const RADII = [
	{
		token: "--radius-xs",
		className: "rounded-xs",
		computed: "calc(var(--radius-root) * 0.2)",
	},
	{
		token: "--radius-sm",
		className: "rounded-sm",
		computed: "calc(var(--radius-root) * 0.6)",
	},
	{
		token: "--radius-md",
		className: "rounded-md",
		computed: "calc(var(--radius-root) * 0.8)",
	},
	{
		token: "--radius-lg",
		className: "rounded-lg",
		computed: "var(--radius-root)",
	},
	{
		token: "--radius-xl",
		className: "rounded-xl",
		computed: "var(--radius-lg)",
	},
	{
		token: "--radius-2xl",
		className: "rounded-2xl",
		computed: "var(--radius-lg)",
	},
	{
		token: "--radius-3xl",
		className: "rounded-3xl",
		computed: "calc(var(--radius-root) * 2.2)",
	},
	{
		token: "--radius-4xl",
		className: "rounded-4xl",
		computed: "calc(var(--radius-root) * 2.6)",
	},
	{
		token: "--radius-bubble",
		className: "rounded-bubble",
		computed: "calc(var(--radius-root) * 1.8)",
	},
	{
		token: "--radius-control",
		className: "rounded-control",
		computed: "calc(var(--radius-root) * 1.2)",
	},
	{
		token: "--radius-button",
		className: "rounded-button",
		computed: "var(--radius-lg)",
	},
]

const SHADOWS = [
	{ className: "shadow-2xs" },
	{ className: "shadow-xs" },
	{ className: "shadow-sm" },
	{ className: "shadow-md" },
	{ className: "shadow-lg" },
	{ className: "shadow-xl" },
	{ className: "shadow-2xl" },
]

export const RadiusScale = () => (
	<div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
		{RADII.map(({ token, className, computed }) => (
			<div key={token} className="flex flex-col gap-2">
				<span
					aria-hidden="true"
					className={`${className} h-16 border border-border bg-secondary`}
				/>
				<code className="font-mono text-foreground text-xs">{token}</code>
				<code className="font-mono text-muted-foreground text-xs">
					{computed}
				</code>
			</div>
		))}
	</div>
)

export const ShadowScale = () => (
	<div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6 p-2">
		{SHADOWS.map(({ className }) => (
			<div key={className} className="flex flex-col gap-2">
				<span
					aria-hidden="true"
					className={`${className} h-16 rounded-lg border border-border bg-card`}
				/>
				<code className="font-mono text-foreground text-xs">{className}</code>
			</div>
		))}
	</div>
)
