-- natsu-enikki: 日記エントリの保存用テーブル
-- Supabaseダッシュボードの「SQL Editor」に貼り付けて実行してください。

create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  style_key text,
  artwork_kind text,
  artwork_data text,
  created_at timestamptz not null default now()
);

-- 既存テーブルに絵(artwork)保存用の列を追加する場合はこちら(マイページ機能追加時)
alter table diary_entries add column if not exists artwork_kind text;
alter table diary_entries add column if not exists artwork_data text;

alter table diary_entries enable row level security;

create policy "select_own_diary_entries"
  on diary_entries for select
  using (auth.uid() = user_id);

create policy "insert_own_diary_entries"
  on diary_entries for insert
  with check (auth.uid() = user_id);

create policy "delete_own_diary_entries"
  on diary_entries for delete
  using (auth.uid() = user_id);

-- 「Automatically expose new tables」をOFFにしている場合、Data APIロールへの
-- 権限付与が自動で行われないため、明示的にGRANTする（RLSは上記ポリシーで別途制御）
grant select, insert, delete on diary_entries to authenticated;
