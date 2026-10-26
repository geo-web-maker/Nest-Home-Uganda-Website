#!/usr/bin/env python3
"""Generate care environment variable documentation from the registry."""
import argparse
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.modules.settings.care_keys import CARE_SETTINGS
from app.modules.settings.care_env import env_name

def outputs():
    rows=[]
    for key,spec in sorted(CARE_SETTINGS.items(),key=lambda item:(not item[1].required_before_go_live,item[0])):
        default=repr(spec.default)
        rows.append((env_name(key),key,spec.type,default,'Yes' if spec.required_before_go_live else 'No',spec.group))
    env=['# BEGIN CARE SETTINGS','# Care settings override registry defaults. Empty values fall through to the next layer.']
    for name,key,kind,default,required,group in rows: env += [f'# {name}: {key}; type={kind}; default={default}; required_before_go_live={required}',f'{name}=']
    env += ['# END CARE SETTINGS']
    md=['# Care environment variables','', 'Generated from `backend/app/modules/settings/care_keys.py`. Empty values use the built-in default unless the setting is owner-supplied text, which remains missing.','', '| Variable | Setting key | Type | Default | Required before go-live | Group |','|---|---|---|---|---|---|']
    md += [f'| `{a}` | `{b}` | {c} | `{d}` | {e} | {g} |' for a,b,c,d,e,g in rows]
    return '\n'.join(env)+'\n','\n'.join(md)+'\n'
def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args(); env,md=outputs(); env_path=ROOT/'.env.example'; doc_path=ROOT/'docs/ENV_CARE_VARS.md'
    current=env_path.read_text() if env_path.exists() else ''
    begin='# BEGIN CARE SETTINGS'; end='# END CARE SETTINGS'
    if begin in current and end in current: current=current[:current.index(begin)].rstrip()+'\n\n'+current[current.index(end)+len(end):].lstrip()
    merged=current.rstrip()+'\n\n'+env+'\n'
    if args.check:
        if not env_path.exists() or env_path.read_text()!=merged or not doc_path.exists() or doc_path.read_text()!=md: raise SystemExit('Care environment docs are stale; run python scripts/gen_env_docs.py')
    else: env_path.write_text(merged); doc_path.write_text(md)
if __name__=='__main__': main()
