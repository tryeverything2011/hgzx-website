/* ==========================================================================
   rant.js — 我想吐槽（黄冈中学校园网）
   校园问题分类归档（食堂/宿舍/教学/安全/后勤/其他），
   按类别推送给对应需知角色（如食堂类 → 领导/管理员）；
   教职工侧提供「需我关注」视图。通用操作走 PostUI。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('rant');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var sortMode = 'new';
  var curCat = 'all';

  /* ---- 分类与推送口径 ---- */
  var CATS = [
    { key: 'canteen',  name: '食堂餐饮', notify: ['leader', 'admin'] },
    { key: 'dorm',     name: '宿舍住宿', notify: ['leader', 'admin'] },
    { key: 'teach',    name: '教学学习', notify: ['leader', 'teacher'] },
    { key: 'safety',   name: '校园安全', notify: ['leader', 'admin', 'union'] },
    { key: 'logistics',name: '后勤设施', notify: ['leader', 'admin'] },
    { key: 'other',    name: '其他',     notify: ['leader', 'admin'] }
  ];
  function catOf(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return CATS[CATS.length - 1];
  }
  function pushLabel(cat) {
    return '推送：' + cat.notify.map(function (r) { return Common.roleLabel(r); }).join('、');
  }
  window.RANT_CATS = CATS;   /* 供联调测试核对口径 */

  /* ---- 分类切换条（教职工多一个「需我关注」） ---- */
  var tabs = document.getElementById('catTabs');
  function drawTabs() {
    var h = '<button type="button" class="fbtn' + (curCat === 'all' ? ' on' : '') + '" data-cat="all">全部</button>';
    for (var i = 0; i < CATS.length; i++) {
      h += '<button type="button" class="fbtn' + (curCat === CATS[i].key ? ' on' : '') + '" data-cat="' + CATS[i].key + '">' + CATS[i].name + '</button>';
    }
    if (Perm.can(me.role, 'viewAll')) {
      h += '<button type="button" class="fbtn fbtn-notice' + (curCat === 'mine' ? ' on' : '') + '" data-cat="mine">🔥 需我关注</button>';
    }
    tabs.innerHTML = h;
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-cat]') : null;
    if (!b) return;
    curCat = b.getAttribute('data-cat');
    drawTabs();
    render();
  });

  /* ---- 排序切换 ---- */
  var sortBar = document.getElementById('sortBar');
  sortBar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!b) return;
    sortMode = b.getAttribute('data-sort');
    sortBar.querySelectorAll('.fbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
    render();
  });

  /* ---- 发帖：分类 + 标题 + 内容，先过文明检测（所有角色均可吐槽） ---- */
  var composer = document.getElementById('composer');
  composer.hidden = false;
  document.getElementById('composerTip').textContent =
    '吐槽将按分类归档，并推送给对应需知的老师/领导/学生会/管理员。';
  var catSel = document.getElementById('rantCat');
  catSel.innerHTML = CATS.map(function (c) { return '<option value="' + c.key + '">' + c.name + '</option>'; }).join('');
  document.getElementById('btnPost').addEventListener('click', function () {
    var title = document.getElementById('rantTitle').value.trim();
    var text = document.getElementById('rantInput').value.trim();
    if (!text) { alert('写下要反映的问题再发布吧。'); return; }
    var g = Civility.guard(title + '\n' + text, { module: 'rant', authorId: me.id });
    if (!g.ok) { alert(g.msg); return; }
    var att = ChatUI.take(composer);   /* QQ 对标：图片 + 附件随帖发布（向后兼容增量） */
    if (!DB.insert('posts', {
      module: 'rant', authorId: me.id, cat: catSel.value,
      title: title, content: text, images: att.images, files: att.files,
      likes: [], views: 0, shares: 0
    })) { alert('发布失败：浏览器存储空间可能已满。'); return; }
    document.getElementById('rantTitle').value = '';
    document.getElementById('rantInput').value = '';
    render();
  });

  /* ---- 列表 ---- */
  function chips(p) {
    var c = catOf(p.cat);
    return '<span class="chip chip-cat">📂 ' + c.name + '</span>' +
           '<span class="chip chip-push">📨 ' + pushLabel(c) + '</span>';
  }

  function render() {
    var rows = DB.find('posts', function (p) { return p.module === 'rant'; });
    if (curCat === 'mine') {
      rows = rows.filter(function (p) { return catOf(p.cat).notify.indexOf(me.role) >= 0; });
    } else if (curCat !== 'all') {
      rows = rows.filter(function (p) { return p.cat === curCat; });
    }
    rows = PostUI.sortPosts(rows, sortMode);
    PostUI.render(list, rows, {
      comments: false, chips: chips, empty: '该分类下暂无吐槽内容。',
      rerender: render
    });
  }

  drawTabs();
  render();
})();
