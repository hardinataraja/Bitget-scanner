const Watch = {
  has: (s) => Store.watch.includes(s),
  toggle(s) { const i = Store.watch.indexOf(s); if (i >= 0) Store.watch.splice(i, 1); else if (Store.watch.length < 200) Store.watch.push(s); Store.saveW(); },
  toCSV() { return 'symbol\n' + Store.watch.join('\n') + '\n'; },
  // Impor CSV: maks 50KB, hanya simbol valid & (jika data ticker ada) yang aktif.
  fromCSV(text, valid) {
    if (text.length > 50000) throw new Error('File terlalu besar (maks 50KB)');
    let add = 0, skip = 0;
    for (const line of text.split(/\r?\n/).slice(0, 1000)) {
      const s = line.split(',')[0].trim().replace(/^"|"$/g, '').toUpperCase();
      if (!s || s === 'SYMBOL') continue;
      if (!/^[A-Z0-9]{2,20}USDT$/.test(s) || (valid && !valid.has(s))) { skip++; continue; }
      if (!Store.watch.includes(s) && Store.watch.length < 200) { Store.watch.push(s); add++; }
    }
    Store.saveW();
    return { add, skip };
  }
};
