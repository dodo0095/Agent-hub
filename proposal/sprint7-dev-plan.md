# 開發計畫書: Sprint 7 — ARS 整合 — 學術出版部與 Publication Operator

> **撰寫者**: tech-lead
> **日期**: 2026-09-28
> **專案**: AgentHub
> **Sprint 提案書**: 本案沒有 Sprint 提案書，以技術決策書為 G0 依據 → `proposal/tech-decision-ars-integration.md`（老闆 2026-09-27 批准 D1-A、D2-A）
> **狀態**: G0 通過，執行中

---

## 1. 需求摘要

README「學術事業群使用指南」已公告學術出版部與 Publication Operator（標 🚧），但系統內尚未實作。本計畫交付：

1. 新部門 `academic-publication`，成員 Publication Operator（L2，向 research-director 匯報）。
2. Hub 啟動 Publication Operator 時，以 `--plugin-dir` 載入使用者自行安裝的 ARS（Academic Research Skills）；其他 agent 不載入。
3. 啟動前檢查 ARS 完整性（PM-015：zip 解壓後 symlink 失效會導致 0 個 skill）。

### 確認的流程

需求（技術決策書）→ 規範 → 實作 → G2 → 測試 → G3 → 文件 → G4

---

## 2. 技術方案

### 選定方案

- **部門**：新增 `agents/definitions/academic-publication/publication-operator.md`。agent-loader 依資料夾名稱自動建立部門，只需補中文名稱、顏色、顯示名稱三張對照表。
- **ARS 路徑設定**：沿用既有通用設定 IPC（`settings:get` / `settings:update`，`user_preferences` 表），key 為 `ars.plugin-dir`（全域，非專案層級）。**不新增 IPC 通道**，四方同步不適用。
- **啟動注入**：`buildClaudeArgs()`（`electron/services/session-spawn-helpers.ts`）判斷 agent 的 department 是 `academic-publication` 時：
  1. 讀取 `ars.plugin-dir`；未設定 → 拋錯 `ARS_PATH_NOT_SET`
  2. 呼叫 `validateArsPluginDir()`；不完整 → 拋錯 `ARS_INSTALL_INCOMPLETE`（列出缺的項目）
  3. 非互動模式（`interactive === false`）→ 拋錯 `ARS_REQUIRES_INTERACTIVE`（檢查點必須由老闆回覆）
  4. 通過 → `args.push('--plugin-dir', arsPath)`
- **Resume 也要注入**：`--plugin-dir` 只對單一 session 生效，目前 resume 路徑只回傳 `['--resume', id]`，會掉 ARS。resume 時要依原 session 的 agent 判斷是否補上 `--plugin-dir`。
- **判斷依據用 department，不寫死 agent id**：未來出版部若增加成員，也會自動載入 ARS。

### 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|------|------|------|------|
| A: `--plugin-dir` 只注入出版部 session | 部門邊界清楚、不內附 ARS | 需改 spawn 參數 | ✅ 選定（決策書 D2-A） |
| B: 全域 `claude plugin install` | 不改程式碼 | 所有 agent 都載入 ARS | ❌ 排除 |
| C: 每篇論文 symlink | 不改程式碼 | Windows 權限問題、每篇都要手動 | ❌ 排除 |

---

## 3. UI 圖稿

不需要新頁面。SettingsView 只新增一個文字欄位（ARS 路徑）加說明文字，沿用現有設定頁的欄位樣式，不出 mockup。

---

## 4. 檔案變更清單

### 新增

| 檔案 | 用途 |
|------|------|
| `agents/definitions/academic-publication/publication-operator.md` | Publication Operator 角色定義與 system prompt |
| `electron/utils/ars-validator.ts` | `validateArsPluginDir(path)`：檢查 plugin.json 與 4 個 SKILL.md |
| `tests/unit/ars-validator.test.ts` | 驗證器單元測試 |
| `tests/unit/agent-loader.test.ts` | agent-loader 載入新部門測試 |
| `tests/components/SettingsView.test.ts` | 設定頁 ARS 路徑欄位元件測試 |

