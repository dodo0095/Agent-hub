# 技術決策: 學術出版部（ARS 整合）的部門結構與 ARS 載入方式

> **提案人**: tech-lead
> **日期**: 2026-09-27
> **狀態**: 已批准（2026-09-27，老闆：照建議，D1-A、D2-A）
> **關聯**: `README.md`「學術事業群使用指南」（出版部標 🚧，註明由「ARS 整合」dev-plan 交付；該 dev-plan 尚未建立）

---

## 背景

README 已定義學術出版部與 Publication Operator，但系統內尚未實作。現況（皆已實際查證）：

| 項目 | 現況 | 證據 |
|------|------|------|
| 部門資料夾 | 只有 `academic-research`，無出版部 | `agents/definitions/` |
| 部門名稱／顏色對照 | 只有 `academic-research` | `electron/services/agent-loader.ts:18`、`:31` |
| Publication Operator 定義檔 | 不存在（全 repo 只有 README 提到） | grep `publication-operator` 無結果 |
| 總監管轄 | `manages` 只列 6 位研究部 L2 | `agents/definitions/academic-research/research-director.md` |
| 部門規格文件 | v1.0（Sprint 4），寫 7 位成員 | `.knowledge/academic/department-structure.md` |
| 「ARS 整合」dev-plan | 不存在 | `proposal/` 只有 sprint3–6 |
| ARS 原始碼 | 本機已有 v3.22.2（Claude Code plugin 格式，含 `.claude-plugin/plugin.json`、16 個 `/ars-*` 指令、4 skills、3 agents、hooks） | `ALL PROJECT/academic-research-skills-main/` |
| ARS 是否已安裝為 plugin | 否（`installed_plugins.json` 的 `plugins` 為空） | `~/.claude/plugins/installed_plugins.json` |
| Hub 啟動 agent 的方式 | 組 `claude` CLI 參數：`--model`、`--system-prompt-file`、`--settings`、`--mcp-config` 等，目前沒有 plugin 相關參數 | `electron/services/session-spawn-helpers.ts:85-175` |
| CLI 支援單次 session 載入 plugin | 有，`--plugin-dir <path>`（僅該 session 生效） | `claude --help`（Claude Code 2.1.283） |

需要老闆決定兩件事：**D1 部門怎麼掛**、**D2 ARS 怎麼接進 Hub**。

---

## D1：出版部的部門結構

| 面向 | 選項 A：新部門 `academic-publication` | 選項 B：掛在 `academic-research` 底下 |
|------|------|------|
| 描述 | 新增 `agents/definitions/academic-publication/`，放 `publication-operator.md`；research-director 同時管理兩部門 | `publication-operator.md` 直接放進 `academic-research/` |
| 優點 | 與 README 組織圖一致（兩部門、「不互相借人」）；GUI 分成兩個部門顯示，容易分辨；ARS 的使用範圍可以用部門劃清 | 改動最少，不用改 agent-loader |
| 缺點 | 要改 agent-loader 的部門名稱和顏色表；總監跨部門管理，要更新規格文件的約束條款 | 與 README 的組織圖不一致；違反現有約束 #3「academic-research Agent 不得呼叫其他部門 Skills」的精神（ARS 會變成研究部的 skill，研究部其他人也可能用到） |
| 成本 | 小：1 個新資料夾、loader 加 2 行對照、文件更新 | 極小：文件更新 |

**建議：選項 A。** README 已經公告兩部門架構，實作要以文件為準（致命規則 1）。

---

## D2：ARS 如何接進 Hub

| 面向 | 選項 A：只在操作員 session 加 `--plugin-dir` | 選項 B：全域安裝 plugin（`claude plugin install`） | 選項 C：每個論文專案手動 symlink skills |
|------|------|------|------|
| 描述 | Hub 設定頁存一個「ARS 路徑」；啟動 `publication-operator` 時才加 `--plugin-dir <ARS 路徑>` | 在老闆的 `~/.claude` 全域安裝 ARS | 依 ARS QUICKSTART，在每個論文資料夾的 `.claude/skills/` 建 symlink |
| 優點 | 只有出版部載入 ARS，部門邊界清楚；Hub 不內附 ARS 檔案，符合 CC BY-NC 授權說明；更新 ARS 只要換資料夾 | Hub 不用改程式碼 | Hub 不用改程式碼 |
| 缺點 | 要改 spawn 參數與設定頁（可能涉及 IPC 四方同步）；PM-010 教訓：CLI 參數要用 `--debug` 實證真的被載入 | **所有** agent session（含工程部）都會載入 ARS 的 skills 和 hooks，污染其他部門、多耗 token | Windows symlink 需要開發者模式或管理員權限；每開一篇論文都要手動做一次；容易漏 |
| 成本 | 中：spawn helper + 設定欄位 + 測試 + 文件 | 低 | 每篇論文都有人工成本 |

