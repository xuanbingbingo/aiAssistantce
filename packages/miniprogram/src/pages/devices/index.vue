<template>
  <view class="container">
    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="devices.length === 0" class="empty">
      <text class="empty-icon">💻</text>
      <text class="empty-text">暂无设备</text>
      <text class="empty-sub">在电脑上运行桌面 Agent 后，设备会自动出现在这里</text>
    </view>

    <view v-else>
      <view
        v-for="device in devices"
        :key="device.device_id"
        :class="['device-card', currentDeviceId === device.device_id && 'device-selected']"
        @tap="selectDevice(device)"
      >
        <view class="device-left">
          <text class="device-icon">💻</text>
          <view class="device-info">
            <text class="device-name">{{ device.device_name }}</text>
            <text class="device-id">{{ device.device_id.slice(0, 8) }}...</text>
          </view>
        </view>
        <view class="device-right">
          <view :class="['status-dot', device.is_online ? 'online' : 'offline']"></view>
          <text :class="['status-text', device.is_online ? 'online-text' : 'offline-text']">
            {{ device.is_online ? '在线' : '离线' }}
          </text>
        </view>
      </view>
    </view>

    <view class="refresh-btn" @tap="loadDevices">
      <text>刷新设备列表</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { http } from '../../api/http'
import { useChatStore } from '../../stores/chat'

const chatStore = useChatStore()
const devices = ref([])
const loading = ref(false)
const currentDeviceId = ref(chatStore.currentDeviceId)

async function loadDevices() {
  loading.value = true
  try {
    const res = await http.get('/api/v1/devices')
    if (res.success) {
      devices.value = res.data
    }
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' })
  } finally {
    loading.value = false
  }
}

function selectDevice(device) {
  if (!device.is_online) {
    uni.showToast({ title: '该设备当前不在线', icon: 'none' })
    return
  }
  chatStore.setDevice(device.device_id)
  currentDeviceId.value = device.device_id
  uni.showToast({ title: `已选择 ${device.device_name}`, icon: 'success' })
}

onMounted(loadDevices)
</script>

<style scoped>
.container { padding: 24rpx; background: #f5f7fa; min-height: 100vh; }

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
}
.empty-icon { font-size: 100rpx; }
.empty-text { font-size: 32rpx; font-weight: bold; color: #333; margin-top: 24rpx; }
.empty-sub { font-size: 26rpx; color: #999; margin-top: 16rpx; text-align: center; line-height: 1.6; }

.device-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 32rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.06);
  border: 2rpx solid transparent;
}
.device-selected { border-color: #5b8af5; background: #f0f4ff; }

.device-left { display: flex; align-items: center; }
.device-icon { font-size: 60rpx; margin-right: 24rpx; }
.device-name { font-size: 30rpx; font-weight: bold; color: #1a1a2e; display: block; }
.device-id { font-size: 22rpx; color: #aaa; display: block; margin-top: 6rpx; }

.device-right { display: flex; align-items: center; }
.status-dot {
  width: 16rpx; height: 16rpx; border-radius: 50%; margin-right: 10rpx;
}
.online { background: #2ecc71; }
.offline { background: #bbb; }
.status-text { font-size: 24rpx; }
.online-text { color: #2ecc71; }
.offline-text { color: #bbb; }

.refresh-btn {
  margin-top: 32rpx;
  text-align: center;
  color: #5b8af5;
  font-size: 28rpx;
  padding: 24rpx;
}
</style>
