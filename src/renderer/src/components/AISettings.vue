<!--
  AI 设置（尽量少）：服务商、Base URL（OpenAI 兼容）、API Key、模型、测试连接。
  AI 只用于两件事：发布前校对、发布对话框里的拟标题和摘要。
  支持 Claude，以及任意 OpenAI 兼容接口（DeepSeek / Kimi / 通义千问 / OpenAI / 自建网关）。
-->
<script setup lang="ts">
import { Check, Eye, EyeOff, Sparkles } from 'lucide-vue-next';
import { useAI } from '@renderer/composables/useAI';
import { Button } from '@renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Input } from '@renderer/components/ui/input';
import { Switch } from '@renderer/components/ui/switch';
import { proofreadIncludeStyle } from '@renderer/composables/useProofread';
import { toast } from 'vue-sonner';

type Provider = 'claude' | 'openai';

function setIncludeStyle(v: boolean) {
  proofreadIncludeStyle.value = v;
}

const {
  aiConfig,
  isLoading,
  initAIConfig,
  updateAIConfig,
  checkAIEnabled,
} = useAI();

/** 已保存的配置里有 Key：显示「已配置」 */
const configured = computed(() => !!aiConfig.value.apiKey);

const showAPIKey = ref(false);

const formData = ref({
  apiKey: '',
  provider: 'claude' as Provider,
  model: 'claude-opus-4-7',
  baseURL: '',
});

// Claude 模型
const claudeModels = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7（效果最好）' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（速度与效果平衡）' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（最快、最便宜）' },
];

