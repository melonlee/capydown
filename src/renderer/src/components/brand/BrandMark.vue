<script setup lang="ts">
/**
 * 应用内标志。SVG 只用 currentColor，内联后跟随文字颜色（夜间主题自动反白）。
 * 换标志只需替换 assets/images/logo-mark.svg。
 */
import markSvg from '@renderer/assets/images/logo-mark.svg?raw'
</script>

<template>
  <span class="lb-brand-mark" aria-hidden="true" v-html="markSvg" />
</template>

<style scoped>
.lb-brand-mark {
  display: inline-flex;
  line-height: 0;
}

.lb-brand-mark :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
