/**
 * 产品名称（界面显示用）：只有一个名字 Slothdown（sloth 树懒 + Markdown，也读作 slow down）。
 * 中文语境需要说明时用 APP_DESCRIPTOR_ZH；「懒得排版？交给树懒。」只作标语（APP_SLOGAN_ZH），不作产品名。
 * 安装包 / Bundle 名是 electron-builder 的 productName「Slothdown」；appId 仍是 com.lazybox.app（见 CLAUDE.md）。
 */
export const APP_NAME = 'Slothdown'
/** 窗口标题、关于面板、菜单共用（v0.3.1 起不再带中文名） */
export const APP_DISPLAY_NAME = APP_NAME
/** 中文描述语：需要解释产品是什么时跟在名字后面 */
export const APP_DESCRIPTOR_ZH = '给公众号作者的 Markdown 编辑器'
/** 标语：只用于海报 / 官网首屏 / README，不是产品名 */
export const APP_SLOGAN_ZH = '懒得排版？交给树懒。'
/** 一句话介绍：欢迎页、启动画面（index.html 内另有一份硬编码）、关于面板共用 */
export const APP_TAGLINE = '像 Typora 一样专心写，一键排成公众号'
