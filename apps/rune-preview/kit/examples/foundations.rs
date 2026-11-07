use kiroshi_rune_kit::foundations::{self, SCENE};
use kiroshi_rune_kit::tokens::{self, Tokens};
use rune::{AppSpec, Cx, El};

#[derive(Default)]
struct Sheet;

fn view(_: &Sheet, cx: &mut Cx<Sheet>) -> El {
	let t = Tokens { reduced_motion: cx.is_reduced_motion(), ..Tokens::new(cx.system_dark()) };
	rune_kit::root(foundations::comparison(&t), Vec::new())
}

fn main() {
	let spec = AppSpec {
		scenes: &[(SCENE, |_| {})],
		fonts: tokens::FONTS,
		families: tokens::FAMILIES,
		..AppSpec::new("Kiroshi foundations", (1180.0, 780.0), Sheet::default, view)
	};
	rune::App::new(spec).run();
}
