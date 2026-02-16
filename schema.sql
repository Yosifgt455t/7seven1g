-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create rooms table
create table if not exists rooms (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null,
  game_type text not null, -- 'misere', 'circular', 'moving', etc.
  status text default 'waiting', -- 'waiting', 'playing', 'finished'
  created_at timestamp with time zone default now(),
  player1_id uuid, -- Client generated UUID for player 1
  player1_name text, -- Name of player 1
  player2_id uuid, -- Client generated UUID for player 2
  player2_name text, -- Name of player 2
  current_turn uuid, -- ID of the player whose turn it is
  board_state jsonb default '{}'::jsonb, -- Flexible JSON for different game states
  last_move jsonb, -- Details of the last move for animation sync
  winner uuid -- ID of the winning player, or null
);

-- Enable Realtime
alter publication supabase_realtime add table rooms;

-- RLS Policies (Simplified for demo - ideally would use auth.uid())
alter table rooms enable row level security;

-- Allow anyone to read rooms (needed to join by code)
create policy "Public read access"
on rooms for select
to public
using (true);

-- Allow anyone to create a room
create policy "Public create access"
on rooms for insert
to public
with check (true);

-- Allow players to update the room (join, make move)
create policy "Public update access"
on rooms for update
to public
using (true);
