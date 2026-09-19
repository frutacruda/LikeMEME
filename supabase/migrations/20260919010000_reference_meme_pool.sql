-- Register the production reference meme pool without changing the five-round flow.

insert into public.memes (id, reference_image_path, key_category, active)
values
  ('likememe-meme-01', '/reference-memes/likememe-meme-01.png', 'pose', true),
  ('likememe-meme-02', '/reference-memes/likememe-meme-02.png', 'expression', true),
  ('likememe-meme-03', '/reference-memes/likememe-meme-03.png', 'expression', true),
  ('likememe-meme-04', '/reference-memes/likememe-meme-04.png', 'pose', true),
  ('likememe-meme-05', '/reference-memes/likememe-meme-05.png', 'pose', true),
  ('likememe-meme-06', '/reference-memes/likememe-meme-06.png', 'expression', true),
  ('likememe-meme-07', '/reference-memes/likememe-meme-07.png', 'pose', true),
  ('likememe-meme-08', '/reference-memes/likememe-meme-08.png', 'expression', true),
  ('likememe-meme-09', '/reference-memes/likememe-meme-09.png', 'pose', true),
  ('likememe-meme-10', '/reference-memes/likememe-meme-10.png', 'pose', true),
  ('likememe-meme-11', '/reference-memes/likememe-meme-11.png', 'expression', true),
  ('likememe-meme-12', '/reference-memes/likememe-meme-12.png', 'pose', true),
  ('likememe-meme-13', '/reference-memes/likememe-meme-13.png', 'pose', true),
  ('likememe-meme-14', '/reference-memes/likememe-meme-14.png', 'expression', true),
  ('likememe-meme-15', '/reference-memes/likememe-meme-15.png', 'pose', true),
  ('likememe-meme-16', '/reference-memes/likememe-meme-16.png', 'expression', true)
on conflict (id) do update set
  reference_image_path = excluded.reference_image_path,
  key_category = excluded.key_category,
  active = excluded.active;

-- Keep the previously validated development assets available for rollback and
-- historical rounds, but remove them from new game selection.
update public.memes
set active = false
where id in (
  'round-1-test',
  'round-test-laugh',
  'round-test-point',
  'round-test-balance',
  'round-test-style'
);
