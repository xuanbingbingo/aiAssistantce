'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 将文本内容导出为 PDF
 * @param {{ content: string, filename?: string, outputDir?: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function exportPdf(args, config) {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch {
    throw new Error('pdfkit 未安装，请运行: npm install pdfkit');
  }

  const filename = args.filename || `export_${Date.now()}.pdf`;
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(os.homedir(), 'Downloads');

  // 检查输出目录权限
  if (config.allowedPaths && config.allowedPaths.length > 0) {
    const allowed = config.allowedPaths.some((p) => outputDir.startsWith(path.resolve(p)));
    if (!allowed) {
      throw new Error(`输出目录不在写入白名单内: ${outputDir}`);
    }
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, filename.endsWith('.pdf') ? filename : filename + '.pdf');

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    // 注册支持中文的字体（如果系统有的话）
    const chineseFontPaths = [
      '/System/Library/Fonts/PingFang.ttc',         // macOS
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', // Linux
      'C:\\Windows\\Fonts\\msyh.ttc',               // Windows 微软雅黑
    ];
    let fontLoaded = false;
    for (const fontPath of chineseFontPaths) {
      if (fs.existsSync(fontPath)) {
        try {
          doc.font(fontPath);
          fontLoaded = true;
          break;
        } catch {
          // 继续尝试下一个
        }
      }
    }

    doc.fontSize(12).text(args.content, { lineGap: 4 });
    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    path: outputPath,
    filename: path.basename(outputPath),
    message: 'PDF 导出成功',
  };
}

module.exports = exportPdf;
