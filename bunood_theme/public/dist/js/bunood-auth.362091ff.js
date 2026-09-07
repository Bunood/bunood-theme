/** Login-only bilingual mode. The server still owns translation and direction. */
(function () {
	"use strict";

	function mount_auth_language() {
		if (!document.body || !document.body.classList.contains("bnd-auth")) return;

		const hero = document.querySelector("[data-bnd-auth-hero]");
		const wrapper = document.querySelector(".page-content-wrapper");
		if (hero && wrapper && hero.parentElement !== wrapper) wrapper.appendChild(hero);

		const picker = document.querySelector("[data-bnd-auth-language]");
		if (!picker || picker.hasAttribute("data-bnd-ready")) return;
		picker.setAttribute("data-bnd-ready", "");
		picker.addEventListener("click", (event) => {
			const choice = event.target.closest("[data-bnd-lang]");
			if (!choice || !picker.contains(choice)) return;
			const code = choice.getAttribute("data-bnd-lang");
			if (code !== "en" && code !== "ar") return;
			event.preventDefault();
			const cookie = [
				`preferred_language=${code}`,
				"Path=/",
				"Max-Age=31536000",
				"SameSite=Lax",
			];
			if (window.location.protocol === "https:") cookie.push("Secure");
			document.cookie = cookie.join("; ");
			const next = new URL(window.location.href);
			next.searchParams.set("_lang", code);
			window.location.assign(next.href);
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount_auth_language, { once: true });
	} else {
		mount_auth_language();
	}
})();
