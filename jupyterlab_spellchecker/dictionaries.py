import logging
import platform
import re
from pathlib import Path

import babel
from jupyter_core.application import JupyterApp
from jupyter_core.paths import jupyter_path
from jupyter_server.utils import url_path_join


OS_SPECIFIC_PATHS = {
    'Linux': [
        '/usr/share/hunspell',
        '/usr/share/myspell',
        '/usr/share/myspell/dicts'
    ],
    'Darwin': [
        '/System/Library/Spelling'
    ],
    'Windows': [
        # TODO - contributions welcome
    ]
}


def _extract_code(filename):
    """Extract BCP 47 code identifier (tolerate small deviations from spec for user convenience).

    The regular expression is not exact, but should work for most use cases
    See: https://datatracker.ietf.org/doc/html/rfc5646#section-2.1
    """
    match = re.search(
        # must start with two or three letter code
        r'^('
        r'(?:\w{2,3}(?=[-_]|$))'
        # optional script (ISO 15924 code)
        r'(?:[-_][A-Z][a-z]{3}(?=[-_]|$))?'
        # optional region, either two letter ISO 3166-1, or three digit UN M.49
        # e.g. "US" in "en-US", or "419" in "es-419")
        r'(?:[-_](?:[A-Z]{2}|\d{3})(?=[-_]|$))?'
        # optional variants (e.g. se-rozaj-biske has two variants, while de-CH-1901 has digit-defined variant see RFC)
        r'(?:[-_](?:\w{5,8}|\d{4})(?=[-_]|$))*'
        r')'
        # any other suffix (not part of the match)
        r'.*?',
        filename
    )
    if match:
        return match.group(1).replace('_', '-')


def _scan_for_dictionaries(data_path, log: logging.Logger):
    p = Path(data_path)
    lang_files = list(p.glob('*.dic'))
    languages = []
    previous_identifiers = set()
    for dic_path in lang_files:
        path = dic_path.parent

        base_name = dic_path.name[:-4]

        if base_name in previous_identifiers:
            identifier = str(path / base_name)
        else:
            identifier = base_name
        previous_identifiers.add(identifier)

        code = _extract_code(base_name)
        if code is None:
            log.warning(
                f"Could not recognize code for {identifier} dictionary in {path}:"
                f" {base_name} does not match pre-specified regular expression."
            )
            continue
        code = code.replace('-', '_')

        aff_path = path / (base_name + '.aff')

        if not aff_path.exists():
            log.warning(
                f"Could not add {identifier} dictionary from {path}:"
                f" .dic exists ({dic_path}) but could not find matching .aff file."
            )
            continue

        try:
            locale_data = babel.Locale.parse(code)
            display_name = locale_data.get_display_name()
        except ValueError:
            display_name = base_name
            log.warning(
                f"Could not obtain language name for {identifier} dictionary from {path}:"
                f" {code} does not appear to be a valid locale code."
            )
        except babel.core.UnknownLocaleError:
            log.warning(
                f"Could not obtain language name for {identifier} dictionary from {path}:"
                f" {code} is not a known locale in the installed version of babel."
            )
            display_name = base_name
        except Exception as e:
            log.warning(
                f"Could not obtain language name for {identifier} dictionary from {path}:"
                f" {code} crashed babel: {e}."
            )
            display_name = base_name

        languages.append({
            'path': path,
            'code': code,
            'id': identifier,
            'dic': dic_path.name,
            'aff': aff_path.name,
            'name': display_name
        })
    return languages


def discover_dictionaries(server_app: JupyterApp):
    data_paths = jupyter_path('dictionaries')
    system = platform.system()
    if system in OS_SPECIFIC_PATHS:
        data_paths.extend(OS_SPECIFIC_PATHS[system])
    # TODO: maybe use server_app.data_dir?

    server_app.log.info(f"Looking for hunspell dictionaries for spellchecker in {data_paths}")
    dictionaries = []
    for path in data_paths:
        dictionaries.extend(_scan_for_dictionaries(path, server_app.log))

    server_app.log.info(f"Located hunspell dictionaries for spellchecker: {dictionaries}")
    return dictionaries


def dictionaries_to_url(languages, base_url):
    return [
        {
            **{
                k: v
                for k, v in lang.items()
                if k not in {'path'}
            },
            'aff': url_path_join(base_url, lang['id'], lang['aff']),
            'dic': url_path_join(base_url, lang['id'], lang['dic'])
        }
        for lang in languages
    ]
