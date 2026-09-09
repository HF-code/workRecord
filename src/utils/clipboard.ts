/**
 * 跨浏览器复制文本工具。
 *
 * 问题背景：浏览器仅在「安全上下文」（https:// 或 localhost/127.0.0.1）下才提供
 * `navigator.clipboard`。通过局域网 IP（如 http://192.168.x.x:5173）以 HTTP 访问时，
 * `navigator.clipboard` 为 undefined，直接调用会抛错导致复制失败。
 *
 * 因此本工具优先用异步剪贴板 API，不可用时降级到临时 textarea + execCommand('copy')，
 * 保证 HTTP 局域网环境也能复制。
 *
 * @param text 要复制的文本
 * @returns 是否复制成功
 */
export async function copyText(text: string): Promise<boolean> {
  // 1) 优先：异步剪贴板 API（安全上下文内）
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 部分浏览器在失焦/非用户手势下会拒绝，落到降级方案
    }
  }

  // 2) 降级：临时 textarea + execCommand（兼容 HTTP / 非安全上下文）
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // 避免页面滚动跳动 & 避免被遮挡不可见导致复制失败
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