### 修改

| 檔案 | 變更內容 |
|------|---------|
| `electron/services/agent-loader.ts` | 三張對照表補 `academic-publication` / `publication-operator` |
| `electron/services/session-spawn-helpers.ts` | 出版部 session 注入 `--plugin-dir`（含 resume 路徑）與三種錯誤 |
| `tests/services/session-spawn-helpers.test.ts` | 新增注入與錯誤案例（沿用既有測試檔） |
| `src/views/SettingsView.vue` + locale 檔 | 新增「ARS 路徑」欄位（zh-TW / en） |
| `agents/definitions/academic-research/research-director.md` | `manages` 加 `publication-operator`；prompt 補出版部管控四點 |
| `.knowledge/academic/department-structure.md` | 升 v2.0：加出版部、跨部門管理約束 |
| `.knowledge/academic/agent-prompts.md` | 加 publication-operator 段落 |
| `.knowledge/specs/{api-design,data-model,feature-spec}.md` | 升 v2.0：補 ARS 整合規格（見第 5 節） |
| `README.md` | 出版部 🚧 → ✅，補 ARS 安裝與 Windows zip 注意事項 |

### 刪除

無。

---

## 5. 介面設計與規範文件索引

### 規範文件（Code Review「對規範」比對基準，由 T1 升版）

| 檔案 | v2.0 新增內容 |
|------|-------------|
| `.knowledge/specs/api-design.md` | 設定 key `ars.plugin-dir`；spawn 參數契約；錯誤碼 `ARS_PATH_NOT_SET` / `ARS_INSTALL_INCOMPLETE` / `ARS_REQUIRES_INTERACTIVE` |
| `.knowledge/specs/data-model.md` | `academic-publication` 部門、publication-operator 欄位定義（level L2、reports_to research-director） |
| `.knowledge/specs/feature-spec.md` | 出版部用戶流程（開案簡報 → ARS 檢查點 → 出口驗收）、邊界條件、驗收標準 |

### IPC / API 新增

無新通道。沿用 `settings:get` / `settings:update`，key = `ars.plugin-dir`。

### 型別定義

```typescript
// electron/utils/ars-validator.ts
export interface ArsValidationResult {
  ok: boolean;
  missing: string[]; // 相對於 ARS 根目錄的路徑，例如 'skills/academic-pipeline/SKILL.md'
}

export const ARS_REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  'skills/academic-paper/SKILL.md',
  'skills/academic-paper-reviewer/SKILL.md',
  'skills/academic-pipeline/SKILL.md',
  'skills/deep-research/SKILL.md',
] as const;

export function validateArsPluginDir(dir: string): ArsValidationResult;
```

---

## 6. 任務定義與分配

