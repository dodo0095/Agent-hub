# AgentHub — Agent 指南（索引）

> 本文件是地圖，不是百科全書。原則：**一條規則只活在一個地方，這裡只放路由**（4 條致命規則例外，屬防禦性冗餘）。
> **所有 Agent 執行任務前必須先讀本文件，再依「按情境路由」表查對應文件。**

## 執行環境（Windows 陷阱——錯了會觸發重試迴圈）
- OS: Windows 11，無 WSL；Shell: bash (Git Bash)。**禁用** cmd.exe、PowerShell 語法、findstr、python3
- Python: `C:\Users\Bandai\anaconda3\python.exe`（叫 `python`）；Node: `C:\Program Files\nodejs\node.exe`
- 路徑常含空格（`ALL PROJECT`），指令中的路徑一律加雙引號

## 專案簡介
- **AgentHub (Maestro v2)** — Electron 桌面應用，AI Agent 團隊管理平台；用戶 = 老闆（一人公司創辦人）
- 核心價值: 用 Harness（Skill + Hook + FileWatcher）驅動虛擬開發公司，GUI 只做監控

## 最高原則（4 條致命規則）
1. **文件就是法律** — 程式碼與規範不一致時，以文件為準 → `.knowledge/doc-governance.md`
2. **IPC 四方同步** — `ipc.ts` → `preload.ts` → `useIpc.ts` → `env.d.ts` 缺一不可 → `.knowledge/architecture.md`
3. **不確定就去讀，不要猜** — 每種問題該讀哪個真相來源，查 `.knowledge/decision-tables.md` 表 4
4. **完成 = 證據** — 宣告完成前跑 `node scripts/preflight.cjs` 貼輸出；證據等級查 decision-tables 表 1

> 硬約束由 hook 強制（清單見 `.claude/settings.json`）；SessionStart 自動注入決策摘要與踩坑快速參考，不需要自己背。

## 模型調度與委派（指揮官必讀）
- **指揮官不下場**：大量讀取、掃 repo、查網頁、批次改檔一律派 subagent，主對話只收結論與 `檔案:行號`
- 派工前抄模板：`.knowledge/harness/delegation-templates.md`；完整守則：`.knowledge/harness/model-dispatch.md`
- **驗收不自驗**：完成宣告由 fresh-context agent 驗證，方法見 model-dispatch「驗證不自驗」節

## 兩份 Clone（獨立 repo，非 worktree）
| 路徑 | 角色 | Agent 可否寫入 |
|------|------|:--:|
| `ALL PROJECT\Agent-hub\` | **Dev** — 所有開發、測試、commit 都在這 | ✅ |
| `Desktop\AgentHub\Agent-hub\` | **Verify-only** — 老闆 `git pull` 驗證用 | ❌（hook 硬擋） |

流程：Dev 開分支（`agent/<id>/...`，base main）→ 測試 → commit → merge main → push → 老闆在 Verify pull。多 session 一律用 worktree 隔離（PM-008）。

## 常用指令
```bash
npm run dev / test / lint / typecheck / build
node scripts/preflight.cjs          # 完成證據產生器（/task-done 前必跑）
node scripts/smoke-test-hooks.cjs   # 修改 hook 後必跑（修改前先查 decision-tables 表 7 前置條件）
```

## 按情境路由（先查這張表，再讀對應文件）
| 你正要… | 先讀 |
|---------|------|
| 做需要「判斷」的事（除錯熔斷、升級、警報回應、完成標準） | `.knowledge/decision-tables.md`（查表執行，不靠感覺） |
| 開工前想知道有沒有人踩過這個坑 | `.knowledge/postmortem-log.md` 頂部快速參考表 |
| 派任務給 subagent、選模型 | `.knowledge/harness/model-dispatch.md` ＋ `delegation-templates.md` |
| 拿不準：要不要升級模型／停下來問老闆／換路不重試 | `.knowledge/harness/judgment-rubrics.md` |
| 修改 CLAUDE.md、hook、`.knowledge/` 制度檔案 | `.knowledge/harness/maintenance-protocol.md`（先查權限分級） |
| 了解 harness 已知弱點與歷史脈絡 | `.knowledge/harness/diagnosis.md`、`letter-to-future-sessions.md` |

## 文件索引（依需查閱，不必預讀）
- **專案規範（`.knowledge/`）**: `project-overview`（概述與技術棧）· `architecture`（系統架構、IPC、Cost Tracking）· `directory-structure` · `coding-standards` · `testing-standards` · `quality-checklist`（G0-G6）· `doc-governance`（文件治理 8 條）· `design-system`（UI token）· `team-hierarchy` · `company-rules` · `team-workflow`（Sprint／Gate／Review）· `postmortem-common`（跨專案踩坑）
- **學術研究部門**: `.knowledge/academic/`（7 位學術 Agent prompt、venue 清單、學者檔案、SOP ×4）＋ `.knowledge/specs/`（api-design ／ data-model ／ feature-spec）
- **公司層（`.knowledge/company/`）**: SOP、standards、templates、hook-templates。制度推廣到其他子專案用 `/knowledge-feedback`，不要手動 cp
