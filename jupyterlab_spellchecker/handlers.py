from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

import tornado
from tornado.web import StaticFileHandler

from .dictionaries import discover_dictionaries, dictionaries_to_url
from ._version import __version__


class LanguageManagerHandler(APIHandler):

    lang_dictionaries = []

    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish({
            'version': __version__,
            'dictionaries': self.lang_dictionaries
        })


def setup_handlers(web_app, url_path, server_app):
    dictionaries = discover_dictionaries(server_app)
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Prepend the base_url so that it works in a JupyterHub setting
    handlers = []
    for lang in dictionaries:
        lang_url = url_path_join(base_url, url_path, lang['id'])
        handlers.append(
            (
                r"{}/(.*\.(?:aff|dic))".format(lang_url),
                StaticFileHandler,
                {"path": lang['path']}
             )
        )
    web_app.add_handlers(host_pattern, handlers)

    LanguageManagerHandler.lang_dictionaries = dictionaries_to_url(dictionaries, url_path_join(base_url, url_path))

    # Prepend the base_url so that it works in a JupyterHub setting
    route_pattern = url_path_join(base_url, url_path, "language_manager")
    handlers = [(route_pattern, LanguageManagerHandler)]
    web_app.add_handlers(host_pattern, handlers)