> L1 讀取本節後按依賴順序執行。第一步先執行 `/task-delegation` 建立 `.tasks/` 檔案，系統自動追蹤進度。

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 依賴 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|---------|---------|
| T1 | 規範文件升版 | 三份 specs 與 `department-structure.md` 升 v2.0，內容依第 2、5 節 | tech-lead | 無 | 規範 | 四份文件都有 v2.0 標頭與第 5 節列出的內容 |
| T2 | 出版部角色定義 | 新增 `publication-operator.md`；更新 research-director `manages` 與 prompt；`agent-prompts.md` 加段落。prompt 必須明文：不代答檢查點、不讀研究部學者檔案以外的個資、交接一律經總監 | tech-lead | T1 | 實作 | 檔案 frontmatter 可被 gray-matter 解析；內容對齊 data-model v2.0 |
| T3 | agent-loader 部門註冊 | 三張對照表補新部門與角色；加單元測試：載入後 `getByDepartment('academic-publication')` 回傳 publication-operator | backend-architect | T2 | 實作 | 測試綠；GUI 顯示「學術出版部」 |
| T4 | ARS 完整性驗證器 | 實作 `validateArsPluginDir()`；測試三情境：完整、SKILL.md 是 stub 檔（PM-015）、路徑不存在 | backend-architect | T1 | 實作 | 3 情境測試綠 |
| T5 | spawn 注入 `--plugin-dir` | 依第 2 節實作，含 resume 路徑與三種錯誤；非出版部 agent 參數完全不變 | backend-architect | T3, T4 | 實作 | 單元測試：出版部有 `--plugin-dir`、其他部門沒有、resume 有、三種錯誤各一案例 |
| T6 | 設定頁 ARS 路徑欄位 | SettingsView 新增欄位，存 `ars.plugin-dir`；附說明「zip 下載請確認 skills/ 內為資料夾」與授權連結；zh-TW / en 雙語 | frontend-developer | T1 | 實作 | 存取值正確；i18n 無缺 key；元件測試綠 |
| T7 | 真實環境端到端驗證 | `npm run build` 後從 Hub 啟動 publication-operator：debug log 證實 Loaded 4 skills；與 `--mcp-config` 並用 SendMessage 仍可用；ARS `PreToolUse` guard 不與 Hub hooks 衝突；resume 後 ARS 仍在；路徑錯誤時 UI 有明確錯誤 | tech-lead（派 fresh-context agent 驗收） | T5, T6 | 測試 | 五項各附指令與輸出證據 |
| T8 | 文件收尾 | README 🚧 → ✅ 並補安裝說明；`/pitfall-resolve` PM-015；backlog PM-015 標 done | tech-lead | T7 | 文件 | 文件與程式碼一致（G4 對規範 Review） |
| T9 | resume 保留 MCP（PM-016） | 依 api-design §7.1：抽出 MCP 設定產生函式，兩條 resume 路徑共用；以 §6.2 規則找 agent；修正錯誤註解 | backend-architect | T8 | 實作 | 單元測試：兩條 resume 含 `--mcp-config`、找不到 agent 不含、產生失敗不讓 resume 拋錯；非 resume 行為不變 |
| T10 | 自動啟動失敗回報 | 依 api-design §7.2：ARS_* 錯誤冷卻 5 分鐘、去重通知、system 回訊給發訊者、送 `app:notification`；防迴圈 | backend-architect | T8 | 實作 | 單元測試涵蓋兩條 auto-spawn 路徑、冷卻、去重、防迴圈、非 ARS 錯誤維持現狀 |
| T11 | App 層通知顯示 | 依 api-design §7.3：main 送 `notification`；App 層訂閱並以 toast 顯示（ARS_* 沿用 spawn-error 規則）；tests/setup.ts 的 `maestro.on.notification` mock 已存在則沿用 | frontend-developer | T8 | 實作 | 元件或單元測試：收到 ARS_PATH_NOT_SET payload 顯示對應 toast；zh-TW／en key 一致 |
| T12 | 7.1 端到端驗證與 Review | fresh-context agent：CLI 層實測 `--resume` ＋ `--mcp-config` 後 send-message 連線；broker 失敗流程以測試或腳本實證；G2 對程式碼＋對規範 | tech-lead（派 fresh-context agent） | T9, T10, T11 | 測試 | 證據寫入 `docs/reviews/sprint7.1-evidence.md`；Review 0 Blocker／0 Major |
| T13 | 7.1 文件收尾 | README 移除「自動啟動失敗只記 log」限制說明；PM-016 resolved；兩個 backlog 標 done | tech-lead | T12 | 文件 | G4 文件一致性通過 |

### 依賴圖

```
T1 ─┬─→ T2 ─→ T3 ─┐
    ├─→ T4 ───────┼─→ T5 ─┐
    └─→ T6 ───────┴───────┴─→ T7 ─→ T8
```

### L1 執行指令

