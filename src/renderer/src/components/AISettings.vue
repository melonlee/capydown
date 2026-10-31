<!--
  AI 设置面板组件
  支持 Claude，以及任意 OpenAI 兼容接口（DeepSeek / Kimi / 通义千问 / OpenAI 等）
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
import { toast } from 'vue-sonner';

type Provider = 'claude' | 'openai';

const {
  aiConfig,
  isLoading,
  initAIConfig,
  updateAIConfig,
  checkAIEnabled,
  isAIEnabled,
} = useAI();

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

watch(() => formData.value.provider, (provider, prev) => {
  if (!prev || provider === prev)
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

const toggleAI = async (enabled: boolean) => {
  try {
    isLoading.value = true;
    if (enabled && !formData.value.apiKey) {
      toast.error('请先输入 API Key');
      return;
    }
    await updateAIConfig({ enabled });
    await checkAIEnabled();
    toast.success(enabled ? 'AI 已启用' : 'AI 已禁用');
  }
  catch (e) {
    console.error('Failed to toggle AI:', e);
    toast.error('操作失败，请重试');
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
      AI 设置
    </h2>

    <p class="text-xs text-muted-foreground leading-relaxed">
      AI 用于起标题、写摘要、润色和续写。请求由本机直接发给你选择的服务商，墨排不经手、不保存你的文章。
    </p>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Switch
          :checked="isAIEnabled"
          @update:checked="toggleAI"
        />
        <span class="text-sm">启用 AI 功能</span>
      </div>
      <div v-if="isAIEnabled" class="flex items-center gap-1 text-xs text-muted-foreground">
        <Check class="h-3 w-3" />
        <span>已启用</span>
      </div>
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
            OpenAI 兼容（DeepSeek / Kimi / 通义千问 / OpenAI）
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="formData.provider === 'openai'" class="space-y-2">
      <label class="text-sm font-medium">快速填写</label>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="preset in openaiPresets"
          :key="preset.name"
          size="sm"
          :variant="formData.baseURL === preset.baseURL ? 'default' : 'outline'"
          :disabled="isLoading"
          @click="applyPreset(preset)"
        >
          {{ preset.name }}
        </Button>
      </div>
      <label class="text-sm font-medium block pt-1">Base URL</label>
      <Input
        v-model="formData.baseURL"
        placeholder="https://api.deepseek.com/v1"
        :disabled="isLoading"
      />
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

    <div class="flex gap-2 pt-2">
      <Button
        variant="default"
        :disabled="isLoading"
        class="flex-1"
        @click="saveConfig"
      >
        <Check v-if="!isLoading" class="h-4 w-4 mr-1" />
        {{ isLoading ? '处理中...' : '保存配置' }}
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
