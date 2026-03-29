import CryptoJS from 'crypto-js'

const ITERATIONS = 100000
const KEY_SIZE = 8 // 8 words = 32 bytes = 256 bits

/**
 * PBKDF2 派生 AES-256 密钥
 * @param {string} masterPassword
 * @param {string} saltHex - hex 字符串
 * @returns {CryptoJS.lib.WordArray}
 */
export function deriveKey(masterPassword, saltHex) {
  const salt = CryptoJS.enc.Hex.parse(saltHex)
  return CryptoJS.PBKDF2(masterPassword, salt, {
    keySize: KEY_SIZE,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  })
}

/**
 * AES-256-CBC 加密
 * 格式：base64( iv(16bytes) + ciphertext ) — 与桌面端 Node.js 格式完全一致
 * @param {string} plaintext
 * @param {CryptoJS.lib.WordArray} key
 * @returns {string} base64
 */
export function encrypt(plaintext, key) {
  const iv = CryptoJS.lib.WordArray.random(16)
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  // 拼接 iv(4 words=16bytes) + ciphertext
  const combined = iv.clone().concat(encrypted.ciphertext)
  return CryptoJS.enc.Base64.stringify(combined)
}

/**
 * AES-256-CBC 解密
 * @param {string} cipherBase64
 * @param {CryptoJS.lib.WordArray} key
 * @returns {string}
 */
export function decrypt(cipherBase64, key) {
  const combined = CryptoJS.enc.Base64.parse(cipherBase64)
  const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), 16)
  const ciphertext = CryptoJS.lib.WordArray.create(
    combined.words.slice(4),
    combined.sigBytes - 16
  )
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  )
  return decrypted.toString(CryptoJS.enc.Utf8)
}
