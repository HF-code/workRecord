/**
 * 在新标签页打开链接（模拟用户点击 `<a target="_blank">`）。
 *
 * 问题背景：Chrome / Edge 等浏览器的弹窗拦截策略对**一次用户手势只放行第一个
 * `window.open()`**，同一点击里后续调用会被静默拦截——表现为"点了批量提交MR
 * 却只打开一个页面"。而 `<a target="_blank">` 的点击属于用户主动导航，不受
 * 弹窗拦截器限制，一次手势内可全部打开。
 *
 * 因此批量打开链接统一走本工具（动态创建隐藏 `<a>` 并触发 click），替代
 * 循环 `window.open`。需在用户交互事件（如 onClick）的同步调用栈内执行。
 *
 * @param url 要打开的链接
 */
export function openInNewTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  // 与 window.open(url, '_blank', 'noreferrer') 等价的安全语义：断开 opener，防反向钓鱼
  a.rel = 'noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
