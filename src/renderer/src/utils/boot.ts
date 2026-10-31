/**
 * 启动画面（src/renderer/index.html 里的 #lb-splash）的收尾信号。
 *
 * 欢迎页挂载、或工作台打开第一篇文档后调用 markAppReady()：等两帧确保新界面已经画出来，
 * 再通知启动画面播完并淡出。重复调用无副作用。
 */
declare global {
  interface Window {
    __lbSplash?: { ready: () => void }
  }
}

let signalled = false

export function markAppReady() {
  if (signalled)
    return
  signalled = true
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add('lb-app-ready')
    window.__lbSplash?.ready()
  }))
}
