/**
 * 在新标签页打开链接（一次用户手势内可打开多个）。
 *
 * 为什么**不用 `window.open`**（这是曾经的 bug 根因）：
 * 浏览器弹窗拦截器对「一次用户手势」只放行一个 `window.open`，**先调用它会把这次手势的配额吃掉**，
 * 导致后续链接（无论用哪种方式）都打不开——表现就是"点了批量提交 MR 却只打开一个"。
 * 而「程序化点击 `<a target="_blank">`」属于元素发起的导航，不受该配额限制，可在一个手势内全部打开。
 *
 * 另外两个必须避开的坑（否则锚点方案也会静默失败）：
 * 1. 不要用 `display: none`——部分内核不把不可见元素视为用户导航；改用透明定位；
 * 2. 不要在 `click()` 之后**同步**移除节点——部分内核会因此中止尚未开始的导航；
 *    改为在下一个宏任务移除（移除前用模块级 Set 强引用，防被 GC 提前回收）。
 *
 * 由此带来的取舍：锚点路径**无法回传"是否真的打开了"**（没有句柄可判断），
 * 所以本模块只负责"尽力全部发起"，是否真的弹出 N 个由调用方在文案中如实说明。
 */

/** 兜底锚点的强引用：从创建到移除之间一直持有，防止被 GC 提前回收导致导航中断 */
const pendingAnchors = new Set<HTMLAnchorElement>();

/** 用透明锚点模拟一次用户点击（同步发起导航） */
function clickAnchor(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.style.position = 'fixed';
  a.style.top = '0';
  a.style.left = '0';
  a.style.width = '1px';
  a.style.height = '1px';
  a.style.opacity = '0';
  a.style.pointerEvents = 'none';
  document.body.appendChild(a);
  pendingAnchors.add(a);
  a.click();
  setTimeout(() => {
    pendingAnchors.delete(a);
    a.remove();
  }, 0);
}

/**
 * 在新标签页打开单个链接（尽力发起；需在用户交互事件的同步调用栈内）。
 * @param url 要打开的链接
 */
export function openInNewTab(url: string): void {
  clickAnchor(url);
}

/**
 * 逐个在新标签页打开多个链接（须在用户手势的同步调用栈内调用，不要 await / 不要放进 setTimeout）。
 * @param urls 要打开的链接列表
 */
export function openManyTabs(urls: string[]): void {
  for (const url of urls) window.open(url, '_blank');
  // for (const url of urls) clickAnchor(url);
}
