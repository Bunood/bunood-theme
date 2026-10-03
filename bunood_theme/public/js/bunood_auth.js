/** Login-only bilingual mode. The server still owns translation and direction. */
(function () {
	"use strict";

	function mount_auth_language() {
		if (!document.body || !document.body.classList.contains("bnd-auth")) return;
		// The mark repeats the page's brand identity; Frappe emits it without alt.
		// Treat it as decorative so the login heading remains the sole announcement.
		for (const logo of document.querySelectorAll(".page-card-head .app-logo:not([alt])")) {
			logo.alt = "";
		}
		const loginCard = document.querySelector(".for-login .page-card");
		if (loginCard) {
			const arabic = document.documentElement.dir === "rtl";
			const heading = loginCard.querySelector(".page-card-head h4");
			const subtitle = loginCard.querySelector(".page-card-subtitle");
			if (heading) heading.textContent = arabic ? "سجّل الدخول إلى بنود" : "Sign in to Bunood";
			if (subtitle) subtitle.textContent = arabic
				? "استخدم بريد العمل للوصول إلى مساحة عملك."
				: "Use your work email to open your workspace.";
		}

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
