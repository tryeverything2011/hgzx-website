/* ==========================================================================
   home.js — 首页逻辑：渲染导航/页脚、10 大模块入口卡片、
   重要通知滚动位、热门内容位（数据一律经 DB 接口读取）
   ========================================================================== */
(function () {
  Common.nav();
  Common.footer();

  /* ---- 表白墙可见性（需求 v1.4）：入口仅学生/管理员可见，其余角色完全隐藏 ---- */
  var me = (typeof Auth !== 'undefined') ? Auth.currentUser() : null;
  var wallVisible = !!me && (me.role === 'student' || me.role === 'admin');

  /* ---- 10 大模块入口卡片 ---- */
  var grid = document.getElementById('moduleGrid');
  var cards = [];
  for (var i = 0; i < Common.MODULES.length; i++) {
    var m = Common.MODULES[i];
    if (m.key === 'wall' && !wallVisible) continue;   // 老师/领导/学生会/游客不渲染该入口
    cards.push(
      '<a class="module-card" href="' + m.href + '">' +
        '<span class="m-icon">' + m.icon + '</span>' +
        '<span class="m-name">' + Common.esc(m.name) + '</span>' +
        '<span class="m-desc">' + Common.esc(m.desc) + '</span>' +
      '</a>'
    );
  }
  grid.innerHTML = cards.join('');

  /* ---- 重要通知滚动位（列表复制一份实现无缝滚动，CSS 悬停暂停） ---- */
  var notices = DB.find('posts', function (p) { return p.module === 'notice'; })
    .sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0);
    })
    .slice(0, 5);
  var lis = [];
  for (var j = 0; j < notices.length; j++) {
    lis.push('<li><a href="pages/notice.html">' + Common.esc(notices[j].title || '通知') +
      '</a><time>' + Common.fmtTime(notices[j].createdAt) + '</time></li>');
  }
  if (!lis.length) lis.push('<li><span>暂无通知，正式通知将在「重要通知」模块发布。</span></li>');
  document.getElementById('noticeList').innerHTML = lis.join('') + lis.join('');

  /* ---- 热门内容位（热度评选见 common.js hotTop，取 Top5） ---- */
  var hot = Common.hotTop(5);
  if (!wallVisible) {
    /* 需求 v1.4：无表白墙查看权的角色，热门位同步剔除表白墙帖子，首页不外显其内容 */
    var tmp = [];
    for (var h = 0; h < hot.length; h++) {
      if (hot[h].module !== 'wall') tmp.push(hot[h]);
    }
    hot = tmp;
  }
  var box = document.getElementById('hotList');
  if (!hot.length) {
    box.innerHTML = '<div class="card">暂无热门内容，去各模块发帖互动吧。</div>';
    return;
  }
  var html = '';
  for (var k = 0; k < hot.length; k++) {
    var p = hot[k];
    var rankCls = k === 0 ? 'top1' : (k === 1 ? 'top2' : (k === 2 ? 'top3' : ''));
    var author = DB.findOne('users', function (u) { return u.id === p.authorId; });
    var aName = author ? (author.nickname || author.name) : '示例用户';
    var title = p.title || Common.snippet(p.content, 22);
    html +=
      '<a class="hot-item" href="pages/' + p.module + '.html?pid=' + encodeURIComponent(p.id) + '">' +
        '<div class="hot-top">' +
          '<span class="hot-rank ' + rankCls + '">' + (k + 1) + '</span>' +
          '<span class="module-chip">' + Common.esc(Common.moduleName(p.module)) + '</span>' +
        '</div>' +
        '<div class="hot-title">' + Common.esc(title) + '</div>' +
        '<div class="hot-meta">' +
          '<span>' + Common.esc(aName) + '</span>' +
          '<span>赞 ' + ((p.likes && p.likes.length) || 0) + '</span>' +
          '<span>看过 ' + (p.views || 0) + '</span>' +
        '</div>' +
      '</a>';
  }
  box.innerHTML = html;
})();
