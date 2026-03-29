<template>
  <view class="container">
    <!-- 顶部设备状态栏 -->
    <view class="device-bar" @tap="goDevices">
      <view class="device-bar-left">
        <view :class="['dot', currentDevice ? 'dot-online' : 'dot-none']"></view>
        <text class="device-bar-text">
          {{ currentDevice ? currentDevice.device_name : '未选择设备，点击选择' }}
        </text>
      </view>
      <text class="device-bar-arrow">›</text>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      class="msg-list"
      scroll-y
      :scroll-into-view="lastMsgId"
      scroll-with-animation
    >
      <view v-if="messages.length === 0" class="welcome">
        <text class="welcome-icon">🤖</text>
        <text class="welcome-title">你好，我是你的本地 AI 助手</text>
        <text class="welcome-sub">请先在「设备」标签选择一台在线的电脑，然后发送指令。</text>
        <view class="quick-list">
          <view v-for="q in quickCommands" :key="q" class="quick-item" @tap="useQuick(q)">
            {{ q }}
          </view>
        </view>
      </view>

      <view
        v-for="msg in messages"
        :key="msg.id"
        :id="'msg-' + msg.id"
        :class="['msg-row', msg.role === 'user' ? 'msg-row-user' : 'msg-row-bot']"
      >
        <view v-if="msg.role === 'assistant'" class="avatar">🤖</view>
        <view :class="['bubble', msg.role === 'user' ? 'bubble-user' : 'bubble-bot']">
          <text v-if="msg.loading" class="loading-dots">执行中...</text>
          <template v-else>
            <image
              v-if="msg.imageUrl"
              :src="msg.imageUrl"
              class="msg-image"
              mode="widthFix"
              @tap="previewImage(msg.imageUrl)"
            />
            <text class="msg-text">{{ msg.content }}</text>
          </template>
          <text class="msg-time">{{ formatTime(msg.time) }}</text>
        </view>
        <view v-if="msg.role === 'user'" class="avatar avatar-user">👤</view>
      </view>

      <view id="msg-bottom"></view>
    </scroll-view>

    <!-- 底部输入栏 -->
    <view class="input-bar">
      <input
        class="input"
        v-model="inputText"
        placeholder="输入指令，如：列出桌面文件"
        confirm-type="send"
        @confirm="send"
        :disabled="sending"
      />
      <view :class="['send-btn', (!inputText.trim() || sending) && 'send-btn-disabled']" @tap="send">
        <text>{{ sending ? '...' : '发送' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useAuthStore } from '../../stores/auth'
import { http } from '../../api/http'

const chatStore = useChatStore()
const authStore = useAuthStore()
const messages = computed(() => chatStore.messages)
const inputText = ref('')
const sending = ref(false)
const lastMsgId = ref('')

const quickCommands = [
  '/Users/libin/Desktop',
  '/Users/libin/Downloads',
  '/Users/libin/Documents',
]

const currentDevice = ref(null)

async function loadCurrentDevice() {
  if (!chatStore.currentDeviceId) return
  try {
    const res = await http.get('/api/v1/devices')
    if (res.success) {
      currentDevice.value = res.data.find(d => d.device_id === chatStore.currentDeviceId)
    }
  } catch {}
}

function goDevices() {
  uni.switchTab({ url: '/pages/devices/index' })
}

function useQuick(text) {
  inputText.value = text
}

function previewImage(url) {
  uni.previewImage({ urls: [url], current: url })
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

async function send() {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  if (!authStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  if (!chatStore.currentDeviceId) {
    uni.showToast({ title: '请先选择设备', icon: 'none' })
    uni.switchTab({ url: '/pages/devices/index' })
    return
  }

  inputText.value = ''
  sending.value = true

  try {
    await chatStore.sendCommand(text)
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' })
  } finally {
    sending.value = false
    await nextTick()
    lastMsgId.value = 'msg-bottom'
  }
}

loadCurrentDevice()
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

.device-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 20rpx 32rpx;
  border-bottom: 1rpx solid #eee;
}
.device-bar-left { display: flex; align-items: center; }
.dot {
  width: 16rpx; height: 16rpx; border-radius: 50%; margin-right: 16rpx;
}
.dot-online { background: #2ecc71; }
.dot-none { background: #ddd; }
.device-bar-text { font-size: 26rpx; color: #333; }
.device-bar-arrow { font-size: 36rpx; color: #ccc; }

.msg-list {
  flex: 1;
  padding: 24rpx 24rpx 0;
  overflow: hidden;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 40rpx 40rpx;
}
.welcome-icon { font-size: 100rpx; }
.welcome-title { font-size: 32rpx; font-weight: bold; color: #333; margin-top: 24rpx; }
.welcome-sub { font-size: 26rpx; color: #999; margin-top: 16rpx; text-align: center; line-height: 1.6; }
.quick-list { margin-top: 40rpx; width: 100%; }
.quick-item {
  background: #fff;
  border-radius: 12rpx;
  padding: 20rpx 28rpx;
  margin-bottom: 16rpx;
  font-size: 26rpx;
  color: #5b8af5;
  border: 1rpx solid #e0e8ff;
}

.msg-row {
  display: flex;
  align-items: flex-end;
  margin-bottom: 28rpx;
}
.msg-row-user { justify-content: flex-end; }
.msg-row-bot { justify-content: flex-start; }

.avatar { font-size: 52rpx; margin: 0 12rpx; }
.avatar-user { order: 1; }

.bubble {
  max-width: 70%;
  border-radius: 20rpx;
  padding: 20rpx 28rpx;
  position: relative;
}
.bubble-user {
  background: linear-gradient(135deg, #5b8af5, #7b6cf6);
  color: #fff;
  border-bottom-right-radius: 4rpx;
}
.bubble-bot {
  background: #fff;
  color: #333;
  border-bottom-left-radius: 4rpx;
  box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.06);
}
.msg-image {
  width: 100%;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  display: block;
}
.msg-text { font-size: 28rpx; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
.loading-dots { font-size: 28rpx; color: #999; }
.msg-time { font-size: 20rpx; color: rgba(0,0,0,0.3); margin-top: 8rpx; display: block; text-align: right; }
.bubble-user .msg-time { color: rgba(255,255,255,0.6); }

.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 1rpx solid #eee;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.input {
  flex: 1;
  height: 80rpx;
  background: #f5f7fa;
  border-radius: 40rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
  margin-right: 16rpx;
}
.send-btn {
  width: 112rpx;
  height: 80rpx;
  background: linear-gradient(135deg, #5b8af5, #7b6cf6);
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  font-weight: bold;
}
.send-btn-disabled { opacity: 0.5; }
</style>
