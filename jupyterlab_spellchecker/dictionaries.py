import os
import json

from pathlib import Path

from jupyter_core.paths import jupyter_path
from notebook.utils import url_path_join

def _resolve_language(dp, lang):
    code = lang['code']
    lang['path'] = dp

    return lang


def _scan_for_dictionaries(data_path):
    p = Path(data_path)
    lang_jsons = list(p.glob('**/lang.json'))
    languages = []
    if lang_jsons:
        for djson in lang_jsons:
            parent = djson.parent
            with djson.open() as f:
                try:
                    data = json.load(f)
                    if 'languages' in data:
                        for ldata in data['languages']:
                            lang = _resolve_language(parent, ldata)
                            languages.append(lang)
                    else:
                        lang = _resolve_language(parent, data)
                        languages.append(lang)
                except json.JSONDecodeError as e:
                    print(e)
    return languages


def list_of_dictionaries():
    data_path = jupyter_path()
    languages = []
    for dp in data_path:
        languages += _scan_for_dictionaries(dp)
    return languages


def dictionaries2url(languages, base_url):
    for lang in languages:
        code = lang['code'] 
        lang['aff'] = url_path_join(base_url, code, str(lang['aff']))
        lang['dic'] = url_path_join(base_url, code, str(lang['dic']))

    return languages
        
