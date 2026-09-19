/* ==========================================================================
   violation.js — 网站违规通报（黄冈中学校园网）
   ① 通报公示：管理员/学生会发布公示帖，所有人可见；
   ② 上报记录（仅教职工可见）：汇总 全站文明检测命中 / 帖子与消息一键上报 /
      账户上报 等留痕（reports 表），学生会与管理员可「公示为通报」或「忽略」，
      数据来源即上报与警告记录。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('violation');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var tab = 'pub';   /* pub=通报公示  rep=上报记录 */
  var TYPE_LABELS = { civility: '文明检测命中', post: '帖子上报', chat: '闲聊消息上报', account: '账户上报' };
  var STATUS_LABELS = { pending: '待处理', published: '已公示', dismissed: '已忽略', handled: '已处理' };

  /* ---- Tab 切换 ---- */
  var tabs = document.getElementById('vioTabs');
  function drawTabs() {
    var h =
      '<button type="button" class="fbtn' + (tab === 'pub' ? ' on' : '') + '" data-tab="pub">通报公示</button>';
    if (Perm.can(me.role, 'viewAll')) {
      h += '<button type="button" class="fbtn' + (tab === 'rep' ? ' on' : '') + '" data-tab="rep">上报记录（教职工）</button>';
    }
    tabs.innerHTML = h;
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (!b) return;
    tab = b.getAttribute('data-tab');
    drawTabs();
    render();
  });

  /* ---- 手动发布通报（管理员/学生会） ---- */
  var composer = document.getElementById('composer');
  if (Perm.can(me.role, 'violation.publish')) {
    composer.hidden = false;
    document.getElementById('btnPost').addEventListener('click', function () {
      var title = document.getElementById('vTitle').value.trim();
      var text = document.getElementById('vInput').value.trim();
      if (!title || !text) { alert('请填写通报标题与内容。'); return; }
      var g = Civility.guard(title + '\n' + text, { module: 'violation', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      if (!DB.insert('posts', { module: 'violation', authorId: me.id, title: title, content: text, likes: [], views: 0, shares: 0 })) {
        alert('发布失败：浏览器存储空间可能已满。'); return;
      }
      document.getElementById('vTitle').value = '';
      document.getElementById('vInput').value = '';
      tab = 'pub'; drawTabs(); render();
    });
  }

  /* ---- 上报记录操作 ---- */
  list.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var rid = btn.getAttribute('data-rid');
    var r = DB.findOne('reports', function (x) { return x.id === rid; });
    if (!r) return;

    if (btn.getAttribute('data-act') === 'pub') {
      if (!Perm.can(me.role, 'violation.publish')) return;
      if (!confirm('确定把该记录公示为违规通报吗？（公示后所有人可见）')) return;
      var label = TYPE_LABELS[r.type] || '违规上报';
      var detail = '违规类型：' + label + '\n发生模块：' + (r.module ? Common.moduleName(r.module) : '—') +
        '\n记录摘要：' + (r.excerpt || r.reason || '（无补充说明）') +
        '\n记录时间：' + Common.fmtTime(r.createdAt) +
        '\n处理说明：经核实，已按校园网文明公约处理。';
      DB.insert('posts', {
        module: 'violation', authorId: me.id, title: '【违规通报】' + label,
        content: detail, likes: [], views: 0, shares: 0, reportId: r.id
      });
      DB.update('reports', rid, { status: 'published' });
      render();
    } else if (btn.getAttribute('data-act') === 'ignore') {
      if (!Perm.can(me.role, 'violation.publish')) return;
      DB.update('reports', rid, { status: 'dismissed' });
      render();
    }
  });

  function repHtml(r) {
    var reporter = DB.findOne('users', function (u) { return u.id === r.reporterId; });
    var st = STATUS_LABELS[r.status] || r.status;
    var body = r.excerpt || r.reason || '';
    var canPub = Perm.can(me.role, 'violation.publish');
    return '<article class="post card rep-item">' +
      '<div class="p-head"><span class="chip chip-cat">' + (TYPE_LABELS[r.type] || '违规上报') + '</span>' +
        '<span class="chip">' + (r.module ? Common.esc(Common.moduleName(r.module)) : '全站') + '</span>' +
        '<span class="chip chip-' + (r.status === 'pending' ? 'unread' : 'vis') + '">' + st + '</span>' +
        '<time>' + Common.fmtTime(r.createdAt) + '</time></div>' +
      '<div class="p-content">' + Common.esc(body || '（无补充说明）') + '</div>' +
      '<div class="p-meta">上报人：' + Common.esc(reporter ? (reporter.nickname || reporter.name) : '系统检测') +
        ' · 命中/理由已按留痕口径脱敏显示</div>' +
      (canPub && r.status === 'pending'
        ? '<div class="p-actions"><button type="button" class="pact" data-act="pub" data-rid="' + r.id + '">📋 公示为通报</button>' +
          '<button type="button" class="pact pact-danger" data-act="ignore" data-rid="' + r.id + '">忽略</button></div>'
        : '') +
      '</article>';
  }

  function render() {
    if (tab === 'rep') {
      if (!Perm.can(me.role, 'viewAll')) { tab = 'pub'; drawTabs(); render(); return; }
      var rows = DB.list('reports').sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      list.innerHTML = rows.length
        ? rows.map(repHtml).join('')
        : '<div class="card empty-card">暂无上报与警告记录。</div>';
      return;
    }
    var posts = PostUI.sortPosts(
      DB.find('posts', function (p) { return p.module === 'violation'; }), 'new');
    PostUI.render(list, posts, {
      comments: false,
      empty: '暂无违规通报公示。',
      rerender: render
    });
  }

  drawTabs();
  render();
})();
