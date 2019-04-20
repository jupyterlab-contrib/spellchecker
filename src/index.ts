import {
    JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';


import {
    INotebookTracker
} from '@jupyterlab/notebook';


import {
  ICommandPalette
} from '@jupyterlab/apputils';


import '../style/index.css';

import * as CodeMirror from 'codemirror';
import {Cell} from "@jupyterlab/cells";

declare function require(name:string): any;
let Typo = require("typo-js");

/**
 * SpellChecker
 */
class SpellChecker {
    dictionary: any;
    dict_promise: any;
    app: JupyterLab;
    tracker: INotebookTracker;
    palette: ICommandPalette;

    // Default Options
    check_spelling: boolean = true;
    aff_url: string = 'https://cdn.jsdelivr.net/codemirror.spell-checker/latest/en_US.aff';
    dict_url: string = 'https://cdn.jsdelivr.net/codemirror.spell-checker/latest/en_US.dic';
    lang_code: string = "en_Us";
    rx_word_char: RegExp     = /[^-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;
    rx_non_word_char: RegExp =  /[-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;

    constructor(app: JupyterLab, tracker: INotebookTracker, palette: ICommandPalette){
        this.app = app;
        this.tracker = tracker;
        this.palette = palette;
        this.setup_button();
        this.load_dictionary();
        this.tracker.activeCellChanged.connect(this.onActiveCellChanged, this);
    }

    onActiveCellChanged(): void {
        let active_cell = this.tracker.activeCell;

        this.connectCell(active_cell);
    }

    connectCell(active_cell: Cell, retry=true): void {
        if ((active_cell !== null) && (active_cell.model.type == "markdown")){
            let editor_temp: any = active_cell.editor;
            let editor: any = editor_temp._editor;
            let current_mode: string = editor.getOption("mode");

            if (current_mode == "null"){
                if (retry) {
                    // re-try to set the spellcheck mode once, adding a new call to connectCell
                    // at the very end of the JavaScript execution queue (using setTimeout(..., 0))
                    // allowing the mode option to be set in the meantime
                    setTimeout(() => {
                        this.connectCell(active_cell, false);
                        return true
                    }, 0);
                }
                return;
            }

            if (this.check_spelling){
                editor.setOption("mode", this.define_mode(current_mode));
            }else{
                let original_mode = (current_mode.match(/^spellcheck_/)) ? current_mode.substr(11) : current_mode
                editor.setOption("mode", original_mode);
            }
        }
    }

    toggle_spellcheck(){
        this.check_spelling = ! this.check_spelling;
        console.log("Spell checking is currently: ", this.check_spelling);
    }

    setup_button(){
        const command = "spellchecker:toggle-check-spelling";
        this.app.commands.addCommand(command,{
            label: "Check Spelling",
            execute: () => {
                this.toggle_spellcheck();
            }
        });
        this.palette.addItem( {command, category: "Toggle Spell Checker"} );
    }

    load_dictionary(){
        this.dict_promise = Promise.all([
            fetch(this.aff_url).then(res=>res.text()),
            fetch(this.dict_url).then(res=>res.text())
        ]).then((values) => {
            this.dictionary = new Typo(this.lang_code, values[0], values[1]);
            console.log("Dictionary Loaded ", this.lang_code);
        });
    }

    define_mode = (original_mode_spec: string) => {
        if (original_mode_spec.indexOf("spellcheck_") == 0){
            return original_mode_spec;
        }
        var me = this;
        var new_mode_spec = 'spellcheck_' + original_mode_spec;
        CodeMirror.defineMode(new_mode_spec, (config:any) => {
            var spellchecker_overlay = {
                name: new_mode_spec,
                token: function (stream:any, state:any) {
                    if (stream.eatWhile(me.rx_word_char)){
		        var word = stream.current().replace(/(^')|('$)/g, '');
		        if (!word.match(/^\d+$/) && (me.dictionary !== undefined) && !me.dictionary.check(word)) {
		            return 'spell-error';
                        }
                    }

                    stream.eatWhile(me.rx_non_word_char);
                    return null;
                }
            };
            return CodeMirror.overlayMode(
                CodeMirror.getMode(config, original_mode_spec), spellchecker_overlay, true);
        });
        return new_mode_spec;
    }
}


/**
 * Activate extension
 */
function activate(app: JupyterLab, tracker: INotebookTracker, palette: ICommandPalette) {
    console.log('Attempting to load spellchecker');
    const sp = new SpellChecker(app, tracker, palette);
    console.log("Spellchecker Loaded ", sp);
};


/**
 * Initialization data for the jupyterlab_spellchecker extension.
 */
const extension: JupyterLabPlugin<void> = {
    id: 'jupyterlab_spellchecker',
    autoStart: true,
    requires: [INotebookTracker, ICommandPalette],
    activate: activate
};

export default extension;
