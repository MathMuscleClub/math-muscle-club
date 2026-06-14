-- Supabase SQL Editorで実行するドメイン制限用SQLです。
-- example.ac.jp を許可したいGoogle/メールアカウントのドメインに置き換えてください。

create or replace function public.is_allowed_auth_email(email text)
returns boolean
language sql
immutable
as $$
    select case
        when email is null or position('@' in email) = 0 then false
        else lower(split_part(email, '@', 2)) = any (array[
            'example.ac.jp'
        ]::text[])
    end;
$$;

create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
    user_email text;
begin
    user_email := event->'user'->>'email';

    if public.is_allowed_auth_email(user_email) then
        return '{}'::jsonb;
    end if;

    return jsonb_build_object(
        'error', jsonb_build_object(
            'http_code', 403,
            'message', 'このメールアドレスでは登録できません。'
        )
    );
end;
$$;

grant execute
on function public.hook_restrict_signup_by_email_domain
to supabase_auth_admin;

grant execute
on function public.is_allowed_auth_email(text)
to supabase_auth_admin, authenticated;

revoke execute
on function public.hook_restrict_signup_by_email_domain
from anon, authenticated, public;

revoke execute
on function public.is_allowed_auth_email(text)
from anon, public;

-- 書き込みテーブルを作った後のRLS例です。
-- public.exam_submissions は実際のテーブル名に変えてください。
--
-- alter table public.exam_submissions enable row level security;
--
-- create policy "allowed domain can insert exam submissions"
-- on public.exam_submissions
-- for insert
-- to authenticated
-- with check (
--     public.is_allowed_auth_email((select auth.jwt() ->> 'email'))
-- );
--
-- create policy "allowed domain can update own exam submissions"
-- on public.exam_submissions
-- for update
-- to authenticated
-- using (
--     public.is_allowed_auth_email((select auth.jwt() ->> 'email'))
-- )
-- with check (
--     public.is_allowed_auth_email((select auth.jwt() ->> 'email'))
-- );
