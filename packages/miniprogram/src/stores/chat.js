import { defineStore } from 'pinia'
import { ref } from 'vue'
import { http } from '../api/http'
import { useAuthStore } from './auth'
import { encrypt, decrypt } from '../utils/crypto'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const currentDeviceId = ref(uni.getStorageSync('currentDeviceId') || '')

  function setDevice(deviceId) {
    currentDeviceId.value = deviceId
    uni.setStorageSync('currentDeviceId', deviceId)
  }

  function addMessage(msg) {
    messages.value.push({ ...msg, id: Date.now() + Math.random() })
    return messages.value[messages.value.length - 1]
  }

  async function sendCommand(text) {
    const authStore = useAuthStore()
    if (!currentDeviceId.value) throw new Error('请先选择设备')

    const key = authStore.getDerivedKey()

    // 直接发送自然语言文本（Agent 端有 ANTHROPIC_API_KEY 时走 AI 路由，否则需结构化）
    const encryptedPayload = key ? encrypt(text, key) : text

    addMessage({ role: 'user', content: text, time: new Date() })

    const res = await http.post('/api/v1/command', {
      deviceId: currentDeviceId.value,
      encryptedPayload,
    })

    if (!res.success) throw new Error(res.error)

    const commandId = res.data.commandId
    addMessage({ role: 'assistant', content: '思考中...', commandId, loading: true, time: new Date() })

    return await pollResult(commandId, key)
  }

  async function pollResult(commandId, key) {
    const MAX_POLLS = 60  // 最多等 60 秒（AI 调用比较慢）
    let attempts = 0

    while (attempts < MAX_POLLS) {
      await sleep(1000)
      attempts++

      const res = await http.get(`/api/v1/command/${commandId}/result`)
      if (!res.success) continue

      const { status, encryptedResult } = res.data
      if (status === 'pending') continue

      let result
      try {
        const plaintext = key && encryptedResult ? decrypt(encryptedResult, key) : encryptedResult
        result = JSON.parse(plaintext)
      } catch {
        result = { success: false, error: '结果解析失败' }
      }

      const idx = messages.value.findIndex(m => m.commandId === commandId)
      if (idx !== -1) {
        const imageUrl = extractImageUrl(result)
        messages.value[idx] = {
          ...messages.value[idx],
          loading: false,
          content: formatResult(result),
          imageUrl,
          rawResult: result,
          status,
        }
      }
      return result
    }
    throw new Error('指令超时（60s），请重试')
  }

  function formatResult(result) {
    if (!result) return '无结果'

    // AI 路由返回的格式（有 summary 字段）
    if (result.type === 'ai_result') {
      if (!result.success) return `❌ ${result.summary || result.error}`
      return result.summary || '执行完成'
    }

    // 结构化 tool_result
    if (!result.success) return `❌ ${result.error}`
    const data = result.data
    if (Array.isArray(data)) {
      const lines = data.slice(0, 20).map(f => `${f.type === 'directory' ? '📁' : '📄'} ${f.name}`)
      if (data.length > 20) lines.push(`... 共 ${data.length} 个条目`)
      return lines.join('\n')
    }
    if (data && typeof data === 'object') {
      return JSON.stringify(data, null, 2)
    }
    return String(data ?? '执行完成')
  }

  function extractImageUrl(result) {
    if (!result) return null
    // ai_result 场景：view_image 工具返回的 data 中含 dataUrl
    if (result.type === 'ai_result' && result.data?.dataUrl) return result.data.dataUrl
    // 结构化直接调用场景
    if (result.success && result.data?.dataUrl) return result.data.dataUrl
    return null
  }

  function clearMessages() {
    messages.value = []
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
  }

  return { messages, currentDeviceId, setDevice, sendCommand, clearMessages }
})
