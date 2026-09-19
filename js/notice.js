/* ==========================================================================
   notice.js — 重要通知（黄冈中学校园网）
   领导/学生会发布通知（Perm.can 'notice.publish'），所有人可见；
   进入本页即把当前用户全部通知标记为已读（Common.markNoticesRead），
   未读通过顶部导航 🔔 红点提醒；卡片上对进入前未读的通知显示「未读」角标。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('notice');

  var me = Auth.currentUser();
  var list = document.getElementById('list');

  /* 进入前先取未读集合（用于角标），随后统一标记已读并刷新导航红点 */
  var readMap = DB.get('noticeRead', {})[me.id] || {};
  var wasUnread = {};
  DB.find('posts', function (p) { return p.module === 'notice'; }).forEach(function (p) {
    if (!readMap[p.id]) wasUnread[p.id] = 1;
  });

  /* ---- 发布通知（领导/学生会） ---- */
  var composer = document.getElementById('composer');
  if (Perm.can(me.role, 'notice.publish')) {
    composer.hidden = false;
    document.getElementById('btnPost').addEventListener('click', function () {
      var title = document.getElementById('nTitle').value.trim();
      var text = document.getElementById('nInput').value.trim();
      if (!title || !text) { alert('请填写通知标题与内容。'); return; }
      var g = Civility.guard(title + '\n' + text, { module: 'notice', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      if (!DB.insert('posts', {
        module: 'notice', authorId: me.id, title: title, content: text,
        likes: [], views: 0, shares: 0
      })) { alert('发布失败：浏览器存储空间可能已满。'); return; }
      document.getElementById('nTitle').value = '';
      document.getElementById('nInput').value = '';
      render();
    });
  } else {
    document.getElementById('composerTip').textContent = '通知由领导与学生会发布，全员可见；有新通知时导航栏铃铛会显示红点。';
  }

  function chips(p) {
    return wasUnread[p.id] ? '<span class="chip chip-unread">未读</span>' : '';
  }

  function render() {
    /* 置顶在前，其余按时间倒序 */
    var rows = PostUI.sortPosts(
      DB.find('posts', function (p) { return p.module === 'notice'; }), 'new');
    PostUI.render(list, rows, {
      comments: true, chips: chips,
      empty: '暂无重要通知。',
      rerender: render
    });
    Common.markNoticesRead();   /* 本页即视为全部已读 */
    Common.nav();               /* 刷新导航红点 */
  }

  render();
})();
