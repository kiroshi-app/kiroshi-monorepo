use rune::{Color, Cursor, El, Icon, TextEdit, TextStyle, col, el, icon, row, text};

use super::mark::{Mark, MarkSize, mark};
use super::search::{SEARCH_TEXT, search_field};
use super::{HAIRLINE, fill, inset, kit_ring, outlined, say, skeleton_bar, skeleton_list};
use crate::icons;
use crate::primitives::Paint;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::strings::{Key, Language, bots};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_MD, RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, Tokens,
};

pub const RAIL_WIDTH: f32 = SPACING * 52.0;
pub const PAGE_INSET: f32 = SPACING * 5.0;
pub const LINE_18: f32 = SPACING * 4.5;
pub const TEXT_SM_18: TextStyle = TextStyle { line_height: LINE_18, ..TEXT_SM };
pub const TEXT_SM_MEDIUM_18: TextStyle = TextStyle { line_height: LINE_18, ..TEXT_SM_MEDIUM };
const CARD_COLUMNS: usize = 3;
const CARD_GAP: f32 = SPACING * 3.0;
const DESCRIPTION_HEIGHT: f32 = SPACING * 8.0;
const SETUP_GLYPH: f32 = SPACING * 3.25;
const SKELETON_BARS: [(f32, f32); 3] = [
	(SPACING * 16.5, SPACING * 19.5),
	(SPACING * 12.0, SPACING * 27.5),
	(SPACING * 18.5, SPACING * 21.5),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Category {
	Everything,
	OnThisMachine,
	CommerceShopping,
	Communication,
	ConsumerHealth,
	Creative,
	DataAnalytics,
	DeveloperTools,
	Education,
	FinancialServices,
	HealthLifeSciences,
	Legal,
	MediaEntertainment,
	Nonprofit,
	Productivity,
	SalesMarketing,
	Travel,
	Other,
}

impl Category {
	pub const ALL: [Category; 18] = [
		Category::Everything,
		Category::OnThisMachine,
		Category::CommerceShopping,
		Category::Communication,
		Category::ConsumerHealth,
		Category::Creative,
		Category::DataAnalytics,
		Category::DeveloperTools,
		Category::Education,
		Category::FinancialServices,
		Category::HealthLifeSciences,
		Category::Legal,
		Category::MediaEntertainment,
		Category::Nonprofit,
		Category::Productivity,
		Category::SalesMarketing,
		Category::Travel,
		Category::Other,
	];

	fn name(self) -> Key {
		use bots::applications::catalogue::category;
		match self {
			Category::Everything => category::EVERYTHING,
			Category::OnThisMachine => category::ON_THIS_MACHINE,
			Category::CommerceShopping => category::COMMERCE_SHOPPING,
			Category::Communication => category::COMMUNICATION,
			Category::ConsumerHealth => category::CONSUMER_HEALTH,
			Category::Creative => category::CREATIVE,
			Category::DataAnalytics => category::DATA_ANALYTICS,
			Category::DeveloperTools => category::DEVELOPER_TOOLS,
			Category::Education => category::EDUCATION,
			Category::FinancialServices => category::FINANCIAL_SERVICES,
			Category::HealthLifeSciences => category::HEALTH_LIFE_SCIENCES,
			Category::Legal => category::LEGAL,
			Category::MediaEntertainment => category::MEDIA_ENTERTAINMENT,
			Category::Nonprofit => category::NONPROFIT,
			Category::Productivity => category::PRODUCTIVITY,
			Category::SalesMarketing => category::SALES_MARKETING,
			Category::Travel => category::TRAVEL,
			Category::Other => category::OTHER,
		}
	}

	fn is_headless(self) -> bool {
		matches!(self, Category::Everything | Category::OnThisMachine)
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Setup {
	SignIn,
	ApiKey,
	Nothing,
	Unavailable,
}

impl Setup {
	fn reading(self, t: &Tokens) -> (&'static Icon, Color, Key) {
		use bots::applications::catalogue::setup;
		match self {
			Setup::SignIn => (&icons::EXTERNAL_LINK, t.muted_foreground, setup::SIGN_IN),
			Setup::ApiKey => (&icons::KEY_ROUND, t.muted_foreground, setup::API_KEY),
			Setup::Nothing => (&icons::CHECK, t.state_connected, setup::NONE),
			Setup::Unavailable => (&icons::BAN, t.destructive, setup::UNAVAILABLE),
		}
	}
}

pub struct CatalogueApplication<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub description: Option<&'a str>,
	pub setup: Setup,
	pub mark: Mark<'a>,
}

pub struct Catalogue<'a> {
	pub category: Category,
	pub query: &'a TextEdit,
	pub applications: &'a [CatalogueApplication<'a>],
	pub is_loading: bool,
	pub has_failed: bool,
	pub has_partly_failed: bool,
	pub is_stale: bool,
	pub language: Language,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CatalogueEvent {
	Back,
	Category(Category),
	Pick(String),
	Retry,
}

pub fn catalogue_page<S: 'static>(
	t: &Tokens,
	category: Category,
	language: Language,
	emit: impl Fn(&mut S, CatalogueEvent) + Clone + 'static,
	body: El,
) -> El {
	let back_emit = emit.clone();
	let back = rail_item(t, &icons::CHEVRON_LEFT, say(bots::applications::BACK, language), true)
		.key("catalogue-back")
		.role("button")
		.on_press(move |s: &mut S| back_emit(s, CatalogueEvent::Back));
	let entries = col()
		.grow(1.0)
		.min_h(0.0)
		.w_full()
		.gap(SPACING)
		.role("tablist")
		.focus_group()
		.children(Category::ALL.into_iter().map(|entry| {
			let is_active = entry == category;
			let emit = emit.clone();
			category_entry(t, say(entry.name(), language), is_active)
				.key(format!("catalogue-category-{entry:?}"))
				.focus_selected(is_active)
				.on_press(move |s: &mut S| emit(s, CatalogueEvent::Category(entry)))
		}))
		.scroll(rune::ScrollSpec { stick_bottom: false });
	let rail = col()
		.w(RAIL_WIDTH)
		.h_full()
		.gap(SPACING)
		.padding(SPACING * 2.0)
		.child(back)
		.child(el().h(HAIRLINE).mx(SPACING).my(SPACING).self_stretch().fill(t.border))
		.child(entries);
	row()
		.w_full()
		.h_full()
		.child(rail)
		.child(el().w(HAIRLINE).self_stretch().fill(t.border))
		.child(col().grow(1.0).min_w(0.0).h_full().child(body))
}

