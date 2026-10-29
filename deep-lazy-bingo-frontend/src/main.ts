import App from './App.vue'
import { createApp } from 'vue'
import { initStore } from './store'                 // Store
import { initRouter } from './router'               // Router
import language from './locales'                    // 国际化
import '@styles/core/tailwind.css'                  // tailwind
import '@styles/index.scss'                         // 样式
import '@utils/sys/console.ts'                      // 控制台输出内容
import { setupGlobDirectives } from './directives'
import { setupErrorHandle } from './utils/sys/error-handle'
import { createBackendProbe } from './learning/core'

document.addEventListener(
  'touchstart',
  function () {},
  { passive: false }
)

const app = createApp(App)
initStore(app)
initRouter(app)
setupGlobDirectives(app)
setupErrorHandle(app)

app.use(language)
app.mount('#app')

const backendProbe = createBackendProbe(sessionStorage)
if (!backendProbe.verified()) {
  const checkBackend = async () => {
    if (await backendProbe.check()) location.reload()
  }
  void checkBackend()
  const probeTimer = window.setInterval(checkBackend, 30000)
  window.addEventListener('focus', checkBackend)
  window.addEventListener('online', checkBackend)
  import.meta.hot?.dispose(() => {
    clearInterval(probeTimer)
    window.removeEventListener('focus', checkBackend)
    window.removeEventListener('online', checkBackend)
  })
}