// OpenAI 兼容服务预设：只是帮你填好 Base URL 和常用模型名，可以随时改
const openaiPresets = [
  { name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { name: 'Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://bailian.console.aliyun.com/' },
  { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
];

const keyHelp = computed(() => {
  if (formData.value.provider === 'claude')
    return { label: 'console.anthropic.com', url: 'https://console.anthropic.com/' };
  const preset = openaiPresets.find(p => p.baseURL === formData.value.baseURL);
  return preset ? { label: `${preset.name} 控制台`, url: preset.keyUrl } : null;
});

function applyPreset(preset: typeof openaiPresets[number]) {
  formData.value.baseURL = preset.baseURL;
  formData.value.model = preset.model;
}

// 载入已保存的配置时不触发「切换服务商 → 预填」，否则会覆盖保存的 Base URL 和模型
let hydrating = true;

watch(() => formData.value.provider, (provider, prev) => {
  if (hydrating || !prev || provider === prev)
    return;
  if (provider === 'claude') {
    formData.value.model = claudeModels[0].value;
    formData.value.baseURL = '';
  }
  else {
    applyPreset(openaiPresets[0]);
  }
});

onMounted(async () => {
  await initAIConfig();
  const provider: Provider = aiConfig.value.provider === 'claude' ? 'claude' : 'openai';
  formData.value = {
    apiKey: aiConfig.value.apiKey || '',
    provider,
    model: aiConfig.value.model || (provider === 'claude' ? claudeModels[0].value : ''),
    baseURL: aiConfig.value.baseURL || '',
  };
  await nextTick();
  hydrating = false;
});

function validate(): boolean {
  if (!formData.value.apiKey.trim()) {
    toast.error('请输入 API Key');
    return false;
  }
  if (formData.value.provider === 'openai') {
    if (!/^https?:\/\//.test(formData.value.baseURL.trim())) {
      toast.error('请填写正确的 Base URL（以 http:// 或 https:// 开头）');
      return false;
    }
    if (!formData.value.model.trim()) {
      toast.error('请填写模型名称');
      return false;
    }
  }
  return true;
}

function payload() {
  return {
    apiKey: formData.value.apiKey.trim(),
    provider: formData.value.provider,
    model: formData.value.model.trim(),
    baseURL: formData.value.provider === 'openai' ? formData.value.baseURL.trim() : '',
  };
}

const saveConfig = async () => {
  if (!validate())
    return;
  try {
    isLoading.value = true;
    await updateAIConfig({ ...payload(), enabled: true });
    await checkAIEnabled();
    toast.success('AI 配置已保存');
  }
  catch (e) {
    console.error('Failed to save AI config:', e);
    toast.error('保存失败，请重试');
  }
  finally {
    isLoading.value = false;
  }
};

// 测试连接：保存当前表单并发送一条极短的请求
const testConnection = async () => {
  if (!validate())
    return;
  try {
    isLoading.value = true;
    await updateAIConfig({ ...payload(), enabled: true });
    await checkAIEnabled();
    const result = await window.$api.aiGenerateText('请只回复两个字：成功', { maxTokens: 16 });
    toast.success(`连接成功，模型回复：${String(result).trim().slice(0, 20) || '（空）'}`);
  }
  catch (e) {
    console.error('Connection test failed:', e);
    const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
    toast.error(`连接失败：${message.slice(0, 120)}`);
  }
  finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="ai-settings space-y-4">
    <h2 class="lb-prefs-h2 flex items-center gap-1.5">
      <Sparkles class="h-3.5 w-3.5" />
      AI
    </h2>

    <p class="text-xs text-muted-foreground leading-relaxed">
      AI 只做两件事：<strong class="font-medium text-foreground">发布前校对</strong>（错别字、语病、标点、重复用词）和在发布对话框里<strong class="font-medium text-foreground">拟标题、写摘要</strong>。请求由本机直接发给你选择的服务商，Capydown 不经手、不保存你的文章。
    </p>

    <div v-if="configured" class="flex items-center gap-1 text-xs text-muted-foreground">
      <Check class="h-3 w-3" />
      <span>已配置</span>
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium">服务商</label>
      <Select v-model="formData.provider" :disabled="isLoading">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude">
            Claude (Anthropic)
          </SelectItem>
          <SelectItem value="openai">
            OpenAI 兼容（DeepSeek / Kimi / 通义千问 / OpenAI / 网关）
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="formData.provider === 'openai'" class="space-y-2">
      <label class="text-sm font-medium block">Base URL</label>
      <Input
        v-model="formData.baseURL"
        placeholder="https://api.deepseek.com/v1"
        :disabled="isLoading"
      />
      <p class="text-xs text-muted-foreground">
        快速填写：
        <template v-for="(preset, i) in openaiPresets" :key="preset.name">
          <span v-if="i" class="opacity-50"> · </span>
          <button
            type="button"
            class="underline-offset-2 hover:underline"
            :class="formData.baseURL === preset.baseURL ? 'text-foreground font-medium underline' : ''"
            :disabled="isLoading"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </template>
      </p>
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium">API Key</label>
      <div class="relative">
        <Input
          v-model="formData.apiKey"
          :type="showAPIKey ? 'text' : 'password'"
          placeholder="输入 API Key"
          :disabled="isLoading"
          class="pr-8"
        />
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          @click="showAPIKey = !showAPIKey"
        >
          <Eye v-if="!showAPIKey" class="h-4 w-4" />
          <EyeOff v-else class="h-4 w-4" />
        </button>
      </div>
      <p v-if="keyHelp" class="text-xs text-muted-foreground">
        获取 API Key：
        <a :href="keyHelp.url" target="_blank" class="underline underline-offset-2 decoration-muted-foreground hover:decoration-foreground">{{ keyHelp.label }}</a>
      </p>
      <p class="text-xs text-muted-foreground">
        Key 仅保存在本机的应用配置中。
      </p>
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium">模型</label>
      <Select
        v-if="formData.provider === 'claude'"
        v-model="formData.model"
        :disabled="isLoading"
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in claudeModels"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        v-else
        v-model="formData.model"
        placeholder="例如 deepseek-chat、qwen-plus、gpt-4o-mini"
        :disabled="isLoading"
      />
    </div>

    <div class="flex items-start justify-between gap-3 pt-1">
      <div>
        <div class="text-sm font-medium">
          校对时包含风格建议
        </div>
        <p class="text-xs text-muted-foreground mt-0.5">
          额外检查中文与英文、数字之间的空格。默认关闭，只报确定的错误。
        </p>
      </div>
      <Switch :checked="proofreadIncludeStyle" @update:checked="setIncludeStyle" />
    </div>

    <div class="flex gap-2 pt-2">
      <Button
        variant="default"
        :disabled="isLoading"
        class="flex-1"
        @click="saveConfig"
      >
        <Check v-if="!isLoading" class="h-4 w-4 mr-1" />
        {{ isLoading ? '处理中…' : '保存' }}
      </Button>
      <Button
        variant="outline"
        :disabled="isLoading || !formData.apiKey"
        @click="testConnection"
      >
        测试连接
      </Button>
    </div>
  </div>
</template>

<style scoped>
.ai-settings {
  padding: 0;
}
</style>
