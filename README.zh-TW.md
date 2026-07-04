<div align="center">

# 史塔克實驗室 AgentHub

### AI Agent 虛擬開發公司管理平台

基於 [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub) 深度改造，大幅強化跨 Agent 通訊、執行觀測、智慧任務調度，與 Harness 工程紀律機制。

**[快速開始](#快速開始)** · **[這是什麼？](#這是什麼)** · **[更新日誌](#更新日誌)** · **[架構](#架構)**

</div>

[English](README.md) | 繁體中文

---

## 這是什麼？

**AgentHub** 是一個 Electron 桌面應用程式，讓你用 Claude Code 驅動一整支虛擬 AI 開發公司。

想像你是一間一人公司的老闆，底下有 46 位 AI 員工，分屬 9 個部門。每個 Agent 都有自己的角色、技能和工作規範，透過嚴格的指揮鏈執行任務。你下命令，系統自動協調、分工、品質把關，你專注在決策。

### 核心設計理念

- **你是老闆，Agent 是員工** — 只跟 L1（部門主管）說話，L1 往下分派
- **Harness 工程** — Skill 標準化流程、Hook 強制品質門禁、FileWatcher 即時同步
- **跨 Agent 通訊** — Agent 之間可以透過 SendMessage 互傳指令、移交任務
- **可觀測性** — 成本、Token、工具呼叫一覽無遺，14 天趨勢即時追蹤

### 團隊架構（9 部門 / 46 Agent）

```
老闆（你）
├── Product Manager（L1）
│   └── Feedback Synthesizer、Sprint Prioritizer、Trend Researcher
├── Tech Lead（L1）
│   └── Frontend Dev、Backend Architect、AI Engineer、DevOps、Mobile、Prototyper
├── Design Director（L1）
│   └── UI Designer、UX Researcher、Visual Storyteller、Brand Guardian
├── Marketing Lead（L1）
│   └── Content Creator、Growth Hacker、社群媒體（Twitter/IG/TikTok/Reddit）
├── QA Lead（L1）
│   └── Test Writer、API Tester、Performance Benchmarker
├── Project Lead（L1）
│   └── Project Shipper、Studio Producer、Experiment Tracker
├── Operations Lead（L1）
│   └── Company Manager、Analytics、Finance、Legal、Support
└── 特殊角色：Studio Coach、Joker
```

**L2 不能跳過 L1。老闆只對接 L1。就像真正的公司。**

---

## Fork 新增功能

本 Fork 參考 **CrewAI** 和 **Dify** 的設計模式，補齊原版的關鍵缺口：

### 跨 Agent 通訊
- **訊息中心 UI** — 完整收件匣，支援專案 / Agent / 狀態篩選
- **專案隔離** — 訊息按專案隔離，不同專案互不干擾
- **雙系統橋接** — AgentHub SQLite MessageBroker ↔ Claude Code Teams JSON inbox 雙向同步
- **即時推送** — 訊息、任務狀態、投遞確認全部即時推送到 UI

### 智慧任務調度（CrewAI 風格）
- **任務輸出鏈** — Task A 完成 → 輸出自動注入 Task B 的 system prompt（依賴圖驅動）
- **自動解鎖下游任務** — 前置依賴全數完成 → 下游任務自動 `created → assigned`
- **序列執行策略** — 任務沿著依賴 DAG 自動流轉

### 執行觀測（Dify 風格）
- **成本 / Token 儀表板** — Chart.js 互動圖表（折線、甜甜圈、長條圖）
- **Per-Agent / Per-Project 拆解** — 清楚看到錢花在哪裡
- **14 天每日趨勢** — 成本 + Session 數雙軸折線圖
- **摘要統計** — Total Tokens / Tool Calls / Sessions 一覽

### Agent 智慧化
- **自主委派** — System prompt 自動注入同事清單 + SendMessage 指引，Agent 自行判斷何時委派
- **持久記憶** — `agent_memory` 表儲存跨 Session key-value 記憶，spawn 時自動載入
- **Session 輸出持久化** — `result_summary` 自動擷取存檔，供後續任務引用

### 體驗優化
- **任務卡片即時更新** — 修復完整事件鏈（原版完全斷裂）
- **PTY 訊息 debounce** — 批次合併連續寫入，穩定輸出
- **內容大小保護** — 50 KB 上限防止 PTY Buffer 溢位
- **PTY 錯誤處理** — 寫入失敗優雅降級

---

## 架構

```
┌─────────────────────────────────────────┐
│            Vue 3 Renderer               │
│  Views (10) → Components → Stores (9)   │
│         ↕ IPC (contextBridge)           │
├─────────────────────────────────────────┤
│          Electron Main Process          │
│  Services (~18) → IPC Handlers (~14)    │
│         ↕ node-pty / chokidar / sql.js  │
├─────────────────────────────────────────┤
│              系統層                      │
│  Claude Code CLI / 檔案系統 / SQLite    │
└─────────────────────────────────────────┘
```

### 核心服務

| 服務 | 職責 |
|------|------|
| SessionManager | PTY 生命週期、輸出緩衝、自動任務狀態轉換 |
| MessageBroker | 跨 Session 訊息傳遞、自動投遞、JSON inbox 同步 |
| PromptAssembler | System prompt 組裝（依賴輸出 + 記憶 + 同事注入） |
| TaskManager | CRUD、狀態機、依賴圖、自動解鎖 |
| ProjectSync | chokidar → markdown 解析 → DB upsert → eventBus |
| HookManager | 技術棧偵測、stop-validator、pre-commit 品質檢查 |

### 資料流：任務輸出鏈

```
Task A（frontend-dev）完成
  → output_summary 儲存到 DB
  → Task B（test-writer）依賴 A
  → Task B spawn → PromptAssembler 查詢依賴
  → Task A 的輸出注入為「前置任務輸出」段落
  → test-writer 擁有完整的建置脈絡
```

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端 | Vue 3 + TailwindCSS 4 + TypeScript |
| 圖表 | Chart.js + vue-chartjs |
| 狀態管理 | Pinia（9 個 store） |
| 資料庫 | sql.js（WASM SQLite） |
| 終端機 | xterm.js + node-pty |
| AI 引擎 | Claude Code CLI |
| 檔案監控 | chokidar |

---

## 快速開始

### 前置需求

| 必要項目 | 版本 |
|---------|------|
| [Node.js](https://nodejs.org/) | >= 18 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 最新版 |
| [Git](https://git-scm.com/) | >= 2.30 |
| C++ Build Tools | 依平台而定（node-pty 需要） |

```bash
# Windows（管理員 PowerShell）
npm install --global windows-build-tools

# macOS
xcode-select --install

# Linux (Ubuntu/Debian)
sudo apt-get install -y build-essential python3
```

### 安裝與執行

```bash
# Clone
git clone https://github.com/dodo0095/Agent-hub.git
cd Agent-hub

# 安裝相依套件
npm install

# 啟動開發模式
npm run dev
```

### 常用指令

```bash
npm run dev          # Electron + Vite HMR 開發模式
npm run build        # 正式打包
npm run typecheck    # TypeScript 型別檢查
npm run test         # 單元測試（Vitest）
npm run lint         # ESLint 程式碼檢查
```

---

## 更新日誌

### 2026-07-04（傍晚）— 兩個 AI 的成果會師：制度拼圖完成

> 一段有趣的插曲：老闆前後開了兩個「立制度」的 AI session，彼此不知道對方存在。
> 一個修好了警報系統，另一個把判斷力做成了查表。今天發現後合併，接口天然對上。

- **插曲的來龍去脈** — 例行健檢時發現幾筆可疑的攔截紀錄，追查「是哪個 session 幹的」，結果查到：是老闆昨晚開的**另一個 AI session**在測試自己寫的防護機制（虛驚一場，沒有真違規）。但順藤摸瓜發現它留下了一批沒合併的成果，躺在一條沒人知道的分支上。
- **它做了什麼（判斷力機械化三件套）**：
  - **七張決策表** — 把「需要動腦判斷」的時刻（卡關多久該停手、什麼事該問老闆、完成要拿出幾分證據）全部變成查表就有答案
  - **開場自動注入** — 每個新 AI session 一開場，系統自動把「踩坑速查表＋決策表摘要」塞給它，不再依賴 AI 自己記得去讀
  - **完成證據產生器** — 交付前跑一個指令，自動檢查分支、程式碼品質、編譯新鮮度，產出一份證據報告
- **合併時順手修了一個誤攔** — 防護機制曾把「唯讀查詢」誤判成「寫入」攔下來（就是這次調查途中自己撞到的），已修好並補了測試。
- **合體後的全貌** — 每個 AI session 的一生現在都被制度包住：開場自動看到前人教訓 → 做事中有防護攔危險動作、有決策表代替猜測 → 收尾一鍵產生證據 → 事後有雲端檢查和定期警報健檢。
- **驗證** — 合併後 386 個測試全綠、防護測試 59/59、用它自己做的證據產生器驗證了它自己的合併（通過）。
- **最好的部分** — 兩個 AI 互不知情，但一個的「教訓速查表」正好就是另一個的「開場注入內容」——今天新增的每一條教訓，明天的每個 session 開場就會自動看到。制度開始自己餵養自己了。

---

### 2026-07-04（下午）— GitHub 自動檢查首次「全綠且值得信任」

> 警報系統修好後立刻立功：老闆第一次親眼看到 CI 紅燈、當天回報、當天修掉。
> 這在三天前是不可能的——那時紅燈根本沒人看得見。

- **修好「測試找不到檔案」** — 有兩個測試要先編譯出一個檔案才能跑。開發機上有舊的編譯產物所以一直是綠的；GitHub 的檢查機每次都從零開始，沒人告訴它要先編譯，所以一直紅。**這個問題從 Sprint 5 就存在，每次推程式碼都在紅，只是以前沒人看見。** 修法：檢查流程在跑測試前先加一步編譯。
- **刪掉重複的檢查流程** — 發現有兩套內容幾乎一樣的檢查在同時跑，等於每次推程式碼付兩次檢查機的錢。合併成一套。
- **升級過時零件** — GitHub 警告檢查工具用的 Node 20 快退役了，一併升級到新版。
- **驗證** — 修復推上去後盯著檢查機跑完：**三項檢查（型別、測試、程式碼風格）全部通過**。這是這個專案有史以來第一次「雲端乾淨環境下 371 個測試全綠」。
- **新規矩** — 踩坑速查表加一條：測試若依賴編譯產物，檢查流程必須先編譯——「我電腦上有」不等於「檢查機上有」。

---

### 2026-07-04 — 清空欠債：兩個拖了一個多月的老問題正式修好

> 制度健檢後老闆排期，一口氣把「踩坑紀錄」裡最後兩筆待修欠債清零。
> 至此待修清單是空的。

**修復一：31 個壞掉的測試全部修好（PM-012，拖了 36 天）**

- **問題**：專案的自動測試有 31 個一直是壞的，導致「跑測試」這件事失去意義——反正一定有紅字，真的弄壞東西也沒人分得出來。
- **查出的真相**：5 週前的初步診斷有兩處猜錯了。真正的原因分別是：(1) 測試工具升級後，假物件的寫法不相容；(2) 測試把程式內部的執行順序寫死，程式多查一次資料庫測試就崩；(3) 最意外的一個——測試環境的設定檔**把瀏覽器模擬環境整個換掉了**，導致按鈕點擊、事件這些基本功能在測試裡全部失靈。大家以為是版本問題，其實是自己人埋的雷。
- **結果**：**359 個測試全部通過，是 20 天來第一次全綠**。並且修好了 GitHub 自動檢查的兩個盲點（AI 的工作分支以前不會觸發檢查、有個檢查項目寫錯了內容）。
- **學到的規矩**：舊的診斷筆記只能當線索，不能當結論——動手修之前要重新驗證。

**修復二：多視窗工作不再互相踩腳（PM-008，拖了 66 天）**

- **問題**：以前同時開兩個 AI 工作視窗，它們共用同一個資料夾。A 正在存檔的時候 B 一開工就把「目前位置」切走，A 的成果就存錯地方。這問題 4 月底就發現了（連證據都留了），一直沒排上修。
- **修法**：現在每個工作視窗開工時，會拿到**自己專屬的工作副本和專屬的存檔線**（git worktree）。誰也碰不到誰的東西。視窗關閉時副本自動回收；如果裡面還有沒存檔的半成品，**系統會保留下來絕不刪**，留給老闆處理。
- **保險絲**：整套機制若遇到任何意外，會自動退回舊模式（頂多回到以前，不會更糟）；也可以用一個開關整個關掉。
- **介面**：每張 session 卡片現在會顯示自己的存檔線名稱，滑鼠移上去可以看工作副本的位置。

**驗證方式（老闆委託代測）**：不是只跑單元測試——我們把當初出事的完整劇本重演了一遍（兩個視窗交錯存檔），確認每一筆都落在正確的地方、主資料夾全程一動不動；還在真實專案上實地演練過一次，演練後不留任何痕跡。這個「事故重演」測試已永久加入自動檢查，同樣的問題若復發會當場被抓。

---

### 2026-07-03 — 制度大健檢：把「不可靠的警報」全部修好，並把經驗變成規則

> 這次不是加新功能，是把整套「自動把關機制」翻出來體檢，修好壞掉的部分，
> 並把過去踩過的坑寫成日後每個 AI 助手都會自動遵守的規則。用最白話的方式說明如下。

**第一部分：健檢發現了什麼**

- **有個警報器從來沒綠燈過** — 每次 AI 結束工作時，系統會自動跑一次「品質檢查」。翻紀錄發現它**響了 175 次、通過 0 次**：因為它每次都跑全部測試，而測試裡有 31 個本來就是壞的，所以永遠不會過。結果就是所有 AI 都學會「紅燈是正常的、不用理它」——這比沒有警報更糟。
- **有個檢查會冤枉好人** — 部署前的把關檢查，只要指令裡出現「deploy」這個字就會被攔下來，連「搜尋一下含 deploy 的紀錄」這種無辜動作也被擋。這個問題兩個月前就記錄過，但一直沒人修。（諷刺的是，這次健檢時它還真的攔了我一次，當場人贓俱獲。）
- **重要的保護只靠「口頭规定」** — 電腦上有兩份一樣的專案：一份給 AI 工作用、一份是老闆自己驗收用的乾淨版。規則說 AI 不准碰驗收版，但這只是寫在說明文件裡的一句話，AI 忘了就沒了。

**第二部分：修了什麼**

- **警報器改聰明了** — 結束檢查改成：沒改東西就放行；只改文件就放行；改了程式才跑「快速、目前確定能過」的檢查。從此警報一響 = 真的有事。
- **部署把關不再冤枉人** — 只有真正的部署指令才會被攔，並且附上 27 個測試案例保證以後不會再誤判。
- **驗收版加上真正的鎖** — AI 想寫入老闆的驗收副本，會被系統直接擋下，不再靠自覺。
- **修好全部 31 個壞測試** — 現在 **359 個測試全部通過**，是 20 天來第一次全綠。之後只要測試變紅，就代表真的有人弄壞了東西，不能再推給「本來就壞」。
- **GitHub 自動測試恢復視力** — 原來它一直有在跑測試，但 AI 的工作分支根本不會觸發它，紅了也沒人看見。現在每個分支推上去都會自動檢查。

**第三部分：立了哪些新規矩（讓以後的 AI 更可靠）**

- **「說做完要有證據」** — AI 回報任務完成時，必須貼出實際跑過的指令和結果。沒有證據就不算完成。（因為之前發生過三次「號稱修好了其實沒有」的事件。）
- **「記錄問題就要建待辦」** — 踩坑紀錄裡寫「之後再修」的東西，必須同時建一張待辦單，不然就會像那個誤判檢查一樣躺兩個月沒人理。
- **「定期檢查警報是不是壞的」** — 健檢清單新增一項：統計每個警報的攔截次數，永遠在響或永遠不響的都算壞掉，要優先修。
- **踩坑速查表從 6 條擴充到 22 條** — 把過去所有事故的教訓，濃縮成一行一行的「遇到這個就這樣做」，AI 每次開工都會讀到。
- **整理了最上層的導覽文件** — 原本 14 個專案共用的說明檔是一份填空模板（連專案名稱都還是空格），每個 AI 都被灌了錯誤資訊。改成一份乾淨的地圖：先確認你在哪個專案，再讀那個專案自己的規則。

**下一步**：多視窗同時工作時會互相干擾 git 分支的老問題（PM-008），已排入下一個修復順位。

---

### 2026-07-02 — 專案啟用/關閉切換

- **重用 archived 狀態當「關閉」** — 不做 DB migration，直接用既有的 `archived` 欄位切換啟用狀態
- **ProjectCard 快捷操作** — 卡片右上角新增封存 / 還原 icon 按鈕，`.stop.prevent` 防止誤觸卡片導航
- **ProjectsView 分頁 tab** — 「啟用中 / 已關閉 / 全部」三個分頁，預設顯示啟用中
- **SessionLauncher 自動過濾** — 啟動 Session 選單自動排除 archived 專案；但 preselected / remix 綁定的專案仍保留，避免選單缺項
- **i18n 同步** — `zh-TW` + `en` 新增 `archiveAction` / `unarchiveAction` / `filter.*` 詞條
- **老闆需求** — 工作時關閉的專案不會出現在選單，減少干擾

---

### 2026-05-28 — Sprint 5 完成：跨 Agent SendMessage MCP 工具 + Cost Backfill 強化

#### Sprint 5：Agent 互傳工具（MCP SendMessage）
- **新增 `send_message` MCP 工具** — Agent 可在 Claude session 中呼叫此工具發送訊息給同事，無需老闆介入
- **四層接力打通** — boss → PM → tech-lead → backend-architect 全鏈自動 PTY 注入（broker 3 秒 poll inbox → 找到新 unread → 格式化為「`--- [來自 XXX 的訊息] ---`」→ 注入下游 PTY）
- **白名單安全模型** — 跨部門 L2 / 跨層級越權自動攔截，錯誤訊息列出 sender / blocked target / allowed list；`allowedTargets=[]` 時 fail-closed 全攔
- **Rate Limit** — 每 session 每小時 20 條上限，per-process 計數隔離（重新 spawn 重置）
- **跨進程 E2E 覆蓋** — `out/mcp/send-message-server.js` 編譯產物用 `child_process.spawn` 跑 JSON-RPC 對話，與 Claude CLI 實際啟動方式 100% 一致；可進 CI、可重複
- **G3 測試驗收通過** — Sprint 5 範疇 26/26 測試全綠（MCP unit 8 + MCP E2E 7 + broker relay 4 + cost-backfill 7）

#### PM-011 強化：In-Process Cost Backfill
- **App 啟動自動補登** — `electron/services/cost-backfill.ts` 開機時掃 `~/.claude/projects/*.jsonl`，用 ±120s 時間窗 greedy match 把 `cost_usd=0` 的近 7 天 session 補上正確費用
- **不再需要手動腳本** — 廢除 `scripts/backfill-cost.ts` 手動工作流
- **IPC 四方同步** — 新增 `cost:backfill-completed` channel，前端可監聽補登事件即時更新圖表
- **Pricing 模組獨立** — `electron/services/pricing.ts` 抽出共用定價表，避免 jsonl-usage-tracker 與 backfill 邏輯重複

#### PM-012 追蹤：預存測試失敗 31 例
- 發現 5 個檔案 31 個失敗（session-manager、task-manager、SkillCreateModal/DetailPanel/Tab）
- 三類根因：xterm headless mock factory、taskManager transition 行為改動、`vitest 4 + @vue/test-utils 2.4 + jsdom` 不相容
- 與 Sprint 5 / PM-011 完全無關，已記錄於 `.knowledge/postmortem-log.md` 等待 Sprint 排程

---

### 2026-05-08 — PM-011 Cost Tracking 根治修復

- **JSONL polling 落地** — 捨棄不穩定的 IPC 呼叫鏈，改由後端直接解析 Claude JSONL 使用紀錄寫入 production DB
- **三個串聯失敗全數修復** — Session spawn → cost event → DB write → 前端圖表全鏈路貫通
- **Windows env var 繼承** — 確保 node-pty 子程序正確繼承 `ANTHROPIC_API_KEY` 等環境變數

---

### 2026-05-05 — PM-010 Cost Tracking 多輪修復

- **主來源改為 JSONL 解析** — 直接解析 `~/.claude/projects/*/conversation.jsonl`，不依賴 CLI 輸出格式
- **Workspace trust 自動接受** — 修復 Claude Code 在新目錄詢問 trust 導致 cost tracking 卡死的問題
- **Interactive session 流量更新** — 修復 interactive session 的 token/cost 數據無法同步到前端儀表板

---

### 2026-04-29 — Sprint 5 版控 + Harness 規範納入

- **版控強化** — `.claude/commands/`、`.claude/hooks/`、`settings.json` 全部納入 git 版控
- **Sprint 5 計畫書** — `proposal/sprint5-dev-plan.md` 正式納入
- **Postmortem 補齊** — 新增 PM-007（Skill tool 阻擋）、PM-008（Hook 路徑問題）、PM-009（SendMessage 工具落差）
- **G2 Code Review 通過** — Sprint 5 T2～T6 批准合併

---

### 2026-04-25 — Claude-Mem 脫鉤 + Hook 路徑全面修正

- **claude-mem 完全移除** — 清除 `~/.claude/settings.json` 中的 `extraKnownMarketplaces` / `enabledPlugins`；Worker process 確認停止
- **Hook 路徑修正** — 所有 `.claude/hooks/*.js` 改用 Node.js 完整路徑（`/c/Program Files/nodejs/node`），解決 `/usr/bin/bash` 環境 PATH 找不到 `node` 的問題
- **stop-validator 修正** — `execSync('npm ...')` 改用 `process.execPath` + npm-cli.js 完整路徑，Stop Hook 能正確執行 test/lint
- **Lint 零錯誤** — 修復 `project-sync.ts`（3 處 `no-useless-escape`）、`session-manager.ts`（ternary `no-unused-expressions`）、`SkillCreateModal.vue`（`no-useless-escape`）

---

### 2026-04-24 — 全站視窗標題更名為 Starklab AgentHub

- **視窗標題統一** — 從 `Yu AgentHub` 改為 `Starklab AgentHub`，涵蓋：
  - `src/index.html` 瀏覽器 `<title>`
  - `electron-builder.yml` `productName`（安裝程式 / 工作列）
  - `electron/main.ts` 啟動 log + macOS 應用程式選單
  - `electron/services/tray-service.ts` 系統匣 tooltip 與右鍵選單
  - `src/locales/en.json` / `zh-TW.json` About 選單文字

---

### 2026-04-11 — 品牌重塑 + StatusLine 費用追蹤

#### 品牌重塑：StarkLab
- **Logo** — 以官方 `starklab_logo.png` 取代側邊欄佔位頭像
- **品牌色** — 全域主題色從紫色（`#6c5ce7`）換為 StarkLab 品牌藍（`#0066cc` / `#4da3ff`），涵蓋 CSS 變數、Terminal cursor、圖表配色

#### StatusLine 費用追蹤
- **新腳本** — `electron/utils/session-statusline.js` 讀取 Claude CLI 用量資料，寫入成本 / token 共享檔
- **自動路徑解析** — `getStatuslineScriptPath()` 同時相容開發環境（`__dirname`）與打包環境（`process.resourcesPath`）
- **Session 注入** — Interactive session 自動寫入暫存 `settings-{id}.json`，透過 `--settings` 傳給 Claude CLI
- **Build 打包** — `electron-builder.yml` 新增 `extraResource`，確保 production build 包含 statusline 腳本

#### 知識庫建立
- 新增 `.knowledge/company-rules.md`、`team-workflow.md`、`postmortem-common.md`
- 新增 `.knowledge/templates/` — Sprint 提案書、開發計畫書、內部審查、Postmortem 範本

---

### 2026-04-13 — Sprint 4：學術研究部門

- **新部門** — `academic-research` 部門上線，服務東吳大學資料科學系教授
- **四條學術工作流程** — 期刊投稿、研討會論文、論文審稿、國科會計畫申請
- **7 位學術 Agent** — 含 Lit Reviewer、Hypothesis Generator、Stat Analyst、Grant Writer 等
- **知識庫** — `.knowledge/academic/` 下新增 SOP、Agent prompts、期刊清單、學者檔案

---

### 2026-04-初 — 核心功能首次上線

- **跨 Agent 通訊** — Messages UI、雙系統橋接、即時推送
- **智慧任務調度** — 任務輸出鏈、自動解鎖下游任務
- **執行觀測** — Cost/Token 儀表板，Chart.js 互動圖表
- **Agent 智慧化** — 自主委派、持久記憶、Session 輸出持久化
- **品質修復** — 任務卡片即時更新、PTY debounce、50 KB 保護

---

## 致謝

- 原始專案 [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub)
- Harness 工程方法論來自 [Claude Code Mastery](https://github.com/Stanshy/Claude-code-mastery)
- 任務鏈與記憶系統參考 [CrewAI](https://github.com/crewAIInc/crewAI)
- 觀測面板設計參考 [Dify](https://github.com/langgenius/dify)

## License

MIT

---

<div align="center">

*為想做大事的一人公司而生。*

**[GitHub](https://github.com/dodo0095/Agent-hub)**

</div>
