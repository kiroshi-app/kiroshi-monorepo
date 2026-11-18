use super::contract::{LiveHtmlAppearance, LiveHtmlTheme};
use crate::conversations::contract::Hue;

const LAYER: &str = "kiroshi-base";

const RULES: &str = r#":root {
	--kiroshi-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	--kiroshi-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	--kiroshi-text-xs: 0.75rem;
	--kiroshi-text-sm: 0.8125rem;
	--kiroshi-text-base: 0.9375rem;
	--kiroshi-text-lg: 1.125rem;
	--kiroshi-text-xl: 1.375rem;
	--kiroshi-text-2xl: 1.75rem;
	--kiroshi-space-1: 0.25rem;
	--kiroshi-space-2: 0.5rem;
	--kiroshi-space-3: 0.75rem;
	--kiroshi-space-4: 1rem;
	--kiroshi-space-6: 1.5rem;
	--kiroshi-space-8: 2rem;
	color: var(--kiroshi-foreground);
	font-family: var(--kiroshi-font);
	line-height: 1.5;
	-webkit-text-size-adjust: 100%;
}
*, ::before, ::after { box-sizing: border-box; }
body { margin: 0; background: var(--kiroshi-background); font-size: var(--kiroshi-text-base); }"#;

#[cfg(target_os = "macos")]
pub(crate) const RETHEMED_SCRIPT: &str = r#"(() => {
	if (window.top === window || window.parent !== window.top) return;
	addEventListener("message", (event) => {
		const rules = event.source === window.parent && event.data && event.data.kiroshiTheme;
		const sheet = document.getElementById("kiroshi-theme");
		if (typeof rules === "string" && sheet) sheet.textContent = rules;
	});
})();"#;

struct Tones {
	appearance: &'static str,
	background: &'static str,
	foreground: &'static str,
	muted_foreground: &'static str,
	border: &'static str,
	hued_accent: &'static str,
	hued_accent_foreground: &'static str,
}

const LIGHT: Tones = Tones {
	appearance: "light",
	background: "#f5f5f5",
	foreground: "#0a0a0a",
	muted_foreground: "#6b6b6b",
	border: "#e5e5e5",
	hued_accent: "0.5 0.13",
	hued_accent_foreground: "#ffffff",
};

const DARK: Tones = Tones {
	appearance: "dark",
	background: "#000000",
	foreground: "#f5f5f5",
	muted_foreground: "#a3a3a3",
	border: "#212224",
	hued_accent: "0.78 0.12",
	hued_accent_foreground: "#121213",
};

pub(crate) fn laid_under(page: &str, theme: Option<LiveHtmlTheme>) -> String {
	format!(
		r#"<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>@layer {LAYER} {{ {RULES} }}</style><style id="kiroshi-theme">{}</style>{page}"#,
		theme_rules(theme)
	)
}

pub(crate) fn retheming(theme: LiveHtmlTheme) -> String {
	let rules = serde_json::Value::String(theme_rules(Some(theme)));
	format!(
		r#"document.querySelector("iframe")?.contentWindow.postMessage({{ kiroshiTheme: {rules} }}, "*")"#
	)
}

fn theme_rules(theme: Option<LiveHtmlTheme>) -> String {
	let rules = match theme {
		Some(LiveHtmlTheme { appearance, hue }) => {
			format!(":root {{ {} }}", declarations(appearance, hue))
		}
		None => format!(
			":root {{ {} }} @media (prefers-color-scheme: dark) {{ :root {{ {} }} }}",
			declarations(LiveHtmlAppearance::Light, None),
			declarations(LiveHtmlAppearance::Dark, None)
		),
	};
	format!("@layer {LAYER} {{ {rules} }}")
}

fn declarations(appearance: LiveHtmlAppearance, hue: Option<Hue>) -> String {
	let tones = match appearance {
		LiveHtmlAppearance::Light => LIGHT,
		LiveHtmlAppearance::Dark => DARK,
	};
	let (accent, accent_foreground) = match hue {
		Some(hue) => {
			(format!("oklch({} {})", tones.hued_accent, hue.value()), tones.hued_accent_foreground)
		}
		None => (tones.foreground.to_owned(), tones.background),
	};
	let Tones { appearance, background, foreground, muted_foreground, border, .. } = tones;
	format!(
		"color-scheme: {appearance}; --kiroshi-appearance: {appearance}; --kiroshi-background: {background}; --kiroshi-foreground: {foreground}; --kiroshi-muted-foreground: {muted_foreground}; --kiroshi-border: {border}; --kiroshi-accent: {accent}; --kiroshi-accent-foreground: {accent_foreground};"
	)
}

#[cfg(test)]
mod tests {
	use super::*;

	const PAGE: &str = "<!doctype html><style>body { background: #ff00ff }</style><p>live</p>";