**建議：選項 A。**

---

## 不需決策、但實作必須遵守的約束

1. **操作員 session 必須是互動模式**（不能用 `-p` 非互動模式），ARS 每個檢查點才能直接交給老闆回覆（README「流程中不插手」）。
2. **任何 agent 都不能代答檢查點**，操作員的 prompt 要明文禁止。
3. **ARS 路徑未設定或不存在時**，要清楚報錯並提示安裝方式，不能靜默啟動一個沒有 ARS 的操作員。
4. **授權**：CC BY-NC 4.0，僅限非商業用途。Hub 不內附、不複製 ARS 檔案。若 Hub 將來商業化，要重新評估這個決策。

## 風險驗證紀錄

2026-09-27 載入測試（Claude Code 2.1.283，`--model haiku --plugin-dir <ARS> --settings <file> --debug-file`，-p 非互動）：

| 風險 | 結果 |
|------|------|
| `--plugin-dir` 與 `--settings` 並用能否載入 | ✅ 已驗證：debug log「Loaded inline plugin from path: academic-research-skills」 |
| 4 個核心 skill 能否載入 | ⚠️ 原本「Loaded 0 skills」：zip 解壓讓 `skills/` 的 git symlink 變成純文字 stub（PM-015）。stub 換成實體資料夾後「Loaded 4 skills」✅。Hub 啟動前要做完整性檢查（backlog PM-015） |
| ARS SessionStart hook 在 Windows 能否執行 | ✅ 已驗證：「Hook SessionStart:startup success」 |
| `--mcp-config` 並用 | ⏳ 未驗證（測試沒加 MCP），實作時用真實 Hub 啟動驗證 |
| ARS `PreToolUse` guard（`run_guard.sh`）與 Hub hooks 衝突 | ⏳ 未驗證（-p 單回合沒觸發工具呼叫），實作時驗證 |
| `~/.claude/plugins/data/academic-research-skills-inline/` 空目錄 | 用 `--plugin-dir` 載入時 CLI 會建立 inline plugin 的 data 目錄，推測是之前某次載入產生的。無害 |

---

## 影響

- **文件**：新增 `agents/definitions/academic-publication/publication-operator.md`；更新 `research-director.md`（`manages`）、`.knowledge/academic/department-structure.md`（升 v2.0，加出版部與跨部門約束）、`agent-prompts.md`；完成後把 README 的 🚧 改成 ✅。
- **程式碼**：`agent-loader.ts` 加部門名稱和顏色；`session-spawn-helpers.ts` 在啟動操作員時加 `--plugin-dir`；設定頁加「ARS 路徑」（如果需要新增 IPC，要四方同步）。
- **測試**：agent-loader 載入新部門；spawn 參數只在操作員 session 出現；路徑不存在時報錯；外加一次真實啟動，實證 ARS 指令可以用。

## 批准後的執行計畫

1. 建立 `proposal/` 下的「ARS 整合」dev-plan，執行 `/task-delegation` 拆任務。
2. **批次 1（文件／角色）**：部門與角色定義檔、總監管轄、規格文件。
3. **批次 2（程式碼）**：派 backend-architect 處理 loader、spawn 參數、設定欄位和測試；如有 UI，由 frontend-developer 處理設定頁。
4. 經 `/review`（對程式碼加對規範）後提交 Gate；由 fresh-context agent 驗收，並附 preflight 輸出。

---

**老闆決策**:
- D1：[x] 選項 A（新部門）/ [ ] 選項 B（掛研究部）/ [ ] 其他
- D2：[x] 選項 A（`--plugin-dir`）/ [ ] 選項 B（全域安裝）/ [ ] 選項 C（symlink）/ [ ] 其他
