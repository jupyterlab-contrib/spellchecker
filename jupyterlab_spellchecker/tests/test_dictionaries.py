import pytest

from jupyterlab_spellchecker.dictionaries import _extract_code


@pytest.mark.parametrize(
    'stripped_name, expected_code',
    [
        # frami matches as a variant
        ['de_AT_frami', 'de-AT-frami'],
        ['en_GB-ise', 'en-GB'],
        ['pl', 'pl'],
        ['a', None],
        ['THIS-IS-NOT-A-CODE', None],
        ['sr-Cyrl-BA', 'sr-Cyrl-BA'],
        ['sr-Latn-BA', 'sr-Latn-BA'],
        ['de-CH-1901', 'de-CH-1901'],
        ['hy-Latn-IT-arevela', 'hy-Latn-IT-arevela'],
        ['sl-rozaj-biske', 'sl-rozaj-biske']
    ],
)
def test_code_detection(stripped_name, expected_code):
    assert _extract_code(stripped_name) == expected_code

