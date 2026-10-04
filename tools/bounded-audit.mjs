/** A timed-out browser audit aborts the suite; it never runs alongside later checks. */
export async function boundedAudit(run, stopBrowser, timeoutMs = 120000, cleanupMs = 10000) {
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
      // No later test runs after this fatal error. Attempt browser shutdown and
      // join canceled evaluations, but cleanup failure must never replace the
      // fatal error or prevent the outer finally from restoring site settings.
      let cleanupTimer;
      const cleanup = Promise.allSettled([
        Promise.resolve().then(stopBrowser), audit,
      ]);
      try {
        await Promise.race([cleanup, new Promise(resolve => {
          cleanupTimer = setTimeout(resolve, cleanupMs);
        })]);
      } finally {
        clearTimeout(cleanupTimer);
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
