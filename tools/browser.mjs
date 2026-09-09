/**
 * Launch options for the browser-backed verification tools.
 *
 * Playwright's bundled Chromium remains the default. Environments that already
 * provide a managed browser can opt into it without changing the tests:
 *
 *   BND_BROWSER_CHANNEL=chrome
 *   BND_BROWSER_EXECUTABLE="C:\\path\\to\\chrome.exe"
 *
 * A channel and an explicit executable are mutually exclusive because
 * Playwright gives them different update/compatibility guarantees.
 */
export function browserLaunchOptions() {
	const channel = process.env.BND_BROWSER_CHANNEL;
	const executablePath = process.env.BND_BROWSER_EXECUTABLE;
	if (channel && executablePath) {
		throw new Error("Set only one of BND_BROWSER_CHANNEL or BND_BROWSER_EXECUTABLE");
	}
	return {
		...(channel ? { channel } : {}),
		...(executablePath ? { executablePath } : {}),
	};
}
