/**
 * 识别图片格式并读出像素尺寸（只支持 Word 能直接嵌入的 PNG / JPEG / GIF / BMP）。
 */
export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'

export interface ImageInfo {
  type: DocxImageType
  width: number
  height: number
}

export function readImageInfo(buf: Uint8Array): ImageInfo | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  if (b.length < 24)
    return null
  // PNG: 8 字节签名 + IHDR（宽高为大端 32 位）
  if (b.readUInt32BE(0) === 0x89504E47 && b.readUInt32BE(4) === 0x0D0A1A0A)
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  // GIF: "GIF87a" / "GIF89a"，宽高为小端 16 位
  if (b.toString('ascii', 0, 3) === 'GIF')
    return { type: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  // BMP: "BM"，宽高为小端 32 位（高度可能为负，表示自上而下）
  if (b[0] === 0x42 && b[1] === 0x4D && b.length >= 26)
    return { type: 'bmp', width: Math.abs(b.readInt32LE(18)), height: Math.abs(b.readInt32LE(22)) }
  // JPEG: 扫描 SOFn 段
  if (b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
        i += 2
        continue
      }
      const len = b.readUInt16BE(i + 2)
      const isSof = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC
      if (isSof)
        return { type: 'jpg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      i += 2 + len
    }
  }
  return null
}

/** 等比缩放到不超过 maxWidth × maxHeight（只缩小，不放大） */
export function fitImage(width: number, height: number, maxWidth: number, maxHeight: number): { width: number, height: number } {
  if (!(width > 0) || !(height > 0))
    return { width: maxWidth, height: Math.round(maxWidth * 0.6) }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
