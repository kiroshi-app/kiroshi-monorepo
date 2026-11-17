pub(crate) const MIN_LENGTH: f64 = 1.0;
pub(crate) const MAX_LENGTH: f64 = 20_000.0;

pub(crate) const SCRIPT: &str = r#"(() => {
	if (window.top === window || window.parent !== window.top) return;
	const channel = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc;
	if (!channel) return;
	const report = (width, height) => channel.postMessage(JSON.stringify([width, height]));
	const measure = () => {
		const root = document.documentElement;
		const scroller = document.scrollingElement || root;
		root.style.removeProperty("transform");
		root.style.removeProperty("height");
		const width = scroller.clientWidth;
		const height =
			scroller.scrollHeight > scroller.clientHeight ? scroller.scrollHeight : root.getBoundingClientRect().height;
		const scale = scroller.scrollWidth > width ? width / scroller.scrollWidth : 1;
		if (scale < 1) {
			root.style.setProperty("transform-origin", "0 0", "important");
			root.style.setProperty("transform", `scale(${scale})`, "important");
			root.style.setProperty("height", `${height * scale}px`, "important");
		}
		report(width, height * scale);
	};
	addEventListener(
		"load",
		() => {
			document.documentElement.style.setProperty("overflow", "hidden", "important");
			const observer = new ResizeObserver(measure);
			observer.observe(document.documentElement);
			if (document.body) observer.observe(document.body);
		},
		{ once: true },
	);
})();"#;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct PageSize {
	pub width: f64,
	pub height: f64,
}

pub(crate) fn page_size(message: &str) -> Option<PageSize> {
	let [width, height]: [f64; 2] = serde_json::from_str(message).ok()?;
	Some(PageSize { width: reserved_length(width)?, height: reserved_length(height)? })
}

fn reserved_length(length: f64) -> Option<f64> {
	(length.is_finite() && length >= 0.0).then(|| length.ceil().clamp(MIN_LENGTH, MAX_LENGTH))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_page_size_is_rounded_up_to_whole_css_pixels() {
		assert_eq!(page_size("[480, 120.2]"), Some(PageSize { width: 480.0, height: 121.0 }));
	}

	#[test]
	fn an_absurd_size_is_clamped_to_the_maximum() {
		assert_eq!(
			page_size("[1e12, 99999999]"),
			Some(PageSize { width: MAX_LENGTH, height: MAX_LENGTH })
		);
	}

	#[test]
	fn an_empty_size_is_clamped_to_one_pixel() {
		assert_eq!(page_size("[0, 0.0]"), Some(PageSize { width: MIN_LENGTH, height: MIN_LENGTH }));
		assert_eq!(
			page_size("[0, -0.0]"),
			Some(PageSize { width: MIN_LENGTH, height: MIN_LENGTH })
		);
	}

	#[test]
	fn a_negative_size_is_dropped() {
		assert_eq!(page_size("[480, -1]"), None);
		assert_eq!(page_size("[-0.5, 300]"), None);
	}

	#[test]
	fn a_non_finite_size_is_dropped() {
		assert_eq!(reserved_length(f64::NAN), None);
		assert_eq!(reserved_length(f64::INFINITY), None);
		assert_eq!(reserved_length(f64::NEG_INFINITY), None);
		assert_eq!(page_size("[480, 1e400]"), None);
		assert_eq!(page_size("[480, NaN]"), None);
		assert_eq!(page_size("[480, Infinity]"), None);
	}

	#[test]
	fn anything_but_two_numbers_is_dropped() {
		for message in [
			"",
			"480",
			"[480]",
			"[480, 120, 3]",
			r#"["480", "120"]"#,
			r#"{"width": 480, "height": 120}"#,
			r#"[480, "http://example.com"]"#,
			r#"{"cmd":"spike_secret","callback":1,"error":2,"payload":{}}"#,
			"[480, null]",
		] {
			assert_eq!(page_size(message), None, "{message}");
		}
	}
}
