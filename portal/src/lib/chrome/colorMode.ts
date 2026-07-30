export const COLOR_MODE_STORAGE_KEY = "milesymedia-color-mode";

export const COLOR_MODE_SCRIPT = `try{var m=localStorage.getItem("${COLOR_MODE_STORAGE_KEY}");document.documentElement.dataset.colorMode=m==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.colorMode="light"}`;