fn rail_paint(t: &Tokens, is_active: bool) -> Paint {
	let clear = t.muted.alpha(0.0);
	if is_active {
		Paint::plain(t.muted, t.foreground)
	} else {
		Paint { fill: clear, ink: t.muted_foreground, hover_fill: t.muted, hover_ink: t.foreground }
	}
}

fn rail_item(t: &Tokens, glyph: &'static Icon, label: &str, is_strong: bool) -> El {
	let paint = rail_paint(t, false);
	let ink = if is_strong { Paint { ink: t.foreground, ..paint } } else { paint };
	let item = row()
		.w_full()
		.gap(SPACING * 2.5)
		.center_y()
		.px(SPACING * 2.5)
		.py(SPACING * 2.0)
		.radius(RADIUS_CONTROL)
		.label(label)
		.child(ink.ink(icon(glyph, SPACING * 4.0)))
		.child(ink.ink(text(label.to_owned()).font(if is_strong {
			TEXT_SM_MEDIUM_18
		} else {
			TEXT_SM_18
		})));
	focusable(t, ink.apply(item))
}

fn category_entry(t: &Tokens, label: &str, is_active: bool) -> El {
	let paint = rail_paint(t, is_active);
	let style = if is_active { TEXT_SM_MEDIUM_18 } else { TEXT_SM_18 };
	let item = row()
		.w_full()
		.center_y()
		.px(SPACING * 2.5)
		.py(SPACING * 2.0)
		.radius(RADIUS_CONTROL)
		.role("tab")
		.label(label)
		.child(paint.ink(text(label.to_owned()).font(style).wrap_anywhere().shrink()));
	focusable(t, paint.apply(item))
}

fn focusable(t: &Tokens, control: El) -> El {
	kit_ring(t, control.focusable(true).cursor(Cursor::Pointer))
}

pub fn catalogue<S: 'static>(
	t: &Tokens,
	page: &Catalogue,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
	emit: fn(&mut S, CatalogueEvent),
) -> El {
	let language = page.language;
	let mut section = col().w_full().gap(SPACING * 2.0);
	if !page.category.is_headless() {
		section = section.child(section_head(t, page.category, language));
	}
	let retry = || {
		Button::new(say(bots::applications::catalogue::RETRY, language))
			.variant(ButtonVariant::Outline)
			.size(ButtonSize::Xs)
			.view(t)
			.on_press(move |s: &mut S| emit(s, CatalogueEvent::Retry))
	};
	let section = if page.is_loading {
		section.grow(1.0).min_h(0.0).child(skeleton_list(t, SPACING * 2.0, |index| {
			application_skeleton(t, SKELETON_BARS[index % 3])
		}))
	} else if page.has_failed {
		section.child(line(
			t,
			&icons::TRIANGLE_ALERT,
			say(bots::applications::catalogue::FAILED, language).to_owned(),
			Some(retry()),
		))
	} else {
		let mut section = section;
		if page.has_partly_failed {
			section = section.child(line(
				t,
				&icons::TRIANGLE_ALERT,
				say(bots::applications::catalogue::PARTLY_FAILED, language).to_owned(),
				Some(retry()),
			));
		}
		if page.is_stale {
			section = section.child(line(
				t,
				&icons::INFO,
				say(bots::applications::catalogue::STALE, language).to_owned(),
				None,
			));
		}
		section.child(results(t, page, emit))
	};
	let body = col()
		.w_full()
		.h_full()
		.gap(SPACING * 3.5)
		.padding(PAGE_INSET)
		.child(row().w_full().center_y().child(search_field(
			t,
			page.query,
			SEARCH_TEXT,
			language,
			access,
		)))
		.child(section);
	let body =
		if page.is_loading { body } else { body.scroll(rune::ScrollSpec { stick_bottom: false }) };
	catalogue_page(t, page.category, language, emit, body)
}