	fn themed(appearance: LiveHtmlAppearance, hue: Option<i64>) -> LiveHtmlTheme {
		LiveHtmlTheme { appearance, hue: hue.map(|hue| Hue::new(hue).expect("a hue of the turn")) }
	}

	#[test]
	fn the_base_holds_a_viewport_a_reset_the_system_font_and_both_scales() {
		let document = laid_under(PAGE, None);

		for held in [
			r#"<meta name="viewport" content="width=device-width, initial-scale=1">"#,
			"box-sizing: border-box",
			"body { margin: 0; background: var(--kiroshi-background);",
			"color: var(--kiroshi-foreground)",
			"--kiroshi-font: system-ui,",
			"font-family: var(--kiroshi-font)",
			"--kiroshi-text-base:",
			"--kiroshi-space-4:",
		] {
			assert!(document.contains(held), "the base holds no {held}");
		}
	}

	#[test]
	fn every_rule_of_the_base_sits_in_one_layer_declared_before_the_page() {
		let document = laid_under(PAGE, None);
		let (base, page) = document.split_at(document.len() - PAGE.len());

		assert_eq!(page, PAGE);
		let sheets: Vec<&str> = base.split("<style").skip(1).collect();
		assert_eq!(sheets.len(), 2);
		for sheet in sheets {
			let rules = sheet.split_once('>').expect("a style tag").1;
			assert!(rules.starts_with("@layer kiroshi-base {"), "{rules}");
			assert!(rules.ends_with("}</style>"), "{rules}");
		}
	}

	#[test]
	fn the_base_never_outranks_the_page_with_an_important_declaration() {
		let themes = [
			None,
			Some(themed(LiveHtmlAppearance::Light, Some(257))),
			Some(themed(LiveHtmlAppearance::Dark, None)),
		];

		for theme in themes {
			assert!(!laid_under("", theme).contains("!important"));
		}
	}

	#[test]
	fn a_light_theme_carries_the_light_colours_and_the_space_hue_as_its_accent() {
		let rules = theme_rules(Some(themed(LiveHtmlAppearance::Light, Some(257))));

		assert_eq!(
			rules,
			"@layer kiroshi-base { :root { color-scheme: light; --kiroshi-appearance: light; --kiroshi-background: #f5f5f5; --kiroshi-foreground: #0a0a0a; --kiroshi-muted-foreground: #6b6b6b; --kiroshi-border: #e5e5e5; --kiroshi-accent: oklch(0.5 0.13 257); --kiroshi-accent-foreground: #ffffff; } }"
		);
	}

	#[test]
	fn a_dark_theme_carries_the_dark_colours_and_the_space_hue_as_its_accent() {
		let rules = theme_rules(Some(themed(LiveHtmlAppearance::Dark, Some(42))));

		assert_eq!(
			rules,
			"@layer kiroshi-base { :root { color-scheme: dark; --kiroshi-appearance: dark; --kiroshi-background: #000000; --kiroshi-foreground: #f5f5f5; --kiroshi-muted-foreground: #a3a3a3; --kiroshi-border: #212224; --kiroshi-accent: oklch(0.78 0.12 42); --kiroshi-accent-foreground: #121213; } }"
		);
	}

	#[test]
	fn a_theme_without_a_hue_takes_the_text_colour_as_a_neutral_accent() {
		let rules = theme_rules(Some(themed(LiveHtmlAppearance::Dark, None)));

		assert!(rules.contains("--kiroshi-accent: #f5f5f5; --kiroshi-accent-foreground: #000000;"));
	}

	#[test]
	fn no_theme_follows_the_system_appearance_with_a_neutral_accent() {
		let rules = theme_rules(None);
		let (light, dark) =
			rules.split_once("@media (prefers-color-scheme: dark)").expect("a dark media query");

		assert!(light.starts_with("@layer kiroshi-base { :root { color-scheme: light;"), "{light}");
		assert!(light.contains("--kiroshi-appearance: light; --kiroshi-background: #f5f5f5;"));
		assert!(light.contains("--kiroshi-accent: #0a0a0a; --kiroshi-accent-foreground: #f5f5f5;"));
		assert!(dark.contains("color-scheme: dark; --kiroshi-appearance: dark;"), "{dark}");
		assert!(dark.contains("--kiroshi-accent: #f5f5f5; --kiroshi-accent-foreground: #000000;"));
		assert!(!rules.contains("oklch"));
	}

	#[test]
	fn a_retheming_posts_the_theme_rules_to_the_content_frame_as_one_string() {
		let theme = themed(LiveHtmlAppearance::Dark, Some(42));
		let script = retheming(theme);

		let posted = serde_json::Value::String(theme_rules(Some(theme))).to_string();
		assert_eq!(
			script,
			format!(
				r#"document.querySelector("iframe")?.contentWindow.postMessage({{ kiroshiTheme: {posted} }}, "*")"#
			)
		);
	}
}
