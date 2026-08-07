export const SIDEBAR_COLLAPSED_KEY = "mm-sidebar-collapsed";

// Runs in <head> before the sidebar paints. The root data attribute lets CSS
// honour the saved preference before React mounts and synchronises the aside.
export const SIDEBAR_COLLAPSE_HYDRATION_SCRIPT = `try{var v=localStorage.getItem("${SIDEBAR_COLLAPSED_KEY}")==="1";document.documentElement.setAttribute("data-sidebar-collapsed",String(v))}catch{}`;