```
請執行「ARS 整合」開發計畫。

📄 計畫書：proposal/sprint7-dev-plan.md
📋 你負責的任務：T1、T2、T7、T8（第 6 節）
🔧 委派 backend-architect：T3、T4、T5
🎨 委派 frontend-developer：T6

⚠️ 阻斷規則：T5 未通過單元測試前不得進 T7；T7 五項證據缺一不得提交 G3。

第一步請先執行 /task-delegation 建立任務檔案。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `electron/services/session-spawn-helpers.ts` | T5（與所有 session 啟動相關） | 高 |
| `agents/definitions/academic-research/research-director.md` | T2 | 低 |
| locale 檔 | T6 | 低 |

---

## 7. 測試計畫

### 單元測試

| 測試檔案 | 測試案例 |
|---------|---------|
| `tests/unit/ars-validator.test.ts` | 完整目錄 → ok；`skills/academic-pipeline` 為 stub 檔 → missing 含該路徑；路徑不存在 → ok=false |
| `tests/services/session-spawn-helpers.test.ts` | 出版部 agent → 含 `--plugin-dir <path>`；工程部 agent → 不含；resume 出版部 session → 含；未設定路徑 → `ARS_PATH_NOT_SET`；ARS 不完整 → `ARS_INSTALL_INCOMPLETE`；非互動 → `ARS_REQUIRES_INTERACTIVE` |
| agent-loader 測試 | 載入 `academic-publication` 部門，名稱「學術出版部」 |

> mock DB 查詢用 SQL-aware `mockImplementation`（PM-012），不用 `mockReturnValueOnce` 佇列。

### E2E 測試

T7 為真實 Hub 啟動驗證（非自動化），證據存 `docs/reviews/sprint7-t7-evidence.md`。

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| ARS 更新後 symlink 又失效（PM-015） | `/ars-full` 無法執行 | T4 驗證器擋在啟動前並提示修法 |
| 改 spawn helper 影響所有 agent | 全公司 session 啟動失敗 | 只在 department 判斷成立時動作；T5 測「其他部門參數完全不變」 |
| resume 掉 ARS | 中斷的論文流程接不回來 | T5 resume 案例 + T7 實測 |
| ARS `PreToolUse` guard 與 Hub hooks 衝突 | 操作員寫檔被擋或 hook 噪音 | T7 實測；衝突則記 pitfall 並回報老闆 |
| 改 `electron/**` 忘了 build | app 跑舊 bundle（PM-011） | T7 先 `npm run build` 並確認 `out/` 時間戳 |
| Publication Operator 模型選擇（成本） | ARS 估算 US$3–7／篇的基準模型未知 | 預設 `sonnet`；T7 後依實測成本回報老闆再決定是否改 opus |
| CC BY-NC 4.0 授權 | 商業化受限 | Hub 不內附 ARS；README 保留授權聲明 |

---

## 9. 文件更新

- [x] `.knowledge/specs/*.md`（T1）
- [x] `.knowledge/academic/department-structure.md`、`agent-prompts.md`（T1、T2）
- [x] `README.md` 學術事業群使用指南（T8）
- [x] `.knowledge/postmortem-log.md` PM-015 resolve（T8）；另記 PM-016（resume 不帶回 --mcp-config）
- [x] CLAUDE.md：不需修改（學術部門索引已指向 `.knowledge/academic/`）

---

## 11. Sprint 7.1 追加範圍（2026-09-28，老闆指示「現在修」）

Sprint 7 交付後的兩個已知問題，併入 Sprint 7 一起結案（老闆：修完再一起確認 Gate）：

| 問題 | 來源 | 任務 |
|------|------|------|
| resume 的 session 失去跨 agent 通訊（全部門） | T7 觀察、PM-016 | T9 |
| 總監以訊息觸發自動啟動操作員失敗時畫面無提示，且每輪無限重試 | G2 MN-1、7.1 調查 | T10、T11 |

規格見 `.knowledge/specs/api-design.md` §7。依賴：T9、T10、T11 可並行 → T12 → T13。

## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | 2026-09-28 | ✅ 完成 | 四份規範升 v2.0（commit 7e6487f）；補 ARS 檢查點不算越級匯報的例外條款 |
| T2 | 2026-09-28 | ✅ 完成 | publication-operator.md 新增；research-director manages 7 位＋出版部管控四點；gray-matter 解析驗證通過（commit 7e6487f） |
| T3 | 2026-09-28 | ✅ 完成 | agent-loader 三張對照表＋`tests/unit/agent-loader.test.ts`（commit 64ebd01） |
| T4 | 2026-09-28 | ✅ 完成 | `ars-validator.ts`；G2 MN-3 改為要求「是檔案」（64ebd01、5219afa） |
| T5 | 2026-09-28 | ✅ 完成 | 一般啟動／兩條 resume 皆注入；G2 修正 MJ-1（direct resume 反查）、MN-8（連續 resume）、路徑正規化（64ebd01、5219afa、0a55011） |
| T6 | 2026-09-28 | ✅ 完成 | 設定頁 ARS 路徑；T7／G2 追加：所有啟動與接續入口失敗時顯示 toast（0a55011、f130d0f） |
| T7 | 2026-09-28 | ✅ 完成 | CLI 層五項驗證（fresh-context agent），第 5 項原 ⚠️ 已修；GUI 畫面未截圖（未驗證）。證據 `docs/reviews/sprint7-t7-evidence.md` |
| T8 | 2026-09-28 | ✅ 完成 | README 🚧→✅＋安裝說明與自動啟動限制；PM-015 resolved；PM-016 記錄 |
| T9 | 2026-09-28 | ✅ 完成 | 三條路徑共用 `injectMcpConfigIfNeeded`；`resolvedAgentId` 供 session-manager 登記原 agent 身分；PM-016 錯誤註解移除（43ac50c、778c725） |
| T10 | 2026-09-28 | ✅ 完成 | ARS_* 冷卻 5 分鐘、去重通知、system 回訊、防迴圈；兩條 auto-spawn 路徑皆套用（43ac50c、778c725） |
| T11 | 2026-09-28 | ✅ 完成 | 沿用既有 `notification` 通道（無新 IPC）；App 層單次訂閱＋toast；zh-TW／en 各 612 key 一致（43ac50c、778c725） |
| T12 | 2026-10-03 | ✅ 完成 | fresh-context agent 驗收：CLI 2.1.283 實測 `--resume`＋`--mcp-config` send-message connected，對照組重現 PM-016；全套 485/485；0 Blocker／0 Major／5 Minor（R71-01～05，轉 backlog `S7.1-review-minors`）。GUI 畫面未驗證。證據 `docs/reviews/sprint7.1-evidence.md` |
| T13 | 2026-10-03 | ✅ 完成 | README 移除「自動啟動失敗只記 log」限制並改寫為現行行為；PM-016 resolved；兩個 backlog 已 done；新增 backlog `S7.1-review-minors`（R71-01～05、G4-71-06、resume 實機傳訊驗證） |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| 規範 Review | 2026-09-28 | 通過 | `docs/reviews/sprint7-g2-review.md`（第一輪對規範項） |
| 實作 Review | 2026-09-28 | 通過 | `docs/reviews/sprint7-g2-review.md`（四輪；最終 0 Blocker／0 Major） |
| 測試 Review | 2026-09-28 | 通過 | `docs/reviews/sprint7-t7-evidence.md`；全套 437/437 |
| 文件 Review | 2026-09-28 | 通過 | 第五輪 G4 複審 0 Blocker／0 Major／0 未修 Minor（`docs/reviews/sprint7-g2-review.md`） |
| 7.1 實作＋測試 Review | 2026-10-03 | 通過 | `docs/reviews/sprint7.1-evidence.md`（對程式碼＋對規範；0 Blocker／0 Major／5 Minor） |
| 7.1 文件 Review（G4） | 2026-10-03 | 通過 | fresh-context 複審 6 條全過，重新實測 485/485、612 key、CLI 2.1.283；額外 Minor G4-71-06（重複投遞，推論未重現）轉 backlog |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-09-27 | ✅ 通過 | 老闆批准技術決策書 D1-A、D2-A（`proposal/tech-decision-ars-integration.md`） |
| G2 | | | |
| G3 | | | |
| G4 | | | |

---

**確認**: [x] L1 確認 / [ ] Tech Lead 確認
