<script>
export default {
  onLaunch() {
    const token = uni.getStorageSync('token')
    if (!token) {
      uni.reLaunch({ url: '/pages/login/index' })
    }
  },
  onShow() {},
  onHide() {},
}
</script>

<style>
page {
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
  box-sizing: border-box;
}
</style>