fn section_head(t: &Tokens, category: Category, language: Language) -> El {
	row()
		.w_full()
		.flex_wrap()
		.gaps(0.0, SPACING * 2.0)
		.items_end()
		.child(
			text(say(category.name(), language).to_owned())
				.font(TEXT_SM_MEDIUM_18)
				.color(t.foreground),
		)
		.child(
			text(say(bots::applications::catalogue::DIRECTORY, language).to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground),
		)
}

fn results<S: 'static>(t: &Tokens, page: &Catalogue, emit: fn(&mut S, CatalogueEvent)) -> El {
	let language = page.language;
	if page.applications.is_empty() {
		let typed = page.query.text.trim();
		let copy = if typed.is_empty() {
			say(bots::applications::catalogue::EMPTY, language).to_owned()
		} else {
			fill(bots::applications::catalogue::NOTHING, language, &[("query", typed)])
		};
		return line(t, &icons::SEARCH, copy, None);
	}
	col()
		.w_full()
		.equal_columns(CARD_COLUMNS)
		.gap(CARD_GAP)
		.role("list")
		.children(page.applications.iter().map(|application| card(t, application, language, emit)))
}

fn card<S: 'static>(
	t: &Tokens,
	application: &CatalogueApplication,
	language: Language,
	emit: fn(&mut S, CatalogueEvent),
) -> El {
	let (glyph, tone, setup) = application.setup.reading(t);
	let mut shell = col()
		.w_full()
		.h_full()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.key(format!("catalogue-card-{}", application.id))
		.role("button")
		.label(application.name)
		.child(
			row()
				.min_w(0.0)
				.gap(SPACING * 2.0)
				.center_y()
				.child(mark(t, application.mark, MarkSize::Sm))
				.child(
					text(application.name.to_owned())
						.font(TEXT_SM_MEDIUM_18)
						.color(t.foreground)
						.truncate()
						.shrink(),
				),
		);
	if let Some(description) = application.description {
		shell = shell.child(
			text(description.to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.wrap_anywhere()
				.max_lines(2)
				.h(DESCRIPTION_HEIGHT),
		);
	}
	shell = shell.child(
		row()
			.min_w(0.0)
			.gap(SPACING * 1.25)
			.center_y()
			.child(icon(glyph, SETUP_GLYPH).color(tone))
			.child(
				text(say(setup, language).to_owned())
					.font(TEXT_XS)
					.color(t.muted_foreground)
					.truncate(),
			),
	);
	let shell = outlined(t, shell.padding(SPACING * 3.0 + HAIRLINE), RADIUS_CONTROL);
	let picked = application.id.to_owned();
	let paint = Paint {
		fill: t.muted.alpha(0.0),
		ink: t.foreground,
		hover_fill: t.muted,
		hover_ink: t.foreground,
	};
	focusable(t, paint.apply(shell))
		.on_press(move |s: &mut S| emit(s, CatalogueEvent::Pick(picked.clone())))
}

fn line(t: &Tokens, glyph: &'static Icon, copy: String, action: Option<El>) -> El {
	let mut line = row()
		.w_full()
		.gap(SPACING * 2.5)
		.center_y()
		.role("status")
		.child(icon(glyph, SPACING * 4.0).color(t.muted_foreground))
		.child(
			text(copy).font(TEXT_SM).color(t.muted_foreground).wrap_anywhere().grow(1.0).min_w(0.0),
		);
	if let Some(action) = action {
		line = line.child(action);
	}
	outlined(t, inset(line, SPACING * 2.0, SPACING * 3.0, SPACING * 3.0), RADIUS_XL)
}

fn application_skeleton(t: &Tokens, (title, sub): (f32, f32)) -> El {
	let row_shell = row()
		.w_full()
		.gap(SPACING * 3.0)
		.center_y()
		.child(el().size(SPACING * 9.0, SPACING * 9.0).radius(RADIUS_MD).fill(t.border))
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(row().h(SPACING * 5.0).center_y().child(skeleton_bar(
					t,
					title,
					SPACING * 3.0,
					false,
				)))
				.child(
					row()
						.h(SPACING * 4.0)
						.gap(SPACING * 1.5)
						.center_y()
						.child(skeleton_bar(t, SPACING * 2.0, SPACING * 2.0, true))
						.child(skeleton_bar(t, sub, SPACING * 2.25, true)),
				),
		);
	outlined(t, inset(row_shell, SPACING * 2.5, SPACING * 3.0, SPACING * 3.0), RADIUS_XL)
}
