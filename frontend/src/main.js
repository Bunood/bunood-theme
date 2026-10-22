import { FrappeUI, setConfig, frappeRequest } from 'frappe-ui'
import { createApp } from 'vue'

import App from './App.vue'
import { __ } from './i18n'
import router from './router'
import './theme.css'

setConfig('resourceFetcher', frappeRequest)

// "Automatic" follows the device. frappe-ui and the theme's tokens both key dark
// mode on html[data-theme="dark"], so the choice is resolved to one of the two
// poles here and kept in step with the OS.
const html = document.documentElement
if (html.dataset.theme === 'automatic') {
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => (html.dataset.theme = dark.matches ? 'dark' : 'light')
  apply()
  dark.addEventListener('change', apply)
}

const app = createApp(App)
app.use(FrappeUI)
app.use(router)
app.config.globalProperties.__ = __
app.mount('#app')
