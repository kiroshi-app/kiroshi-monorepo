use std::time::Duration;

const MIN_LENGTH: f64 = 1.0;
const MAX_LENGTH: f64 = 20_000.0;

pub(crate) const REPORT_WINDOW: Duration = Duration::from_millis(100);

pub(crate) const SCRIPT: &str = r#"(() => {
	if (window.top === window || window.parent !== window.top) return;
	const channel = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc;
	if (!channel) return;
	const root = document.documentElement;
	const pinned = (element, overflow) => {
		const style = element.style;
		if (style.getPropertyValue("overflow") !== overflow || style.getPropertyPriority("overflow") !== "important") {
			style.setProperty("overflow", overflow, "important");
		}
	};
	let watchedBody = null;
	const pinning = new MutationObserver(() => pin());
	const pin = () => {
		pinned(root, "hidden");
		const body = document.body;
		if (!body) return;
		pinned(body, "visible");
		if (body === watchedBody) return;
		watchedBody = body;
		pinning.observe(body, { attributes: true, attributeFilter: ["style"] });
	};
	pin();
	pinning.observe(root, { childList: true, attributes: true, attributeFilter: ["style"] });
	addEventListener(
		"scroll",
		() => {
			if (scrollX || scrollY) scrollTo(0, 0);
		},
		{ capture: true, passive: true },
	);
	let reported = null;
	const followsTheView = (size) =>
		reported !== null &&
		size.width === reported.width &&
		size.viewport > reported.viewport &&
		Math.abs(size.height - reported.height - (size.viewport - reported.viewport)) < 1;
	const measure = () => {
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
		const size = { width, height: height * scale, viewport: innerHeight };
		if (followsTheView(size)) return;
		reported = size;
		channel.postMessage(JSON.stringify([size.width, size.height]));
	};
	addEventListener(
		"load",
		() => {
			const observer = new ResizeObserver(measure);
			observer.observe(root);
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

#[derive(Debug, Default)]
pub(crate) struct SizeReport {
	emitted: Option<PageSize>,
	held: Option<PageSize>,
	is_holding: bool,
}

impl SizeReport {
	pub(crate) fn posted(&mut self, size: PageSize) -> Option<PageSize> {
		if self.is_holding {
			self.held = Some(size);
			return None;
		}
		self.released(size)
	}

	pub(crate) fn window_ended(&mut self) -> Option<PageSize> {
		self.is_holding = false;
		self.held.take().and_then(|size| self.released(size))
	}

	fn released(&mut self, size: PageSize) -> Option<PageSize> {
		if self.emitted == Some(size) {
			return None;
		}
		self.emitted = Some(size);
		self.is_holding = true;
		Some(size)
	}
}

fn reserved_length(length: f64) -> Option<f64> {
	(length.is_finite() && length >= 0.0).then(|| length.ceil().clamp(MIN_LENGTH, MAX_LENGTH))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn size(height: f64) -> PageSize {
		PageSize { width: 480.0, height }
	}

	#[test]
	fn an_idle_report_emits_the_first_size_at_once() {
		let mut report = SizeReport::default();

		assert_eq!(report.posted(size(120.0)), Some(size(120.0)));
	}

	#[test]
	fn a_size_posted_while_holding_waits_for_the_end_of_the_window() {
		let mut report = SizeReport::default();
		report.posted(size(120.0));

		assert_eq!(report.posted(size(130.0)), None);
		assert_eq!(report.posted(size(140.0)), None);
		assert_eq!(report.window_ended(), Some(size(140.0)));
	}

	#[test]
	fn the_last_size_of_a_window_is_never_lost() {
		let mut report = SizeReport::default();
		report.posted(size(120.0));
		report.posted(size(130.0));
		report.window_ended();

		assert_eq!(report.posted(size(150.0)), None);
		assert_eq!(report.window_ended(), Some(size(150.0)));
		assert_eq!(report.window_ended(), None);
		assert_eq!(report.posted(size(160.0)), Some(size(160.0)));
	}

	#[test]
	fn a_window_that_ends_on_the_emitted_size_emits_nothing() {
		let mut report = SizeReport::default();
		report.posted(size(120.0));
		report.posted(size(130.0));
		report.posted(size(120.0));

		assert_eq!(report.window_ended(), None);
		assert_eq!(report.posted(size(120.0)), None);
	}

	#[test]
	fn ten_thousand_sizes_over_ten_windows_emit_at_most_eleven_events() {
		let mut report = SizeReport::default();
		let mut emitted = Vec::new();
		for posted in 0..10_000 {
			emitted.extend(report.posted(size(f64::from(200 + posted))));
			if posted % 1_000 == 999 {
				emitted.extend(report.window_ended());
			}
		}
		emitted.extend(report.window_ended());

		assert!(emitted.len() <= 11, "{} events", emitted.len());
		assert_eq!(emitted.last(), Some(&size(10_199.0)));
	}

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
