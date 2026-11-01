/**
 * 产品名称（界面显示用）：只有一个名字 Capydown（Capybara 卡皮巴拉 + Markdown；原名 LazyBox / Slothdown）。
 * 卡皮巴拉以情绪稳定、什么都不慌出名 —— 对应安静、专注的写作。
 * 中文语境需要说明时用 APP_DESCRIPTOR_ZH；「淡定地写，排版交给卡皮巴拉。」只作标语（APP_SLOGAN_ZH），不作产品名。
 * 安装包 / Bundle 名是 electron-builder 的 productName「Capydown」；appId 仍是 com.lazybox.app（见 CLAUDE.md）。
 */
export const APP_NAME = 'Capydown'
/** 窗口标题、关于面板、菜单共用 */
export const APP_DISPLAY_NAME = APP_NAME
/** 中文描述语：需要解释产品是什么时跟在名字后面 */
export const APP_DESCRIPTOR_ZH = '给公众号作者的 Markdown 编辑器'
/** 标语：只用于海报 / 官网首屏 / README，不是产品名 */
export const APP_SLOGAN_ZH = '淡定地写，排版交给卡皮巴拉。'
/** 英文标语（英文 README / 官网） */
export const APP_SLOGAN_EN = 'Stay calm and write. Capydown does the formatting.'
/** 一句话介绍：欢迎页、启动画面（index.html 内另有一份硬编码）、关于面板共用 */
export const APP_TAGLINE = '像 Typora 一样专心写，一键排成公众号'
