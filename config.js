/* ==========================================================================
   config.js — 云数据库配置模板（黄冈中学校园网）
   作用：决定全站数据存到哪里。本文件不含任何真实密钥；接入云端时把控制台
        取到的密钥填入对应引号内即可，页面代码零改动。

   三种模式（provider 三选一，填入引号内）：
   ① ''（留空，默认）—— 本地回退模式：
        数据仅存于当前浏览器（localStorage），双击 index.html 即可运行；
        未注册/未填密钥时自动走此模式，界面会注明「演示数据存本地浏览器」。
   ② 'leancloud' —— 云端模式（主推）：
        LeanCloud 国际版免费开发版（免备案），数据存云端、全校互通、所有人可见。
        获取三件套：https://console.leancloud.app 注册 → 创建应用 →
        「设置 → 应用凭证」页查看 AppID / AppKey，API 访问地址在「应用概览」页
        （形如 https://xxxx.lc-cn-n1-shared.com）。
        注意：还需在「设置 → 安全中心 → Web 安全域名」加入你的网站域名
        （本地调试加 http://localhost，GitHub Pages 加 https://用户名.github.io）。
        并按《部署指南》在存储服务中创建 hgzx_ 前缀的 7 个 Class（或允许客户端建类）。
   ③ 'supabase' —— 云端模式（备选）：
        Supabase 免费版（REST 接入）。获取方式：
        https://supabase.com 注册 → New project → Project Settings → API：
        Project URL 填 url，anon public key 填 anonKey；
        并按《部署指南》用 SQL 编辑器创建 hgzx_ 前缀的数据表。

   硬性口径：无论哪种模式，密码均只存哈希（SHA-256），不落明文；
   v1.5 起不再采集身份证号（云端历史 idcard 列留空，无需迁移）。
   ========================================================================== */
window.HGZX_CONFIG = {
  /* 存储模式：'' = 本地回退（默认） / 'leancloud' = LeanCloud 云端 / 'supabase' = Supabase 云端 */
  provider: 'supabase',

  /* LeanCloud 国际版凭证（provider 为 'leancloud' 时必填，从控制台「应用凭证」页复制） */
  leancloud: {
    appId: '',        // AppID
    appKey: '',       // AppKey（客户端密钥，配合 Web 安全域名使用，不等于 MasterKey）
    serverUrl: ''     // API 访问地址，形如 https://xxxx.lc-cn-n1-shared.com
  },

  /* Supabase 凭证（provider 为 'supabase' 时必填，从 Project Settings → API 复制） */
  supabase: {
    url: 'https://tlgybcyxxvjscvijhfsk.supabase.co',   // Project URL，形如 https://xxxx.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZ3liY3l4eHZqc2N2aWpoZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzc0NDEsImV4cCI6MjEwNTMxMzQ0MX0.u4SrkC_VgUPtJTLhQzOua6PjzKDWZHKNjqCmBQpujuU'       // anon public key（公开匿名密钥）
  }
};
