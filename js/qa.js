/* ==========================================================================
   qa.js — 你问我答（黄冈中学校园网）
   学生提问（年级 / 学科 / 教学或非教学 分类）；所有人可回答；
   非学生账户（老师/领导/学生会/管理员）的回复自动置顶；所有人可见。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('qa');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var sortMode = 'new';
  var curGrade = 'all';

  var GRADES = ['丘班', '高一', '高二', '高三'];
  var SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '信息技术', '其他'];
  window.QA_SORT_PIN = true;   /* 联调口径：非学生回复置顶 */

  /* ---- 提问表单（学生） ---- */
  var composer = document.getElementById('composer');
  var subWrap = document.getElementById('subWrap');
  if (Perm.can(me.role, 'qa.ask')) {
    composer.hidden = false;
    document.getElementById('qType').addEventListener('change', function () {
      subWrap.hidden = this.value !== 'teach';
    });
    document.getElementById('qGrade').innerHTML = GRADES.map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
    document.getElementById('qSubject').innerHTML = SUBJECTS.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');

    document.getElementById('btnPost').addEventListener('click', function () {
      var title = document.getElementById('qTitle').value.trim();
      var text = document.getElementById('qInput').value.trim();
      if (!title || !text) { alert('请填写问题标题与说明。'); return; }
      var g = Civility.guard(title + '\n' + text, { module: 'qa', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      var att = ChatUI.take(composer);   /* QQ 对标：图片 + 附件随帖发布（向后兼容增量） */
      if (!DB.insert('posts', {
        module: 'qa', authorId: me.id, title: title, content: text,
        images: att.images, files: att.files,
        grade: document.getElementById('qGrade').value,
        qType: document.getElementById('qType').value,
        subject: document.getElementById('qType').value === 'teach' ? document.getElementById('qSubject').value : '',
        likes: [], views: 0, shares: 0
      })) { alert('发布失败：浏览器存储空间可能已满。'); return; }
      document.getElementById('qTitle').value = '';
      document.getElementById('qInput').value = '';
      render();
    });
  } else {
    document.getElementById('composerTip').textContent = '提问仅限学生账户；所有人都可以在问题下回答。';
  }

  /* ---- 年级筛选 ---- */
  var tabs = document.getElementById('gradeTabs');
  tabs.innerHTML = ['all'].concat(GRADES).map(function (g) {
    return '<button type="button" class="fbtn' + (g === curGrade ? ' on' : '') + '" data-grade="' + g + '">' + (g === 'all' ? '全部年级' : g) + '</button>';
  }).join('');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-grade]') : null;
    if (!b) return;
    curGrade = b.getAttribute('data-grade');
    tabs.querySelectorAll('.fbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
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

  function chips(p) {
    var h = '<span class="chip chip-cat">🎓 ' + p.grade + '</span>' +
            '<span class="chip">' + (p.qType === 'teach' ? '教学类' : '非教学类') + '</span>';
    if (p.subject) h += '<span class="chip">📖 ' + Common.esc(p.subject) + '</span>';
    return h;
  }

  function render() {
    var rows = DB.find('posts', function (p) { return p.module === 'qa'; });
    if (curGrade !== 'all') rows = rows.filter(function (p) { return p.grade === curGrade; });
    rows = PostUI.sortPosts(rows, sortMode);
    PostUI.render(list, rows, {
      comments: true, qaPin: true, chips: chips,
      empty: '还没有提问，点击上方「我要提问」发起第一个问题吧。',
      rerender: render
    });
  }

  render();
})();
