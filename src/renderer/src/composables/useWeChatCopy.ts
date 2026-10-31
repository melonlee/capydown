/**
 * 「复制到公众号」流水线。逻辑原样搬自旧的 EditorHeader：
 * 先切到浅色、内联主题样式（processClipboardContent），再选中 #output 复制，最后还原预览。
 * 只要 #output 在 DOM 中（公众号面板关闭时它在屏幕外渲染），菜单 / 快捷键都能直接复制。
 */
import { useStore } from '@renderer/stores'
import { addPrefix, processClipboardContent } from '@renderer/utils'
import emitter from '@renderer/utils/event'
import { restorePreviewImages } from '@renderer/utils/local-image'

// 复制过程中预览区显示「正在生成」遮罩
export const isCopying = ref(false)
const backLight = ref(false)

function startCopy() {
  isCopying.value = true
  backLight.value = true
}

function endCopy() {
  backLight.value = false
  setTimeout(() => {
    isCopying.value = false
  }, 800)
}

export function useWeChatCopy() {
  const store = useStore()
  const { isDark, output, primaryColor } = storeToRefs(store)
  const { toggleDark, editorRefresh } = store

  const copyMode = useStorage(addPrefix(`copyMode`), `txt`)
  const source = ref(``)
  const { copy: copyContent } = useClipboard({ source })

  // 复制到微信公众号
  function copy() {
    startCopy()
    setTimeout(() => {
      // 如果是深色模式，复制之前需要先切换到白天模式
      const isBeforeDark = isDark.value
      if (isBeforeDark) {
        toggleDark()
      }

      nextTick(async () => {
        restorePreviewImages(document.getElementById(`output`)!)
        processClipboardContent(primaryColor.value)
        const clipboardDiv = document.getElementById(`output`)!
        clipboardDiv.focus()
        window.getSelection()!.removeAllRanges()
        const temp = clipboardDiv.innerHTML
        if (copyMode.value === `txt`) {
          const range = document.createRange()
          range.setStartBefore(clipboardDiv.firstChild!)
          range.setEndAfter(clipboardDiv.lastChild!)
          window.getSelection()!.addRange(range)
          document.execCommand(`copy`)
          window.getSelection()!.removeAllRanges()
        }
        clipboardDiv.innerHTML = output.value
        if (isBeforeDark) {
          nextTick(() => toggleDark())
        }
        if (copyMode.value === `html`) {
          await copyContent(temp)
        }

        // 输出提示
        toast.success(
          copyMode.value === `html`
            ? `已复制 HTML 源码，请进行下一步操作。`
            : `已复制渲染后的内容到剪贴板，可直接到公众号后台粘贴。`,
        )

        editorRefresh()
        endCopy()
      })
    }, 350)
  }

  // 生成公众号可直接粘贴的 HTML（主题样式已内联），完成后恢复预览区
  function renderWeChatHtml(): Promise<string> {
    return new Promise((resolve) => {
      startCopy()
      setTimeout(() => {
        const isBeforeDark = isDark.value
        if (isBeforeDark) {
          toggleDark()
        }
        nextTick(() => {
          let html = ``
          try {
            restorePreviewImages(document.getElementById(`output`)!)
            processClipboardContent(primaryColor.value)
            const clipboardDiv = document.getElementById(`output`)!
            html = clipboardDiv.innerHTML
            clipboardDiv.innerHTML = output.value
          }
          finally {
            if (isBeforeDark) {
              nextTick(() => toggleDark())
            }
            editorRefresh()
            endCopy()
            resolve(html)
          }
        })
      }, 350)
    })
  }

  return { copy, copyMode, renderWeChatHtml, backLight }
}

/** 供发布对话框通过事件拿到「公众号格式」HTML；在工作台挂载时注册一次 */
export function registerWeChatHtmlProvider() {
  const { renderWeChatHtml } = useWeChatCopy()
  const handler = (callback: unknown) => {
    if (typeof callback === `function`)
      renderWeChatHtml().then(html => callback(html))
  }
  onMounted(() => emitter.on(`publish:render-wechat-html`, handler))
  onBeforeUnmount(() => emitter.off(`publish:render-wechat-html`, handler))
}
