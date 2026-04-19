const ci = require('miniprogram-ci')
const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')

const pkg = require('../packages/miniprogram/package.json')

console.log('🔨 开始构建小程序...')
execSync('cd packages/miniprogram && npm run build:mp-weixin', { stdio: 'inherit' })

const distPath = path.resolve(__dirname, '../packages/miniprogram/dist/build/mp-weixin')
const projectConfigPath = path.join(distPath, 'project.config.json')

if (!fs.existsSync(projectConfigPath)) {
  const projectConfig = {
    description: 'AI 助手',
    setting: {
      urlCheck: false, es6: true, enhance: true, postcss: true,
      minified: true, newFeature: true, coverView: true,
      nodeModules: false, autoAudits: false, minifyWXSS: true, minifyWXML: true
    },
    compileType: 'miniprogram',
    libVersion: '3.15.1',
    appid: process.env.WECHAT_APPID || '',
    projectname: 'ai-assistant-miniprogram',
    packOptions: { ignore: [], include: [] }
  }
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2))
}

const project = new ci.Project({
  appid: process.env.WECHAT_APPID || '',
  type: 'miniProgram',
  projectPath: distPath,
  privateKeyPath: path.resolve(__dirname, '../private.key'),
  ignores: ['node_modules/**/*'],
})

console.log('🚀 开始上传小程序...')
ci.upload({
  project,
  version: pkg.version,
  desc: `CI 自动上传 ${new Date().toISOString()}`,
  setting: { es6: true, minify: true, autoPrefixWXSS: true },
  onProgressUpdate: console.log,
}).then(() => {
  console.log(`✅ 上传成功 v${pkg.version}`)
}).catch(err => {
  console.error('❌ 上传失败：', err)
  process.exit(1)
})
