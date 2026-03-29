<template>
  <view class="container">
    <!-- 用户信息 -->
    <view class="user-card">
      <view class="user-avatar">{{ authStore.username.charAt(0).toUpperCase() }}</view>
      <view class="user-info">
        <text class="user-name">{{ authStore.username }}</text>
        <text class="user-status">
          {{ authStore.masterPassword ? '🔐 加密已启用' : '⚠️ 未设置加密主密码' }}
        </text>
      </view>
    </view>

    <!-- 修改主密码 -->
    <view class="section">
      <text class="section-title">加密主密码</text>
      <view class="card">
        <view class="field">
          <text class="label">新主密码</text>
          <input class="input" v-model="newMasterPwd" type="password" placeholder="留空则不修改" />
        </view>
        <view class="field">
          <text class="label">确认主密码</text>
          <input class="input" v-model="confirmMasterPwd" type="password" placeholder="再次输入" />
        </view>
        <text class="hint">⚠️ 主密码用于端到端加密，修改后历史数据将无法解密</text>
        <button class="btn-secondary" @tap="saveMasterPwd">保存主密码</button>
      </view>
    </view>

    <!-- 服务器地址 -->
    <view class="section">
      <text class="section-title">服务器配置</text>
      <view class="card">
        <view class="field">
          <text class="label">Relay 服务器地址</text>
          <input class="input" v-model="relayUrl" placeholder="http://your-server:3000" />
        </view>
        <button class="btn-secondary" @tap="saveRelayUrl">保存地址</button>
      </view>
    </view>

    <!-- 关于 -->
    <view class="section">
      <text class="section-title">关于</text>
      <view class="card">
        <view class="info-row">
          <text class="info-label">版本</text>
          <text class="info-value">v0.1.0</text>
        </view>
        <view class="info-row">
          <text class="info-label">数据安全</text>
          <text class="info-value">端到端 AES-256 加密</text>
        </view>
        <view class="info-row">
          <text class="info-label">DeviceID</text>
          <text class="info-value device-id-text">{{ currentDeviceId || '未选择' }}</text>
        </view>
      </view>
    </view>

    <!-- 退出登录 -->
    <view class="logout-btn" @tap="logout">退出登录</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'

const authStore = useAuthStore()
const chatStore = useChatStore()
const newMasterPwd = ref('')
const confirmMasterPwd = ref('')
const relayUrl = ref(uni.getStorageSync('relayUrl') || 'http://localhost:3000')
const currentDeviceId = ref(chatStore.currentDeviceId)

function saveMasterPwd() {
  if (!newMasterPwd.value) return
  if (newMasterPwd.value !== confirmMasterPwd.value) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' })
    return
  }
  authStore.setMasterPassword(newMasterPwd.value)
  newMasterPwd.value = ''
  confirmMasterPwd.value = ''
  uni.showToast({ title: '主密码已更新', icon: 'success' })
}

function saveRelayUrl() {
  if (!relayUrl.value) return
  uni.setStorageSync('relayUrl', relayUrl.value)
  uni.showToast({ title: '服务器地址已保存，重启生效', icon: 'success' })
}

function logout() {
  uni.showModal({
    title: '确认退出',
    content: '退出登录后需要重新输入账号和主密码',
    success(res) {
      if (res.confirm) {
        authStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    },
  })
}
</script>

<style scoped>
.container { padding: 24rpx; background: #f5f7fa; min-height: 100vh; }

.user-card {
  background: linear-gradient(135deg, #1a1a2e, #0f3460);
  border-radius: 24rpx;
  padding: 40rpx;
  display: flex;
  align-items: center;
  margin-bottom: 32rpx;
}
.user-avatar {
  width: 96rpx; height: 96rpx;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 48rpx; font-weight: bold; color: #fff;
  margin-right: 28rpx;
}
.user-name { font-size: 36rpx; font-weight: bold; color: #fff; display: block; }
.user-status { font-size: 24rpx; color: rgba(255,255,255,0.7); margin-top: 8rpx; display: block; }

.section { margin-bottom: 32rpx; }
.section-title { font-size: 26rpx; color: #999; margin-bottom: 16rpx; padding-left: 8rpx; display: block; }
.card { background: #fff; border-radius: 20rpx; padding: 32rpx; box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.04); }

.field { margin-bottom: 28rpx; }
.label { font-size: 26rpx; color: #666; margin-bottom: 12rpx; display: block; }
.input {
  width: 100%;
  height: 80rpx;
  border: 2rpx solid #eee;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  background: #fafafa;
  box-sizing: border-box;
}
.hint { font-size: 22rpx; color: #f5a623; margin-bottom: 24rpx; display: block; line-height: 1.5; }

.btn-secondary {
  width: 100%;
  height: 88rpx;
  background: #f0f4ff;
  color: #5b8af5;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: bold;
  border: none;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 28rpx; color: #666; }
.info-value { font-size: 28rpx; color: #333; }
.device-id-text { font-size: 22rpx; color: #aaa; }

.logout-btn {
  text-align: center;
  color: #e74c3c;
  font-size: 30rpx;
  padding: 40rpx;
  margin-top: 16rpx;
}
</style>
