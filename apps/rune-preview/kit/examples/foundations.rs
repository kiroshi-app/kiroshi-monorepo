use kiroshi_rune_kit::foundations::{self, PICTURE_SIDE, SCENE};
use kiroshi_rune_kit::tokens::{self, Tokens};
use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, Waker};

const UPLOADED_AVATAR_IMAGE: &str = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' fill='#e8a33d'/><circle cx='48' cy='38' r='16' fill='#fff7e8'/><rect x='20' y='60' width='56' height='40' rx='20' fill='#fff7e8'/></svg>";
const PICTURE_SCALE: f32 = 2.0;

#[derive(Default)]
struct Sheet {
	images: Option<ImageCache>,
	picture: Option<Image>,
}

fn setup(s: &mut Sheet, waker: Waker) {
	let images = ImageCache::new(waker);
	let picture = images.svg(UPLOADED_AVATAR_IMAGE.as_bytes(), PICTURE_SIDE, PICTURE_SCALE);
	if let Err(failure) = picture.wait() {
		eprintln!("the avatar picture didn't decode: {}", failure.0);
	}
	s.picture = Some(picture);
	s.images = Some(images);
}

fn view(s: &Sheet, cx: &mut Cx<Sheet>) -> El {
	let t = Tokens { reduced_motion: cx.is_reduced_motion(), ..Tokens::new(cx.system_dark()) };
	rune_kit::root(foundations::comparison(&t, s.picture.as_ref()), Vec::new())
}

fn main() {
	let spec = AppSpec {
		setup: Some(setup),
		scenes: &[(SCENE, |_| {})],
		fonts: tokens::FONTS,
		families: tokens::FAMILIES,
		..AppSpec::new("Kiroshi foundations", (1180.0, 780.0), Sheet::default, view)
	};
	rune::App::new(spec).run();
}
