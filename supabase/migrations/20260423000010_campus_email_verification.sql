alter table public.profiles
  add column if not exists signup_email text;

create or replace function public.is_university_email(email text)
returns boolean
language plpgsql
immutable
as $$
declare
  domain text := lower(split_part(email, '@', 2));
  university_domains text[] := array[
    'unilag.edu.ng','oauife.edu.ng','abu.edu.ng','unn.edu.ng',
    'uniben.edu.ng','ui.edu.ng','futa.edu.ng','lautech.edu.ng',
    'unilorin.edu.ng','fuoye.edu.ng','jabu.edu.ng','mouau.edu.ng',
    'aue.edu.ng','covenant.edu.ng','babcock.edu.ng','aun.edu.ng',
    'run.edu.ng','bells.edu.ng','afe.edu.ng',
    'ug.edu.gh','knust.edu.gh','uds.edu.gh','ucc.edu.gh',
    'uhas.edu.gh','upsa.edu.gh','gimpa.edu.gh',
    'uct.ac.za','wits.ac.za','sun.ac.za','up.ac.za','uj.ac.za',
    'ukzn.ac.za','ru.ac.za','nwu.ac.za','ufs.ac.za','uwc.ac.za',
    'unisa.ac.za','cput.ac.za','dut.ac.za','tut.ac.za','cut.ac.za',
    'uonbi.ac.ke','ku.ac.ke','jkuat.ac.ke','egerton.ac.ke',
    'strathmore.edu','usiu.ac.ke',
    'mak.ac.ug','must.ac.ug','iuiu.ac.ug','kyu.ac.ug',
    'udsm.ac.tz','ardhi.ac.tz','sua.ac.tz','out.ac.tz',
    'aau.edu.et','ju.edu.et','hu.edu.et',
    'ur.ac.rw','ines.ac.rw',
    'univ-fhb.edu.ci','inphb.edu.ci',
    'ucad.edu.sn','ugb.edu.sn',
    'univ-yaounde1.cm','univ-douala.cm'
  ];
  listed_domain text;
begin
  if email is null or position('@' in email) = 0 then
    return false;
  end if;

  foreach listed_domain in array university_domains loop
    if domain = listed_domain or domain like ('%.' || listed_domain) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
  counter integer := 0;
  auto_verified boolean;
begin
  base_username := lower(split_part(new.email, '@', 1));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  final_username := base_username;

  while exists (select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  auto_verified := public.is_university_email(new.email);

  insert into public.profiles (
    id,
    username,
    full_name,
    university,
    signup_email,
    verified,
    verified_type
  )
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    new.email,
    auto_verified,
    case when auto_verified then 'student' else null end
  );

  return new;
end;
$$;
