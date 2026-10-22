// What the server rendered into the page (bunood_hr/www/people.py), with the
// development server's stand-in when the page is served by Vite alone.
const served = window.bnd_hr || {}

export const boot = {
  user: served.user || 'Administrator',
  fullName: served.full_name || '',
  lang: served.lang || document.documentElement.lang || 'en',
  dir: served.dir || document.documentElement.dir || 'ltr',
  company: served.company || null,
  messages: served.messages || {},
}
