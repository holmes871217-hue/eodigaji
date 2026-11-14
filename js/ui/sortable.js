// 목록을 손가락(또는 마우스)으로 끌어서 순서를 바꾸는 동작.
// 줄 안의 손잡이([data-drag])를 잡고 위아래로 끌면 다른 줄이 자리를 비켜 주고, 놓으면 onReorder(from, to)를 부른다.
// 손잡이에 초점을 두고 키보드 위·아래 화살표를 눌러도 한 칸씩 옮길 수 있다.

const EDGE = 90; // 화면 위아래 끝에서 이만큼 안으로 들어오면 목록을 저절로 스크롤한다

/**
 * @param {HTMLElement} list 줄(li)들을 바로 아래에 가진 목록
 * @param {{ onReorder: (from: number, to: number) => void }} opts
 */
export function attachSortable(list, { onReorder }) {
  list.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.closest('[data-drag]');
    if (!handle || !list.contains(handle) || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const item = handle.closest('li');
    const items = [...list.children];
    const from = items.indexOf(item);
    if (from < 0) return;
    ev.preventDefault();

    // 끌기 시작한 순간의 각 줄 위치(문서 기준). 끄는 동안에는 이 값으로만 계산한다.
    const tops = items.map((el) => el.getBoundingClientRect().top + window.scrollY);
    const heights = items.map((el) => el.offsetHeight);
    const gap = items.length > 1 ? tops[1] - (tops[0] + heights[0]) : 0;
    const startY = ev.clientY + window.scrollY;
    let lastClientY = ev.clientY;
    let to = from;
    let raf = 0;

    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* 잡지 못해도 동작한다 */ }
    item.classList.add('is-dragging');
    list.classList.add('is-sorting');

    const place = () => {
      const dy = lastClientY + window.scrollY - startY;
      item.style.transform = `translateY(${dy}px)`;
      const center = tops[from] + heights[from] / 2 + dy;
      // 새 자리 = 끄는 줄의 가운데보다 위에 가운데가 있는 다른 줄의 수
      to = 0;
      items.forEach((el, i) => { if (i !== from && tops[i] + heights[i] / 2 < center) to++; });
      const step = heights[from] + gap;
      items.forEach((el, i) => {
        if (i === from) return;
        const shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    // 손가락이 화면 끝 가까이에 있으면 계속 스크롤한다.
    const tick = () => {
      const h = window.innerHeight;
      const speed = lastClientY < EDGE ? -Math.ceil((EDGE - lastClientY) / 6) : lastClientY > h - EDGE ? Math.ceil((lastClientY - (h - EDGE)) / 6) : 0;
      if (speed) { window.scrollBy(0, speed); place(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e) => {
      if (e.pointerId !== ev.pointerId) return;
      lastClientY = e.clientY;
      place();
    };
    const finish = (commit) => {
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      item.classList.remove('is-dragging');
      list.classList.remove('is-sorting');
      items.forEach((el) => { el.style.transform = ''; });
      if (commit && to !== from) onReorder(from, to);
    };
    const onUp = (e) => { if (e.pointerId === ev.pointerId) finish(true); };
    const onCancel = (e) => { if (e.pointerId === ev.pointerId) finish(false); };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  });

  list.addEventListener('keydown', (ev) => {
    const handle = ev.target.closest?.('[data-drag]');
    if (!handle || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    const from = [...list.children].indexOf(handle.closest('li'));
    const to = from + (ev.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= list.children.length) return;
    ev.preventDefault();
    onReorder(from, to);
  });
}
