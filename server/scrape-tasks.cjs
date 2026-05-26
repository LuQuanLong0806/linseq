const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox','--disable-gpu','--start-maximized'],
    defaultViewport: null
  });
  const page = await browser.newPage();

  // 1. 登录
  console.log('1. Logging in...');
  await page.goto('http://10.0.12.119:8868/demo/account/login.htm', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#userName', { timeout: 10000 });
  await page.click('#userName', { clickCount: 3 });
  await page.type('#userName', 'luql', { delay: 30 });
  await page.click('#userPwd', { clickCount: 3 });
  await page.type('#userPwd', '123', { delay: 30 });

  // Use Promise.race: either navigation or just wait
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => console.log('   Nav timeout, continuing...')),
    page.click('.loginBtn')
  ]);
  
  const currentUrl = page.url();
  console.log('   URL after login:', currentUrl);
  
  // Wait for page to settle regardless
  await new Promise(r => setTimeout(r, 3000));
  console.log('   Final URL:', page.url());

  // 2. 拿全量待办
  console.log('\n2. Fetching daiban tasks...');
  const result = await page.evaluate(async () => {
    try {
      const resp = await fetch('/demo/tasklist/getTasklistList.action?pageIndex=0&pageSize=500&filterDaiban=true&guanbi=0', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const text = await resp.text();
      try { return JSON.parse(text); } catch(e) { return { error: true, body: text.substring(0, 300) }; }
    } catch(e) { return { error: true, msg: e.message }; }
  });

  if (result.error) {
    console.log('   ERROR:', result.body || result.msg);
  } else {
    console.log('   Total:', result.total, '  sumData:', result.sumData?.length);
    if (result.sumData?.length > 0) {
      console.log('\n=== First Task ALL Fields ===');
      const first = result.sumData[0];
      for (const [k, v] of Object.entries(first)) {
        console.log('  ' + k + ': ' + JSON.stringify(v));
      }
      console.log('\n  Keys (' + Object.keys(first).length + '):', Object.keys(first).join(', '));
      console.log('\n=== All Tasks Summary ===');
      result.sumData.forEach((t, i) => {
        console.log((i+1) + '. [' + t.danjuCode + '] ' + (t.rwzj||'').substring(0,70) + ' | node=' + t.NEXTNODENAME + ' | khmc=' + t.khmc + ' | jibie=' + t.jibie + ' | bugOrXuqiu=' + t.bugOrXuqiu + ' | jhrq=' + t.jhrq);
      });
    }
  }

  // 3. 拿一个任务详情页
  if (result.sumData?.length > 0) {
    const sampleTask = result.sumData[0];
    console.log('\n3. Fetching task detail for:', sampleTask.id);
    const detail = await page.evaluate(async (taskId) => {
      try {
        const resp = await fetch('/demo/tasklist/getTasklistDetail.action?id=' + taskId, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const text = await resp.text();
        try { return JSON.parse(text); } catch(e) { return { error: true, body: text.substring(0, 500) }; }
      } catch(e) { return { error: true, msg: e.message }; }
    }, sampleTask.id);
    console.log('   Detail result:', JSON.stringify(detail, null, 2)?.substring(0, 3000));
  }

  // 4. 点击 daiban_top
  console.log('\n4. Clicking daiban_top...');
  const daibanExists = await page.$('#daiban_top');
  console.log('   #daiban_top exists:', !!daibanExists);
  
  if (daibanExists) {
    await page.click('#daiban_top');
    await new Promise(r => setTimeout(r, 5000));

    const allPages = await browser.pages();
    console.log('   Open pages:', allPages.length);
    for (let i = 0; i < allPages.length; i++) {
      const url = allPages[i].url();
      console.log('   Page ' + i + ':', url);
      if (url !== 'about:blank' && !url.includes('login')) {
        // 这是待办列表页面
        const lp = allPages[i];
        await lp.bringToFront();
        await new Promise(r => setTimeout(r, 2000));
        
        const info = await lp.evaluate(() => {
          const title = document.title;
          const url = location.href;
          
          // MiniUI grids
          const grids = [];
          if (typeof mini !== 'undefined') {
            try {
              const found = mini.findControls(cn => cn.type === 'datagrid');
              found.forEach(g => {
                grids.push({
                  id: g.id,
                  columns: (g.columns || []).map(c => ({ header: c.header || c.headerText, field: c.field, width: c.width, renderer: c.renderer ? 'yes' : 'no' }))
                });
              });
            } catch(e) { grids.push({ error: e.message }); }
          }
          
          // Filter toolbar
          const filters = [];
          document.querySelectorAll('.mini-toolbar .mini-textbox, .mini-toolbar .mini-combobox, .mini-toolbar .mini-datepicker, .mini-toolbar .mini-button').forEach(f => {
            filters.push({ id: f.id, cls: f.className?.substring(0, 40) });
          });
          
          return { title, url, grids, filters };
        });
        
        console.log('   Title:', info.title);
        console.log('   URL:', info.url);
        info.grids.forEach(g => {
          console.log('   Grid:', g.id || g.error);
          (g.columns || []).forEach(c => console.log('     [' + c.field + '] -> ' + c.header + ' (w=' + c.width + ', renderer=' + c.renderer + ')'));
        });
        console.log('   Filters:', info.filters?.length, 'controls');
        info.filters?.forEach(f => console.log('     ', f.id, f.cls));

        await lp.screenshot({ path: 'F:/00_project/LineSequence/server/data/daiban-list-page.png', fullPage: true });
      }
    }
  }

  console.log('\nDone. Keeping browser open 30s...');
  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})();
