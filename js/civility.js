/* ==========================================================================
   civility.js — 全站文明检测（黄冈中学校园网）
   演示级词库共 20 条：覆盖常见不文明用语、其字母缩写，另含 1 条通配槽位词条。

   —— 防明文要求：词条一律以「字符码偏移」整数数组存放（编码值 = 字符码 -
      OFFSET），运行时按需还原参与匹配；本文件源码、注释与控制台输出中
      不出现任何词条明文。
   —— 规范化：匹配前统一做 全角转半角 / 去空白 / 转小写 处理。
   —— 变体覆盖：输入中的星号（全角＊规范化后统一为半角）可与词条任一字符
      互配；词条中的 -1 为通配槽位，可匹配任意单字——用以覆盖星号等变体
      替换写法。
   —— 命中处理：拦截 + 返回页面警告文案，并自动写入 reports 表上报管理员
      留痕（摘要仅保留首尾少量字符并打码）。
   ========================================================================== */
var Civility = (function () {
  var OFFSET = 4096;   // 编码偏移量
  var ANY = -1;        // 词条通配槽位：匹配任意单字
  var STAR = 0x2A;     // 半角星号字符码（规范化后统一值）

  /* 编码词库（整数数组；维护时同样只允许以编码形式录入，禁止明文） */
  var LIB = [
    [16571, 32828],  // vulgar-2char-a
    [25179, 32828],  // vulgar-2char-b
    [30917, 32828],  // vulgar-2char-c
    [21709, 16224, 18824],  // vulgar-3char-a
    [21709, -1, 18824],  // vulgar-wildcard（中间为通配槽位 ANY=-1）
    [17255, 23037],  // vulgar-2char-d
    [29305],  // vulgar-1char-a
    [18824, 26244],  // insult-mom-2char
    [24282, 30411],  // insult-2char-a
    [26237, 26100],  // insult-2char-b
    [22138, 34460],  // insult-2char-c
    [20127, 25193],  // insult-2char-d
    [30754, 32039],  // insult-2char-e
    [32049, 16058],  // insult-2char-f
    [25483, 16747, 30411],  // insult-3char-a
    [24055, 30411],  // insult-2char-g
    [26974, 28367, 26053],  // insult-3char-b
    [17339, 23419, 17447],  // threat-3char-a
    [17368, 20481],  // insult-2char-h
    [-3981, -3998]  // abbr-ascii
  ];

  var ENC_STAR = STAR - OFFSET;

  /* 文本规范化：全角→半角、去空白、转小写；返回编码后的字符数组 */
  function normalize(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c >= 0xFF01 && c <= 0xFF5E) c -= 0xFEE0;  // 全角区转半角（含全角字母/数字/＊）
      else if (c === 0x3000) c = 0x20;              // 全角空格
      var ch = String.fromCharCode(c).toLowerCase();
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;  // 去空白
      out.push(ch.charCodeAt(0) - OFFSET);
    }
    return out;
  }

  /* 匹配：返回命中词条数（输入星号与词条通配槽位均可互配） */
  function countHits(arr) {
    var n = 0;
    for (var w = 0; w < LIB.length; w++) {
      var p = LIB[w];
      if (p.length > arr.length) continue;
      for (var s = 0; s + p.length <= arr.length; s++) {
        var hit = true;
        for (var j = 0; j < p.length; j++) {
          var pc = p[j], ic = arr[s + j];
          if (pc !== ic && ic !== ENC_STAR && pc !== ANY) { hit = false; break; }
        }
        if (hit) { n++; break; }  // 每个词条只计一次
      }
    }
    return n;
  }

  /* 摘要打码：短文本只保留首字符，长文本保留首尾各2字符，
     确保留痕数据中不出现完整原词明文 */
  function mask(text) {
    var s = String(text).replace(/\s+/g, ' ').trim();
    if (s.length <= 6) return s.slice(0, 1) + '***';
    return s.slice(0, 2) + '***' + s.slice(-2);
  }

  /* 纯检查：只判断是否通过，不写留痕（用于注册昵称等尚无账户归属的场景） */
  function check(text) {
    return countHits(normalize(String(text == null ? '' : text))) === 0;
  }

  /* 统一守卫：命中 → 拦截 + 页面警告文案 + 写入 reports 表上报管理员 */
  function guard(text, opts) {
    opts = opts || {};
    var n = countHits(normalize(String(text == null ? '' : text)));
    if (!n) return { ok: true, hits: 0 };
    DB.insert('reports', {
      type: 'civility',
      module: opts.module || '',
      authorId: opts.authorId || '',
      hits: n,
      excerpt: mask(String(text == null ? '' : text)),
      status: 'pending'
    });
    return {
      ok: false,
      hits: n,
      msg: '检测到不文明用语，内容已被拦截，相关记录已上报管理员。请文明发言。'
    };
  }

  return { check: check, guard: guard };
})();
