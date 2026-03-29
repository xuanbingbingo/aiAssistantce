'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

/**
 * 从 Master Password 和 salt 派生 AES-256 密钥
 * @param {string} masterPassword
 * @param {string} salt - hex 字符串（服务端返回的用户 salt）
 * @returns {Buffer} 32 字节密钥
 */
function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(
    masterPassword,
    Buffer.from(salt, 'hex'),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * AES-256-CBC 加密
 * 格式：base64( iv(16) + ciphertext )
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {string}
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

/**
 * AES-256-CBC 解密
 * @param {string} cipherBase64
 * @param {Buffer} key
 * @returns {string}
 */
function decrypt(cipherBase64, key) {
  const buf = Buffer.from(cipherBase64, 'base64');
  const iv = buf.slice(0, IV_LENGTH);
  const ciphertext = buf.slice(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

module.exports = { deriveKey, encrypt, decrypt };
