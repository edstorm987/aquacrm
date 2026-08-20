// Shared key for the Dev Mode cinematic load-in. The switcher / account toggle
// set this in sessionStorage right before the hard navigation; DevModeLoadIn
// reads it on arrival and plays the load-in once. sessionStorage survives the
// same-tab reload, which a signed-cookie swap forces.
export const DEV_MODE_LOADIN_KEY = "aqua-devmode-loadin";

// Two different journeys play through the same overlay, and they are NOT the
// same event:
//
//   • a persona value ("owner" / "staff" / …) — an IDENTITY CHANGE. You arrive
//     as someone else, on demo data.
//   • DEV_MODE_LOADIN_WORKSPACE — plain navigation into the Dev Console
//     workspace. You arrive as YOURSELF, on your real data.
//
// They must not share copy: telling Ed he is "fenced from live data" while he
// is sitting on his own live data would be a lie the overlay tells every time.
export const DEV_MODE_LOADIN_WORKSPACE = "workspace";
