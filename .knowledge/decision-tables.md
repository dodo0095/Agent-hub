# 決策表 — 判斷力的機械化替代

> **版本**: v1.0
> **最後更新**: 2026-07-04
> **來源**: Fable 5 制度建設 session。把過去 13 條踩坑（PM-001~013）中需要「判斷力」的時刻，改寫成查表即可執行的規則。
> **維護規則**: 只收「查表可執行」的 if-then 規則；散文式教訓放 `postmortem-log.md`。新增踩坑時由 `/pitfall-record` 步驟 5 同步。
> **注入機制**: 本文件的「核心摘要」段由 SessionStart hook 自動注入每個 session，弱模型不需要記得來讀。

---

## 核心摘要（每 session 自動注入）

<!-- INJECT:START -->
1. **完成 = 證據**：宣告任何任務完成前跑 `node scripts/preflight.cjs`，貼輸出。貼不出指令輸出 = 沒有完成。「未驗證」是合法狀態，寫出來；把推論當事實是違規。
2. **除錯熔斷**：同一症狀第 3 次出現 → 停止修單點，改為端到端驗整條 pipeline 每一段（PM-011 教訓：三次假修復燒掉 20 天）。
3. **資料/紀錄類修復**（cost、統計、log）：必須 query production DB 證實資料真的變了。單元測試綠不算數。
4. **不確定就去讀真相來源，不要猜**；連「現在幾點」都要用 `node -e "console.log(new Date().toISOString())"` 取得，禁止編造。
5. **被 hook/CI 擋下**：基準線是綠的（359/359，2026-07-03），紅 = 你弄壞了 → 修到綠。確認 false positive → `/pitfall-record` + backlog，禁止靜默繞過。
6. **越權熔斷**：要刪除/覆蓋既有功能或資料、偏離 dev-plan 範圍、規範文件互相矛盾 → 停下來問，不要自行決定。
7. **工作目錄**：只能寫 `ALL PROJECT\Agent-hub\`；`AgentHub\Agent-hub\` 是 verify-only（有 hook 攔，但別去試）。
<!-- INJECT:END -->

---

## 1. 完成證據等級表

> 宣告完成（`/task-done`）前查這張表，確認你交得出對應等級的證據。
> `node scripts/preflight.cjs` 會自動跑完可機械化的部分並輸出可貼上的證據區塊。

| 變更類型 | 最低證據（實際執行過的指令＋輸出摘要） | 指令 |
|---------|------------------------------------|------|
| 純文件 / `.tasks/` / `proposal/` | `git status` 顯示只動了文件 | `node scripts/preflight.cjs` |
| `src/`（renderer） | lint ✚ typecheck ✚ 相關單元測試輸出 | preflight ＋ `npx vitest run tests/<相關檔>` |
| `electron/**`（main process） | 上述 ✚ **build 新鮮度**（`out/` 時間戳晚於原始碼，否則 app 跑舊 bundle） | preflight（內含 build 檢查） |
| IPC 通道變更 | 四方 diff（`ipc.ts` / `preload.ts` / `useIpc.ts` / `env.d.ts`）都出現在本次變更 | `git diff --stat` 列出四檔 |
| DB schema | `database.ts` migrations 有新版本號 ✚ 遷移相關測試 | `npx vitest run tests/<db 相關>` |
| **資料/紀錄類修復**（cost、統計、log、累計指標） | **production DB query 前後對比**，證明資料真的變了。單測綠不算數（PM-011） | 手動 query，貼結果 |
| `.claude/hooks/**` | 判定測試 ✚ 煙霧測試全綠 | `npx vitest run tests/hooks/ && node scripts/smoke-test-hooks.cjs` |
| production 事故修復 | 上述對應項 ✚ 分支以 main 為 base 的證明（preflight 會查） | preflight |

**鐵律**：沒有貼得出來的證據 = 沒有完成。寧可寫「未驗證：<原因>」也不可寫推論當事實。

---

## 2. 除錯熔斷表

> 判斷「還要不要繼續修這個點」不靠感覺，靠計數。同一症狀（不是同一行程式碼）算同一個 bug。

| 同一症狀第幾次 | 允許的行為 |
|--------------|-----------|
| 第 1 次 | 修最直接的失敗點。修完附證據（見表 1） |
| 第 2 次 | 修之前先寫下這條 pipeline 的**全部環節清單**，逐段標「已驗證 / 未驗證」，只修驗過確實壞的那段 |
| 第 3 次起 | **停。禁止再修任何單點。** 改為：(a) 端到端驗整條 pipeline 每一段；(b) query 權威資料源（DB / JSONL / 實際檔案）證實症狀本體；(c) 用 `--debug` ＋ unique marker 之類的實測手段取代推論；(d) 問「換一條更穩的鏈路」是否好過死磕這條（PM-010 最後換 JSONL 主軌才根治） |

**判定假修復的三個問題**（每次宣告修好前自問）：
1. 用戶實際跑的版本（build / 分支 / DB）真的包含這個 fix 嗎？
2. 我看到的「綠」是測到修復本體，還是測到 mock？
3. 症狀的權威資料源（不是 log 推論）現在長什麼樣？

---

## 3. 升級決策表（什麼事自己決定、什麼事停下來問）

| 情境 | 動作 |
|------|------|
| 實作細節（命名、內部結構、演算法選擇）且規範有覆蓋 | 自行決定，照規範走，不用問 |
| 需求含糊但存在合理預設 | 採預設 ➜ 在任務檔記下「假設：…」 ➜ 繼續做 |
| 規範文件之間互相矛盾 | **停**。引用兩處原文，問 L1 / PM / 老闆 |
| 發現規範文件本身錯了 | **先提案改文件**，經確認後才改 code。文件就是法律，不得跳過文件直接改 code |
| 要刪除 / 覆蓋 / 大量改寫既有功能或資料 | **停下來問** |
| 做著做著發現要偏離 dev-plan 範圍 | **停下來問**（L2 不擅自擴大範圍；L1 回報 PM） |
| 被 hook / CI / 警報擋下 | 查表 5，不升級也不繞過 |
| 同一 bug 第 3 次 | 查表 2 熔斷 |

---

## 4. 不確定性協議（真相來源表）

> 「不確定就去讀，不要猜」的具體版：想知道什麼，就去讀哪裡。

| 你想知道的 | 真相來源（讀，不要猜） |
|-----------|---------------------|
| IPC 通道 / 參數 | `electron/ipc.ts` → `preload.ts` → `useIpc.ts` → `env.d.ts` 四方 |
| DB 欄位 / schema | `electron/services/database.ts` 的 migrations |
| API / service 回傳格式 | 該 service 原始碼的實際 return |
| Claude Code 設定是否真的生效 | `--debug --debug-file` ＋ unique marker 實測（PM-010；hope-based 推論害了三次） |
| system prompt 宣稱的工具存不存在 | ToolSearch / harness 註冊表實查（PM-006） |
| 現在幾點 | `node -e "console.log(new Date().toISOString())"`（Agent 不知道真實時間，禁止編造） |
| 過去有沒有人踩過這個坑 | `postmortem-log.md` 頂部快速參考表 |
| cost / usage 權威數字 | `~/.claude/projects/**/*.jsonl`（比 statusLine 穩，PM-010） |

---

## 5. 警報回應表（被 hook / CI 擋下時）

> 基準線事實：全套測試 **359/359 綠**（2026-07-03 清零，PM-012/013）。lint 0 errors、typecheck exit 0。

| 情況 | 正確反應 | 禁止 |
|------|---------|------|
| 你剛改的東西讓檢查變紅 | 修到綠再結束 | 說「應該是預存問題」（基準線是綠的，沒有預存紅） |
| 你有證據這是 false positive | `/pitfall-record` ＋ 建 backlog 修 hook；當下用**不觸發誤攔的等效指令**繼續工作 | 靜默繞過不記錄（PM-009 就這樣躺了 2 個月） |
| 檢查本身壞了（永遠紅 / 永遠綠） | 失效警報 = 最高優先修（`/harness-audit` 原則 7） | 再按一次 Stop 矇混過去（`stop_hook_active` 放行是遞迴保護，不是後門） |
| 想新增一個會 block 的檢查 | 查表 7 制度修改守則 | 部署基準線過不了的檢查（= 製造永遠響的警報） |

---

## 6. Session 開場自檢（每個 session 前三個動作）

1. `pwd` — 必須在 `ALL PROJECT\Agent-hub`；若在 `AgentHub\Agent-hub`（verify-only）立刻 cd 走。
2. `git branch --show-current && git status -sb` — 確認自己的分支、確認沒踩到別人未提交的工作（PM-008 多 session 共用 working tree 的 race 還在修復路上）。
3. 接到任務先查表 1，開工前就知道完成時要交什麼證據。

---

## 7. 制度修改守則（改 harness 本身之前查）

| 想做的事 | 前置條件 |
|---------|---------|
| 新增 / 修改會 block 的 hook | (a) 確認**目前基準線能過**；(b) 攔截邏輯抽成可 export 函數；(c) `tests/hooks/` 加 false-positive 測試；(d) `scripts/smoke-test-hooks.cjs` 加案例；(e) hook 內呼叫 npm/git 用完整路徑 |
| 加規則進 CLAUDE.md | 先問「能不能改用 hook 強制」（能就不要靠 prompt）；CLAUDE.md 總行數 ≤ 100 的索引原則不可破；**另需過 `harness/maintenance-protocol.md` 黃區審批（老闆同意才改）** |
| 修改 `.knowledge/harness/**` 制度檔案 | 先查 `harness/maintenance-protocol.md` 權限分級（綠／黃／紅區），照它的修改流程走 |
| 加內容進本文件 | 必須是「查表可執行」的 if-then；且評估是否進「核心摘要」注入段（注入段 ≤ 15 行，每行都佔所有未來 session 的 context） |
| 加內容進踩坑快速參考表 | 一行寫得完的「場景 → 規則」才進表；寫不完的留在詳細紀錄 |
| 新增 `.claude/commands/` | frontmatter 不得含 `disable-model-invocation: true`（PM-007） |
| 想把制度推廣到其他子專案 | 用 `/knowledge-feedback`，經公司層模板（`.knowledge/company/`）傳播，不要手動 cp |
