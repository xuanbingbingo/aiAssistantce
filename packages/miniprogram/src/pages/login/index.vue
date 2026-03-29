<template>
  <view class="container">
    <view class="logo-area">
      <text class="logo-icon">🤖</text>
      <text class="logo-title">本地 AI 助手</text>
      <text class="logo-sub">数据留在你自己的设备上</text>
    </view>

    <view class="card">
      <view class="tab-row">
        <text :class="['tab', mode === 'login' && 'tab-active']" @tap="mode = 'login'">登录</text>
        <text :class="['tab', mode === 'register' && 'tab-active']" @tap="mode = 'register'">注册</text>
      </view>

      <view class="form">
        <view class="field">
          <text class="label">用户名</text>
          <input class="input" v-model="username" placeholder="请输入用户名" />
        </view>
        <view class="field">
          <text class="label">密码</text>
          <input class="input" v-model="password" type="password" placeholder="请输入密码" />
        </view>
        <view class="field" v-if="mode === 'login'">
          <text class="label">加密主密码</text>
          <input class="input" v-model="masterPassword" type="password" placeholder="本地加密密钥（不传服务器）" />
          <text class="hint">用于端到端加密，忘记后数据无法解密</text>
        </view>
      </view>

      <button class="btn-primary" :disabled="loading" @tap="submit">
        {{ loading ? '请稍候...' : (mode === 'login' ? '登录' : '注册') }}
      </button>

      <text class="error" v-if="error">{{ error }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { http } from '../../api/http'

const authStore = useAuthStore()
const mode = ref('login')
const username = ref('')
const password = ref('')
const masterPassword = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '用户名和密码不能为空'
    return
  }
  if (mode.value === 'login' && !masterPassword.value) {
    error.value = '请输入加密主密码'
    return
  }

  loading.value = true
  try {
    const path = mode.value === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register'
    const res = await http.post(path, { username: username.value, password: password.value })

    if (!res.success) {
      error.value = res.error || '操作失败'
      return
    }

    if (mode.value === 'register') {
      uni.showToast({ title: '注册成功，请登录', icon: 'success' })
      mode.value = 'login'
      return
    }

    authStore.setAuth(res.data)
    authStore.setMasterPassword(masterPassword.value)
    uni.switchTab({ url: '/pages/chat/index' })
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 40rpx 40rpx;
}
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 60rpx;
}
.logo-icon { font-size: 100rpx; }
.logo-title { font-size: 48rpx; font-weight: bold; color: #fff; margin-top: 20rpx; }
.logo-sub { font-size: 26rpx; color: rgba(255,255,255,0.6); margin-top: 12rpx; }

.card {
  width: 100%;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 20rpx 60rpx rgba(0,0,0,0.3);
}
.tab-row { display: flex; margin-bottom: 40rpx; border-bottom: 2rpx solid #eee; }
.tab { flex: 1; text-align: center; padding-bottom: 24rpx; font-size: 30rpx; color: #999; }
.tab-active { color: #5b8af5; border-bottom: 4rpx solid #5b8af5; font-weight: bold; }

.field { margin-bottom: 32rpx; }
.label { font-size: 26rpx; color: #666; margin-bottom: 12rpx; display: block; }
.input {
  width: 100%;
  height: 88rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  background: #fafafa;
  box-sizing: border-box;
}
.hint { font-size: 22rpx; color: #f5a623; margin-top: 8rpx; display: block; }

.btn-primary {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(135deg, #5b8af5, #7b6cf6);
  color: #fff;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  margin-top: 16rpx;
}
.btn-primary[disabled] { opacity: 0.6; }
.error { color: #e74c3c; font-size: 26rpx; margin-top: 20rpx; display: block; text-align: center; }
</style>
