-- 017: PM-008 worktree 隔離 — 記錄每個 session 實際工作目錄與分支
-- work_dir: session PTY 的 cwd（worktree 路徑或專案根目錄）。resume 時必須回到同一目錄，
--           否則 Claude CLI 依 cwd 編碼尋找 conversation JSONL 會找不到
-- git_branch: worktree 綁定的分支，GUI 顯示用
ALTER TABLE claude_sessions ADD COLUMN work_dir TEXT;
ALTER TABLE claude_sessions ADD COLUMN git_branch TEXT;
