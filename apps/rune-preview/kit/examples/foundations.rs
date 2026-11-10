use kiroshi_rune_kit::foundations::{
	self, PICTURE_SCALE, PICTURE_SIDE, SCENE, UPLOADED_AVATAR_IMAGE,
};
use kiroshi_rune_kit::tokens::{self, Tokens};
use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, Waker};

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
