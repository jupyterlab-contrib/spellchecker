try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn("Importing 'jupyterlab-spellchecker' outside a proper installation.")
    __version__ = "dev"

from .handlers import setup_handlers


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "@jupyterlab-contrib/spellchecker"
    }]


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_spellchecker"}]


def _load_jupyter_server_extension(server_app):
    """Registers the API handler to receive HTTP requests from the frontend extension.
    Parameters
    ----------
    server_app: jupyterlab.labapp.LabApp
        JupyterLab application instance
    """

    # use spellchecker instead of jupyterlab_spellchecker , gives a short URL ;-)
    url_path = "spellchecker"
    setup_handlers(server_app.web_app, url_path, server_app)
    server_app.log.info(
        f"Registered jupyterlab_spellchecker extension at URL path /{url_path}"
    )


# For backward compatibility with the classical notebook
load_jupyter_server_extension = _load_jupyter_server_extension
