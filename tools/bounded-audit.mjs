/** A timed-out browser audit aborts the suite; it never runs alongside later checks. */
export async function boundedAudit(run, stopBrowser, timeoutMs = 120000) {
  let timer;
  const audit = Promise.resolve().then(run);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Accessibility audit exceeded ${timeoutMs}ms; aborting suite and restoring site`);
      error.fatalSuite = true;
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([audit, timeout]);
  } catch (error) {
    if (error.fatalSuite) {
      // Closing Chromium terminates pending frame evaluations. Join the audit
      // before rethrowing: no evaluation may survive into another test.
      await stopBrowser();
      await audit.catch(() => {});
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
