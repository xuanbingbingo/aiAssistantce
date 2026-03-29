import { useAuthStore } from '../stores/auth'

const BASE_URL = import.meta.env.VITE_RELAY_HTTP || 'http://localhost:3000'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const authStore = useAuthStore()
    const header = { 'Content-Type': 'application/json' }
    if (authStore.token) {
      header['Authorization'] = `Bearer ${authStore.token}`
    }

    uni.request({
      url: BASE_URL + path,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode === 401) {
          authStore.logout()
          uni.reLaunch({ url: '/pages/login/index' })
          reject(new Error('登录已过期'))
          return
        }
        resolve(res.data)
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

export const http = {
  get: (path) => request('GET', path),
  post: (path, data) => request('POST', path, data),
  delete: (path) => request('DELETE', path),
}
