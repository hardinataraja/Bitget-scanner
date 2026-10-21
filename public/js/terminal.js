/* Panel terminal: log NYATA dari proses scan (bukan animasi palsu). Baris baru muncul dengan efek ketik; baris diperbarui inkremental. */
const Term = {
  lines: [], total: 0, drawnTotal: 0, max: 120, el: null, raf: false, status: 'booting', prog: null,
  push(x, c = '') {
    const t = new Date().toLocaleTimeString('id-ID', { hour12: false });
    this.lines.push({ t, x: String(x), c }); this.total++;
    if (this.lines.length > this.max) this.lines.shift();
    this.sched();
  },
  setStatus(s, prog) { this.status = s; this.prog = prog || null; this.sched(); },
  sched() { if (this.raf) return; this.raf = true; requestAnimationFrame(() => { this.raf = false; this.paint(); }); },
  mount() {
    const el = document.getElementById('term'); if (!el) { this.el = null; return; }
    if (el !== this.el) { this.el = el; this.drawnTotal = this.total - this.lines.length; this.fresh = true; }
    this.paint();
  },
  paint() {
    const el = this.el; if (!el || !document.contains(el)) return;
    const body = el.querySelector('.tbody'), st = el.querySelector('.tstat'), calm = document.body.classList.contains('reduced');
    if (this.fresh) { body.innerHTML = ''; }
    const near = body.scrollHeight - body.scrollTop - body.clientHeight < 40 || this.fresh;
    const start = Math.max(0, this.drawnTotal - (this.total - this.lines.length));
    for (let i = start; i < this.lines.length; i++) {
      const l = this.lines[i], d = document.createElement('div');
      d.className = 'tl ' + l.c + (this.fresh || calm ? '' : ' new'); d.textContent = '[' + l.t + '] ' + l.x; body.appendChild(d);
    }
    while (body.children.length > this.lines.length) body.removeChild(body.firstChild);
    this.drawnTotal = this.total; this.fresh = false;
    const p = this.prog, bar = p && p[1] ? ' [' + '#'.repeat(Math.round(p[0] / p[1] * 12)) + '-'.repeat(12 - Math.round(p[0] / p[1] * 12)) + '] ' + p[0] + '/' + p[1] : '';
    st.textContent = 'root@bitget-scanner:~$ ' + this.status + bar + ' ';
    const cur = document.createElement('span'); cur.className = 'cur'; st.appendChild(cur);
    if (near) body.scrollTop = body.scrollHeight;
  }
};
