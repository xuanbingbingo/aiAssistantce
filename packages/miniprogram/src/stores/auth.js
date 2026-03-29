import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deriveKey } from '../utils/crypto'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(uni.getStorageSync('token') || '')
  const username = ref(uni.getStorageSync('username') || '')
  const salt = ref(uni.getStorageSync('salt') || '')
  const masterPassword = ref(uni.getStorageSync('masterPassword') || '')

  const isLoggedIn = computed(() => !!token.value)

  // 派生的 AES 密钥（内存中，不持久化）
  let _derivedKey = null
  function getDerivedKey() {
    if (!_derivedKey && masterPassword.value && salt.value) {
      _derivedKey = deriveKey(masterPassword.value, salt.value)
    }
    return _derivedKey
  }

  function setAuth(data) {
    token.value = data.token
    username.value = data.username
    salt.value = data.salt
    _derivedKey = null
    uni.setStorageSync('token', data.token)
    uni.setStorageSync('username', data.username)
    uni.setStorageSync('salt', data.salt)
  }

  function setMasterPassword(pwd) {
    masterPassword.value = pwd
    _derivedKey = null
    uni.setStorageSync('masterPassword', pwd)
  }

  function logout() {
    token.value = ''
    username.value = ''
    salt.value = ''
    masterPassword.value = ''
    _derivedKey = null
    uni.removeStorageSync('token')
    uni.removeStorageSync('username')
    uni.removeStorageSync('salt')
    uni.removeStorageSync('masterPassword')
  }

  return { token, username, salt, masterPassword, isLoggedIn, setAuth, setMasterPassword, logout, getDerivedKey }
})
