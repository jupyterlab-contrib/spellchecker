import os
import json

from notebook.base.handlers import APIHandler
from notebook.utils import url_path_join

import tornado
from tornado.web import StaticFileHandler

from jupyter_core.paths import jupyter_path

from .dictionaries import list_of_dictionaries, dictionaries2url


lang_dictionaries = []


class LanguageManagerHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps(lang_dictionaries))


def setup_handlers(web_app, url_path, server_app):
    global lang_dictionaries

    languages = list_of_dictionaries()
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Prepend the base_url so that it works in a JupyterHub setting
    handlers = []
    for lang in languages:
        lang_url = url_path_join(base_url, url_path, lang['code'])
        #handlers.append(("{}/(.*\.((aff)|(dic)))".format(lang_url), StaticFileHandler, {"path": lang_dictionaries[lang]['path']}))
        handlers.append(("{}/(.*)".format(lang_url),
                        StaticFileHandler, {"path": lang['path']}))
        lang.pop('path')  # remove unnecessary path entry
    web_app.add_handlers(host_pattern, handlers)


    lang_dictionaries += dictionaries2url(languages, url_path_join(base_url, url_path))

    # Prepend the base_url so that it works in a JupyterHub setting
    route_pattern = url_path_join(base_url, url_path, "language_manager")
    handlers = [(route_pattern, LanguageManagerHandler)]
    web_app.add_handlers(host_pattern, handlers)
