-- Run this entire file in your Supabase project's SQL editor
-- Dashboard -> SQL Editor -> New query -> paste -> Run

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text not null,
  avatar_color text not null default '#8b5cf6',
  created_at timestamptz default now()
);

-- Opinions
create table opinions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  text text not null check (char_length(text) between 1 and 280),
  intensity text not null check (intensity in ('soft', 'hard')),
  topic text not null,
  agrees_count int not null default 0,
  disagrees_count int not null default 0,
  debates_count int not null default 0,
  created_at timestamptz default now()
);

-- Votes (one per user per opinion)
create table votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  opinion_id uuid references opinions(id) on delete cascade not null,
  vote_type text not null check (vote_type in ('agree', 'disagree')),
  created_at timestamptz default now(),
  unique(user_id, opinion_id)
);

-- Debate replies
create table debate_replies (
  id uuid primary key default gen_random_uuid(),
  opinion_id uuid references opinions(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  text text not null check (char_length(text) between 1 and 280),
  created_at timestamptz default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Atomic vote handler (agree/disagree/unvote)
create or replace function handle_vote(
  p_opinion_id uuid,
  p_user_id uuid,
  p_vote_type text
) returns void as $$
declare
  existing_vote text;
begin
  select vote_type into existing_vote
  from votes
  where user_id = p_user_id and opinion_id = p_opinion_id;

  if existing_vote is not null then
    if existing_vote = 'agree' then
      update opinions set agrees_count = agrees_count - 1 where id = p_opinion_id;
    else
      update opinions set disagrees_count = disagrees_count - 1 where id = p_opinion_id;
    end if;

    if existing_vote = p_vote_type then
      delete from votes where user_id = p_user_id and opinion_id = p_opinion_id;
      return;
    end if;

    update votes set vote_type = p_vote_type
    where user_id = p_user_id and opinion_id = p_opinion_id;
  else
    insert into votes (user_id, opinion_id, vote_type)
    values (p_user_id, p_opinion_id, p_vote_type);
  end if;

  if p_vote_type = 'agree' then
    update opinions set agrees_count = agrees_count + 1 where id = p_opinion_id;
  else
    update opinions set disagrees_count = disagrees_count + 1 where id = p_opinion_id;
  end if;
end;
$$ language plpgsql security definer;

-- Row Level Security
alter table profiles enable row level security;
alter table opinions enable row level security;
alter table votes enable row level security;
alter table debate_replies enable row level security;

create policy "Profiles readable by all"     on profiles for select using (true);
create policy "Users insert own profile"      on profiles for insert with check (auth.uid() = id);
create policy "Users update own profile"      on profiles for update using (auth.uid() = id);

create policy "Opinions readable by all"      on opinions for select using (true);
create policy "Auth users post opinions"      on opinions for insert with check (auth.uid() = user_id);
create policy "Users update own opinions"     on opinions for update using (auth.uid() = user_id);
create policy "Users delete own opinions"     on opinions for delete using (auth.uid() = user_id);

create policy "Votes readable by all"         on votes for select using (true);
create policy "Auth users vote"               on votes for insert with check (auth.uid() = user_id);
create policy "Users change own vote"         on votes for update using (auth.uid() = user_id);
create policy "Users remove own vote"         on votes for delete using (auth.uid() = user_id);

create policy "Replies readable by all"       on debate_replies for select using (true);
create policy "Auth users reply"              on debate_replies for insert with check (auth.uid() = user_id);
create policy "Users delete own replies"      on debate_replies for delete using (auth.uid() = user_id);
